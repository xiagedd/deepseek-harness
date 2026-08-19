/** host.searchEntries lazy workspace index and fuzzy ranking. */
import type { FsDirEntry } from '@deepseek-ai/dsh-fs'
import type { FsEntry } from './api/host.ts'
import {
  isMetaName,
  loadWorkspaceIgnore,
  relativePosix,
  type WorkspaceIgnore,
} from './workspace-ignore.ts'

/** Default result cap when the RPC request omits one. */
const DEFAULT_LIMIT = 200
/** Hard result cap accepted from one RPC request. */
const MAX_LIMIT = 500

interface IndexEntry {
  entry: FsEntry
  relative: string
}

interface CachedIndex {
  abort: AbortController
  ignoreKey: string
  promise: Promise<readonly IndexEntry[]>
}

const indexes = new Map<string, CachedIndex>()

/** Extra weight for aligned characters at separators, word starts, and CamelCase boundaries. */
function boundaryBonus(name: string, index: number): number {
  const prev = name.charAt(index - 1)
  if (index === 0 || prev === '-' || prev === '_' || prev === '/' || prev === '\\' || prev === '.') return 8
  return /[a-z]/.test(prev) && /[A-Z]/.test(name.charAt(index)) ? 7 : 0
}

/** Ordered-subsequence fuzzy score; undefined when `query` is not a subsequence of `name`. */
function fuzzyScore(name: string, query: string): number | undefined {
  if (query === '') return 0
  if (query.length > name.length) return undefined
  const foldedName = name.toLowerCase()
  const foldedQuery = query.toLowerCase()
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array<number>(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index++) {
    if (foldedName.charAt(index) === foldedQuery.charAt(0))
      previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let q = 1; q < query.length; q++) {
    const next = Array<number>(name.length).fill(noMatch)
    let best = noMatch
    for (let index = 0; index < name.length; index++) {
      const previousScore = previous[index]
      if (previousScore !== undefined && previousScore !== noMatch)
        best = Math.max(best, previousScore)
      if (foldedName.charAt(index) === foldedQuery.charAt(q) && best !== noMatch) {
        const adjacent = index > 0 && foldedName.charAt(index - 1) === foldedQuery.charAt(q - 1) ? 10 : 0
        next[index] = best + 1 + boundaryBonus(name, index) + adjacent
      }
    }
    previous = next
  }
  let best = noMatch
  for (const score of previous) {
    if (score !== noMatch) best = Math.max(best, score)
  }
  return best === noMatch ? undefined : best
}

function toFsEntry(row: FsDirEntry): FsEntry {
  return {
    name: row.name,
    path: row.target.displayPath,
    type: row.type,
    hidden: row.name.startsWith('.'),
    ...(row.size !== undefined ? { size: row.size } : {}),
  }
}

interface RankedRow {
  entry: FsEntry
  score: number
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

function waitForIndex(index: Promise<readonly IndexEntry[]>, signal: AbortSignal): Promise<readonly IndexEntry[]> {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const aborted = (): void => { reject(abortError()) }
    signal.addEventListener('abort', aborted, { once: true })
    void index.then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', aborted)
        reject(reason instanceof Error ? reason : new Error(String(reason)))
      },
    )
  })
}

async function buildIndex(
  listDir: (path: string, signal: AbortSignal) => Promise<readonly FsDirEntry[]>,
  rootPath: string,
  rules: WorkspaceIgnore,
  signal: AbortSignal,
): Promise<readonly IndexEntry[]> {
  const stack: string[] = [rootPath]
  const entries: IndexEntry[] = []
  while (stack.length > 0) {
    if (signal.aborted) throw abortError()
    const dirPath = stack.pop()
    if (dirPath === undefined) break
    const rows = await listDir(dirPath, signal)
    for (const row of rows) {
      if (row.type === 'other') continue
      if (row.type !== 'directory' && isMetaName(row.name)) continue
      const entry = toFsEntry(row)
      const relative = relativePosix(rootPath, entry.path)
      if (rules.ignores(relative, row.type === 'directory')) continue
      entries.push({ entry, relative })
      if (row.type === 'directory') stack.push(entry.path)
    }
  }
  return entries
}

function workspaceIndex(
  listDir: (path: string, signal: AbortSignal) => Promise<readonly FsDirEntry[]>,
  rootPath: string,
  rules: WorkspaceIgnore,
): Promise<readonly IndexEntry[]> {
  const existing = indexes.get(rootPath)
  if (existing !== undefined && existing.ignoreKey === rules.sourceKey) return existing.promise
  if (existing !== undefined) {
    existing.abort.abort()
    indexes.delete(rootPath)
  }
  const abort = new AbortController()
  const promise = buildIndex(listDir, rootPath, rules, abort.signal).catch((reason: unknown) => {
    if (indexes.get(rootPath)?.promise === promise) indexes.delete(rootPath)
    throw reason
  })
  indexes.set(rootPath, { abort, ignoreKey: rules.sourceKey, promise })
  return promise
}

/** Invalidate every cached root touched by Host filesystem mutations. */
export function invalidateSearchIndexes(): void {
  for (const cached of indexes.values()) cached.abort.abort()
  indexes.clear()
}

/**
 * Lazily index one workspace root and return fuzzy-ranked file/directory rows.
 * @param listDir - one directory listing from the active filesystem backend.
 * @param readText - read workspace ignore files under the root.
 * @param rootPath - absolute workspace root display path.
 * @param query - trimmed fuzzy query.
 * @param limit - maximum rows to return.
 * @param signal - aborts the walk.
 * @returns ranked entries plus whether the result exceeded the limit.
 */
export async function searchWorkspaceEntries(
  listDir: (path: string, signal: AbortSignal) => Promise<readonly FsDirEntry[]>,
  readText: (path: string) => Promise<string>,
  rootPath: string,
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<{ entries: FsEntry[]; truncated: boolean }> {
  const needle = query.trim()
  const cap = Math.min(Math.max(limit, 1), MAX_LIMIT)
  const showHidden = needle.startsWith('.')
  const rules = await loadWorkspaceIgnore(rootPath, readText)
  const ranked: RankedRow[] = []
  const index = await waitForIndex(workspaceIndex(listDir, rootPath, rules), signal)
  for (const row of index) {
    if (signal.aborted) throw abortError()
    if (row.entry.hidden && !showHidden) continue
    const pathScore = fuzzyScore(row.relative, needle)
    const basenameScore = fuzzyScore(row.entry.name, needle)
    if (pathScore === undefined && basenameScore === undefined) continue
    const score = Math.max(pathScore ?? Number.NEGATIVE_INFINITY, (basenameScore ?? Number.NEGATIVE_INFINITY) * 1.75)
    ranked.push({ entry: row.entry, score })
  }

  ranked.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    return left.entry.name.localeCompare(right.entry.name)
  })
  const truncated = ranked.length > cap
  return { entries: ranked.slice(0, cap).map(row => row.entry), truncated }
}

export { DEFAULT_LIMIT, MAX_LIMIT, loadWorkspaceIgnore }
