/**
 * Workspace-file reference plugin, browser half: registers the '@' source
 * `workspace-file` beside the existing subagent '@' source (unique
 * `(trigger, name)` seats — this does not replace ui-subagent).
 *
 * Empty query and path-segment queries (`src/foo`) still use
 * `IApiClient.host.listEntries({ path, root })` for one-level listing / descent.
 * A non-empty query without `/` or `\` calls `host.searchEntries({ root,
 * query, limit })` — the same RPC and ranking as the explorer search box —
 * so matches span the whole workspace. No client-side walk or second index.
 *
 * Menu rows show basename + gray relative path (`name` / `description`).
 * A pick lands a `ReferenceInsert` chip: label = relative path; ref /
 * clipboard / codec.serialize = host absolute path. No file bytes and no
 * directory tree are uploaded.
 *
 * Listings cache per (session, listed path) with a single-flight fetch
 * whose abort outlives any one menu interaction (same shape as ui-skill).
 * Search calls pass the menu `signal` through and are not cached. Missing
 * cwd or a failed RPC folds to empty / a thrown error the slash shell logs
 * as source-failed — the composer does not crash.
 */
import type { ConnectionHandle, FsEntry, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  InputTriggerCandidate, InputTriggerServiceContract, InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

/** Menu group name; unique per '@' trigger. */
const SOURCE_NAME = 'workspace-file'

/** One directory listing fetch: the shared promise plus its own abort handle. */
interface ListingFetch {
  readonly promise: Promise<readonly FsEntry[]>
  readonly abort: AbortController
}

/** Bound on menu size after filtering one listed level or search hits. */
const MAX_CANDIDATES = 100

/** Bound on `@dir/dir/...` descent (each segment is one listEntries). */
const MAX_SEGMENTS = 16

/** Required services: the '@' roster, session cwd, and host list/search RPCs. */
export const inject = ['inputTriggers', 'connection', 'sessions']

/** Session workspace root from the list snapshot; absent means no workspace. */
function workspaceRoot(sessions: ISessions, sessionId: SessionId): string | undefined {
  const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
  return cwd === undefined || cwd === '' ? undefined : cwd
}

/** Split `@src/foo` into directory segments and the trailing name filter. */
function splitQuery(query: string): { segments: string[]; nameQuery: string } {
  const parts = query.split(/[/\\]/)
  const nameQuery = parts.splice(-1, 1).join('')
  const segments: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    segments.push(part)
  }
  return { segments, nameQuery }
}

/** True when the query names a path segment walk (`src/` or `src\util`). */
function hasPathSeparator(query: string): boolean {
  return query.includes('/') || query.includes('\\')
}

/** Case-insensitive name filter; empty query matches every file and directory on the level. */
function matchesName(name: string, query: string): boolean {
  if (query === '') return true
  return name.toLowerCase().includes(query.toLowerCase())
}

/** Join workspace-relative display segments with `/` (chip / menu spelling). */
function joinRel(prefix: string, name: string): string {
  return prefix === '' ? name : `${prefix}/${name}`
}

/** Workspace-relative POSIX spelling under `root` (same shape as explorer/host). */
function relativePosix(root: string, path: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normPath === normRoot) return ''
  const prefix = `${normRoot}/`
  if (normPath.startsWith(prefix)) return normPath.slice(prefix.length)
  const slash = Math.max(normPath.lastIndexOf('/'), 0)
  return slash >= 0 ? normPath.slice(slash + 1) : normPath
}

/** First directory child whose name matches `segment` (host path, no join). */
function findDirectory(entries: readonly FsEntry[], segment: string): FsEntry | undefined {
  const needle = segment.toLowerCase()
  return entries.find(entry => entry.type === 'directory' && entry.name.toLowerCase() === needle)
}

/**
 * Menu row: basename primary, gray relative path when nested or from search.
 * Duplicate basenames in one batch use the relative path as `name` so React
 * keys stay unique (MenuView keys on `item.name`).
 */
function toCandidate(basename: string, rel: string, duplicateBasename: boolean): InputTriggerCandidate {
  if (duplicateBasename) return rel === basename ? { name: rel } : { name: rel, description: rel }
  return rel === basename
    ? { name: basename }
    : { name: basename, description: rel }
}

/**
 * Client plugin body: register the '@' workspace-file source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const host = (ctx.get('connection') as ConnectionHandle).api.host
  const sessions = ctx.get('sessions') as ISessions
  const fetches = new Map<string, ListingFetch>()
  const absByRel = new Map<string, string>()
  const cacheKey = (sessionId: SessionId, part: string): string => `${sessionId}\0${part}`

  const fetchListing = (sessionId: SessionId, path: string): Promise<readonly FsEntry[]> => {
    const key = cacheKey(sessionId, path)
    const existing = fetches.get(key)
    if (existing !== undefined) return existing.promise
    const abort = new AbortController()
    const promise = (async () => {
      const root = workspaceRoot(sessions, sessionId)
      const { result } = await host.listEntries({
        path,
        ...(root !== undefined ? { root } : {}),
      }, abort.signal)
      if (!result.ok) throw new Error(`host.listEntries failed: ${result.error.code}: ${result.error.message}`)
      return result.value.entries
    })()
    const entry: ListingFetch = { promise, abort }
    fetches.set(key, entry)
    promise.catch(() => { if (fetches.get(key) === entry) fetches.delete(key) })
    return promise
  }

  const remember = (sessionId: SessionId, rel: string, abs: string): void => {
    absByRel.set(cacheKey(sessionId, rel), abs)
  }

  const mapListed = (
    sessionId: SessionId,
    rows: readonly FsEntry[],
    relPrefix: string,
    nameQuery: string,
  ): InputTriggerCandidate[] => {
    const showHidden = nameQuery.startsWith('.')
    const filtered: { entry: FsEntry; rel: string }[] = []
    for (const entry of rows) {
      if (entry.type !== 'file' && entry.type !== 'directory') continue
      if (entry.hidden && !showHidden) continue
      if (!matchesName(entry.name, nameQuery)) continue
      filtered.push({ entry, rel: joinRel(relPrefix, entry.name) })
      if (filtered.length >= MAX_CANDIDATES) break
    }
    const basenameCounts = new Map<string, number>()
    for (const row of filtered) {
      basenameCounts.set(row.entry.name, (basenameCounts.get(row.entry.name) ?? 0) + 1)
    }
    const items: InputTriggerCandidate[] = []
    for (const row of filtered) {
      remember(sessionId, row.rel, row.entry.path)
      items.push(toCandidate(row.entry.name, row.rel, (basenameCounts.get(row.entry.name) ?? 0) > 1))
    }
    return items
  }

  const mapSearch = (
    sessionId: SessionId,
    cwd: string,
    rows: readonly FsEntry[],
  ): InputTriggerCandidate[] => {
    const filtered: { entry: FsEntry; rel: string }[] = []
    for (const entry of rows) {
      if (entry.type !== 'file' && entry.type !== 'directory') continue
      const rel = relativePosix(cwd, entry.path)
      filtered.push({ entry, rel: rel === '' ? entry.name : rel })
      if (filtered.length >= MAX_CANDIDATES) break
    }
    const basenameCounts = new Map<string, number>()
    for (const row of filtered) {
      basenameCounts.set(row.entry.name, (basenameCounts.get(row.entry.name) ?? 0) + 1)
    }
    const items: InputTriggerCandidate[] = []
    for (const row of filtered) {
      remember(sessionId, row.rel, row.entry.path)
      items.push(toCandidate(row.entry.name, row.rel, (basenameCounts.get(row.entry.name) ?? 0) > 1))
    }
    return items
  }

  const clearAll = (): void => {
    for (const entry of [...fetches.values()]) entry.abort.abort()
    fetches.clear()
    absByRel.clear()
  }

  const source: InputTriggerSource = {
    trigger: '@',
    name: SOURCE_NAME,
    order: 1,
    async candidates(session, { query, signal }) {
      const cwd = workspaceRoot(sessions, session.sessionId)
      if (cwd === undefined) return []

      // Whole-workspace fuzzy: same host.searchEntries as the explorer search box.
      if (query !== '' && !hasPathSeparator(query)) {
        const { result } = await host.searchEntries(
          { root: cwd, query, limit: MAX_CANDIDATES },
          signal,
        )
        if (signal.aborted) return []
        if (!result.ok) {
          throw new Error(`host.searchEntries failed: ${result.error.code}: ${result.error.message}`)
        }
        return mapSearch(session.sessionId, cwd, result.value.entries)
      }

      // Empty query or `src/...` descent: one-level listEntries (cached).
      const { segments, nameQuery } = splitQuery(query)
      if (segments.length > MAX_SEGMENTS) return []
      let listedPath = cwd
      let relPrefix = ''
      for (const segment of segments) {
        if (segment === '..') return []
        const rows = await fetchListing(session.sessionId, listedPath)
        if (signal.aborted) return []
        const directory = findDirectory(rows, segment)
        if (directory === undefined) return []
        listedPath = directory.path
        relPrefix = joinRel(relPrefix, directory.name)
      }
      const rows = await fetchListing(session.sessionId, listedPath)
      if (signal.aborted) return []
      return mapListed(session.sessionId, rows, relPrefix, nameQuery)
    },
    warm(session) {
      const cwd = workspaceRoot(sessions, session.sessionId)
      if (cwd === undefined) return
      fetchListing(session.sessionId, cwd).catch(() => {})
    },
    onPick({ candidate, session }) {
      const rel = candidate.description ?? candidate.name
      const abs = absByRel.get(cacheKey(session.sessionId, rel)) ?? rel
      return {
        insert: {
          source: SOURCE_NAME,
          ref: abs,
          label: rel,
          clipboardText: abs,
        },
      }
    },
    codec: {
      clipboardText: ref => ref,
      serialize: ref => Promise.resolve(ref),
    },
  }
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.on('connection/reset', clearAll)
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      clearAll()
    }
  }, 'ui-workspace-file: @ source')
}
