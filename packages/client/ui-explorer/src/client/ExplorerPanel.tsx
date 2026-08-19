/**
 * Current-workspace file tree for the details explorer seat. Lists one
 * directory level at a time through host.listEntries; workspace search uses
 * host.searchEntries with fuzzy matching and overlays the tree instead of
 * replacing it, so expansion, selection, and scroll survive a search round
 * trip. Clicking a file reads host.readText
 * into the layout preview column through the shared preview store. Ignore
 * rules come from `.dshignore` / `.cursorignore` / `.gitignore` via host.readText. Reveal
 * highlights a real preview path or composer-chip path. Folder/file rows expose
 * writeText/mkdir/rename/delete through the shared Menu + Modal chrome.
 * Ctrl/Cmd and Shift select a set; copy/cut/paste go through host.copy and
 * host.rename. Dragging a row onto a folder is the same move as cut-and-paste.
 * Double-clicking a code file hands it — and the workspace-root solution when
 * the listing shows one — to host.openPath, Unity's script gesture.
 * OS openPath and "引用到聊天" stay context-menu actions.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type ReactElement, type ReactNode } from 'react'
import { Tree, type NodeRendererProps, type RowRendererProps, type TreeApi } from 'react-arborist'
import type { FsEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, IconChevronDownOutline14, IconChevronRightOutline14, IconRefreshOutline16, Input, Menu, Modal, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  ExplorerGlyph, explorerIconKind, fileExtension, isCodeName, matchesSearch, matchesTypeFilter,
  type ExplorerTypeFilter,
} from './explorer-icons.tsx'
import {
  DEFAULT_DSHIGNORE, isIgnoredEntry, loadStackedIgnore, parseIgnore, relativePosix, type IgnoreRules,
} from './ignore.ts'
import { fuzzyMatchIndexes } from './fuzzy.ts'
import type { RevealRequest } from './reveal-requests.ts'
import { isOversizedTextPreview } from './text-preview-engine.ts'
import type { LineRange } from './workspace-reference.ts'
import {
  type createFilePreviewStore,
  type ExplorerTreeBucket,
} from './stores.ts'
import css from './ExplorerPanel.module.css'

export { explorerIconKind, fileExtension, type ExplorerIconKind } from './explorer-icons.tsx'

/** One directory's listing state. */
export type DirState =
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly FsEntry[] }
  | { status: 'error'; message: string }

/** Injected Host listing / open / mutate face of the explorer seat. */
export interface ExplorerInjected {
  /**
   * List one directory level of files and folders.
   * @param path - absolute directory to list.
   * @param signal - abort when the listing is superseded or the tree unmounts.
   */
  listEntries: (path: string, signal?: AbortSignal) => Promise<readonly FsEntry[]>
  /**
   * Fuzzy-search files and folders under the workspace root.
   * @param root - session workspace cwd.
   * @param query - trimmed search query.
   * @param signal - abort when superseded.
   */
  searchEntries: (
    root: string,
    query: string,
    signal?: AbortSignal,
  ) => Promise<{ entries: readonly FsEntry[]; truncated: boolean }>
  /**
   * Open a filesystem path with the Host OS default application.
   * @param path - absolute or host-resolvable path.
   */
  openPath: (path: string) => Promise<void>
  /**
   * Reveal a filesystem path in the Host OS file manager with the item selected
   * (Explorer / Finder / FileManager1).
   * @param path - absolute or host-resolvable path.
   */
  revealOsPath: (path: string) => Promise<void>
  /**
   * Read a UTF-8 text file (`host.readText`) for the blob preview window
   * and for workspace ignore files (`.dshignore` / `.gitignore`).
   * @param path - absolute file to read.
   */
  readText: (path: string) => Promise<string>
  /**
   * Create an empty file at an absolute path (`host.writeText`).
   * @param path - absolute file to create.
   */
  writeText: (path: string) => Promise<void>
  /**
   * Create one directory at an absolute path (`host.mkdir`).
   * @param path - absolute directory to create.
   */
  mkdir: (path: string) => Promise<void>
  /**
   * Rename or move a file or directory (`host.rename`).
   * @param from - existing absolute path.
   * @param to - destination absolute path.
   */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Copy a file or directory (`host.copy`).
   * @param from - existing absolute path.
   * @param to - destination absolute path.
   */
  copy: (from: string, to: string) => Promise<void>
  /**
   * Delete a file or directory (`host.delete`; directories are recursive).
   * @param path - absolute path to remove.
   */
  delete: (path: string) => Promise<void>
  /**
   * Insert one workspace-file reference chip into the session composer.
   * @param sessionId - active session.
   * @param path - absolute host path.
   * @param lines - inclusive 1-based selection range, or omit/null for whole file.
   * @returns false when the composer refused the insert.
   */
  insertWorkspaceReference: (
    sessionId: SessionId,
    path: string,
    lines?: LineRange | null,
  ) => boolean
  /** Open the layout file-preview column (independent of the details tree). */
  openPreview: () => void
  /**
   * Read the persisted browse bucket for a workspace cwd (root-scoped tree store).
   * @param workspaceKey - session cwd.
   */
  treeBucket: (workspaceKey: string) => ExplorerTreeBucket
  /**
   * Persist the expanded-directory set for a workspace cwd.
   * @param workspaceKey - session cwd.
   * @param expanded - absolute directory paths currently expanded.
   */
  persistExpanded: (workspaceKey: string, expanded: readonly string[]) => void
  /**
   * Persist preview tab paths only (never draft/dirty/body) for a workspace cwd.
   * @param workspaceKey - session cwd.
   * @param paths - open tab paths in click order.
   * @param activePath - active tab path, or `''` when none.
   */
  persistPreviewTabs: (workspaceKey: string, paths: readonly string[], activePath: string) => void
  /**
   * Drop browse buckets whose workspace keys are no longer known.
   * @param workspaceKeys - cwd paths to keep.
   */
  retainExplorerKeys: (workspaceKeys: readonly string[]) => void
  hooks: {
    /** Whether this deployment can hand a path to a user-visible native desktop. */
    canOpenPath: HostObservable<boolean>
    /** Latest external request to expand and highlight one workspace path. */
    revealRequest: HostObservable<RevealRequest | undefined>
  }
}

/** Full explorer-seat props: session kit, injected Host face, preview store, locale. */
export type ExplorerPanelProps =
  PropsRuntime<'conversation.details.explorer'>
  & InjectFace<ExplorerInjected>
  & PropsStore<ReturnType<typeof createFilePreviewStore>>
  & PropsLocale<'explorer'>

/** Directory display label: basename of the path (both separators accepted). */
export function folderLabel(path: string): string {
  const base = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return base !== undefined && base !== '' ? base : path
}

/**
 * Locale key for the OS file-manager reveal action. Labels follow the browser
 * OS (local GUI: browser ≈ host). A remote browser may disagree with the
 * host; the action still runs on the host.
 * @returns one of the `menu.revealIn*` keys.
 */
export function revealOsMenuKey():
  'menu.revealInFinder' | 'menu.revealInExplorer' | 'menu.revealInFileManager' {
  if (typeof navigator === 'undefined') return 'menu.revealInFileManager'
  const platform = navigator.platform
  const ua = navigator.userAgent
  if (/Mac|iPhone|iPod|iPad/.test(platform) || /Mac OS X/.test(ua)) return 'menu.revealInFinder'
  if (/Win/.test(platform) || /Windows/.test(ua)) return 'menu.revealInExplorer'
  return 'menu.revealInFileManager'
}

/**
 * Platform separator inferred from a host path: Windows when a backslash is
 * present and the path is not POSIX-rooted (a POSIX name may contain `\\`).
 */
export function pathSeparator(path: string): '\\' | '/' {
  return path.includes('\\') && !path.startsWith('/') ? '\\' : '/'
}

/**
 * Join one path segment onto an absolute parent. The client only concatenates
 * a host-returned parent with a single user-typed name.
 */
export function joinChild(parent: string, name: string): string {
  const sep = pathSeparator(parent)
  if (parent.endsWith('/') || parent.endsWith('\\')) return `${parent}${name}`
  return `${parent}${sep}${name}`
}

/** Parent directory of an absolute host path (drive roots stay drive roots). */
export function parentOf(path: string): string {
  const sep = pathSeparator(path)
  let trimmed = path
  while (trimmed.length > 1 && (trimmed.endsWith('/') || trimmed.endsWith('\\')))
    trimmed = trimmed.slice(0, -1)
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}${sep}`
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut < 0) return trimmed
  if (cut === 0) return sep
  const parent = trimmed.slice(0, cut)
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}${sep}`
  return parent
}

/** True when `path` is `ancestor` or a descendant under it. */
export function isSelfOrDescendant(path: string, ancestor: string): boolean {
  if (path === ancestor) return true
  const sep = pathSeparator(ancestor)
  const prefix = ancestor.endsWith('/') || ancestor.endsWith('\\') ? ancestor : `${ancestor}${sep}`
  return path.startsWith(prefix)
}

/**
 * Directories that must be expanded (and listed) to show `target` under `root`.
 * Empty when `target` is not inside the workspace — callers must not invent a path.
 */
export function dirsToReveal(root: string, target: string): string[] {
  if (!isSelfOrDescendant(target, root)) return []
  if (target === root) return [root]
  const chain: string[] = []
  let current = parentOf(target)
  while (true) {
    chain.push(current)
    if (current === root) break
    const next = parentOf(current)
    if (next === current || !isSelfOrDescendant(current, root)) break
    current = next
  }
  chain.reverse()
  return chain
}

/** Latest composer chip whose clipboard text is a real path under `cwd`. */
export function latestMentionPath(
  cwd: string | undefined,
  mentions: readonly { occurrenceId: number; clipboardText: string; invalid?: boolean }[],
): string | undefined {
  if (cwd === undefined) return undefined
  let latest: { occurrenceId: number; clipboardText: string } | undefined
  for (const row of mentions) {
    if (row.invalid === true || row.clipboardText === '') continue
    if (!isSelfOrDescendant(row.clipboardText, cwd)) continue
    if (latest !== undefined && row.occurrenceId <= latest.occurrenceId) continue
    latest = { occurrenceId: row.occurrenceId, clipboardText: row.clipboardText }
  }
  return latest?.clipboardText
}

/**
 * A single filesystem name: non-blank, not `.`/`..`, and not a path.
 * Whitespace-only names are rejected; surrounding whitespace is otherwise kept.
 */
export function isSegmentName(name: string): boolean {
  return name.trim() !== '' && name !== '.' && name !== '..' && !/[/\\]/.test(name)
}

/** True for Unity sidecar files such as `Foo.cs.meta`; directories stay listed. */
export function isMetaFile(entry: FsEntry): boolean {
  return entry.type !== 'directory' && entry.name.toLowerCase().endsWith('.meta')
}

/** Options for one listing page after ignore rules are known. */
export interface VisibleEntryOptions {
  /** Workspace root used to relativize ignore paths. */
  root?: string
  /** Compiled ignore rules; `.meta` files are hidden even when this is empty. */
  ignore?: IgnoreRules
}

/**
 * Visible listing rows: skip hidden entries, `.meta` files, and ignore matches;
 * directories first, then name. Directories whose names end in `.meta` stay visible.
 * @param entries - one host.listEntries page.
 * @param options - workspace root and ignore rules applied after the listing.
 */
export function visibleEntries(
  entries: readonly FsEntry[],
  options: VisibleEntryOptions = {},
): FsEntry[] {
  const shown = entries.filter((entry) => {
    if (entry.hidden || isMetaFile(entry)) return false
    if (options.root !== undefined && options.ignore !== undefined)
      return !isIgnoredEntry(options.root, entry.path, entry.type === 'directory', options.ignore)
    return true
  })
  shown.sort((left, right) => {
    const leftDir = left.type === 'directory' ? 0 : 1
    const rightDir = right.type === 'directory' ? 0 : 1
    if (leftDir !== rightDir) return leftDir - rightDir
    return left.name.localeCompare(right.name)
  })
  return shown
}

/** Search / type / ignore options for arborist data. */
export interface ExplorerTreeOptions {
  /** Workspace root used to relativize ignore paths. */
  root?: string
  /** Compiled ignore rules for this workspace. */
  ignore?: IgnoreRules
  /** Substring filter over already listed names; empty means no name filter. */
  query?: string
  /** Type filter; `all` keeps every listed kind. */
  type?: ExplorerTypeFilter
  /**
   * Background emptiness probe results, keyed by directory path. Feeds the
   * folder glyph (filled vs outline) for a directory the user has not expanded;
   * it never changes tree structure, chevrons, or the empty-leaf hint.
   */
  probed?: Readonly<Record<string, readonly FsEntry[]>>
}

/** One react-arborist row: a real file/folder or a loading/error placeholder. */
export interface ExplorerTreeNode {
  id: string
  name: string
  kind: 'file' | 'directory' | 'status'
  /** Structural empty: a listed directory with zero visible children (a leaf). */
  empty?: boolean
  /** Glyph emptiness: whether the folder icon shows the outline (empty) state. */
  iconEmpty?: boolean
  size?: number
  children?: ExplorerTreeNode[]
}

/**
 * Arborist data for the currently expanded listings. Unknown folders carry
 * `children: []` so they stay expandable. Empty folders (listed, zero visible
 * children) are leaves — no `children` key, no fake chevron.
 */
export function explorerTreeData(
  root: string,
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
  t: ExplorerPanelProps['t'],
  options: ExplorerTreeOptions = {},
): ExplorerTreeNode[] {
  return [directoryTreeNode(root, folderLabel(root), dirs, expanded, t, { ...options, root: options.root ?? root })]
}

function directoryTreeNode(
  path: string,
  name: string,
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
  t: ExplorerPanelProps['t'],
  options: ExplorerTreeOptions & { root?: string },
): ExplorerTreeNode {
  const visibleOptions = {
    ...(options.root !== undefined ? { root: options.root } : {}),
    ...(options.ignore !== undefined ? { ignore: options.ignore } : {}),
  }
  const listed = dirs[path]
  const listedEntries = listed?.status === 'ready' ? visibleEntries(listed.entries, visibleOptions) : undefined
  const empty = listed?.status === 'ready' && (listedEntries?.length ?? 0) === 0
  // Glyph emptiness prefers a real listing; for an unlisted directory it falls
  // back to the background probe, and stays filled (undefined) when unknown.
  const probedEntries = listed?.status === 'ready' ? undefined : options.probed?.[path]
  const iconEmpty = empty
    ? true
    : probedEntries !== undefined ? visibleEntries(probedEntries, visibleOptions).length === 0 : undefined
  if (empty) return { id: path, name, kind: 'directory', empty: true, iconEmpty: true }

  const children: ExplorerTreeNode[] = []
  if (expanded.has(path)) {
    const state = listed
    if (state === undefined || state.status === 'loading') {
      children.push({ id: `${path}::__loading`, name: t('loading'), kind: 'status' })
    } else if (state.status === 'error') {
      children.push({
        id: `${path}::__error`,
        name: state.message === '' ? t('error') : state.message,
        kind: 'status',
      })
    } else {
      const entries = listedEntries ?? []
      for (const entry of entries) {
        if (entry.type === 'directory') {
          children.push(directoryTreeNode(entry.path, entry.name, dirs, expanded, t, options))
        } else {
          children.push({
            id: entry.path,
            name: entry.name,
            kind: 'file',
            ...(entry.size !== undefined ? { size: entry.size } : {}),
          })
        }
      }
    }
  }
  const filtered = filterTreeChildren(children, options.query ?? '', options.type ?? 'all')
  return {
    id: path,
    name,
    kind: 'directory',
    empty: false,
    ...(iconEmpty !== undefined ? { iconEmpty } : {}),
    children: filtered,
  }
}

function filterTreeChildren(
  children: readonly ExplorerTreeNode[],
  query: string,
  type: ExplorerTypeFilter,
): ExplorerTreeNode[] {
  const kept: ExplorerTreeNode[] = []
  for (const child of children) {
    if (child.kind === 'status') {
      kept.push(child)
      continue
    }
    if (child.kind === 'file') {
      if (matchesSearch(child.name, query) && matchesTypeFilter('file', child.name, type)) kept.push(child)
      continue
    }
    const nextChildren = child.children === undefined ? undefined : filterTreeChildren(child.children, query, type)
    const selfMatch = matchesSearch(child.name, query) && matchesTypeFilter('directory', child.name, type)
    const hasKids = nextChildren !== undefined && nextChildren.length > 0
    if (selfMatch || hasKids) kept.push(nextChildren === undefined ? child : { ...child, children: nextChildren })
  }
  return kept
}

/**
 * True when an already-listed expanded row matches the search/type filter.
 * Does not walk unlisted directories — this is not a workspace index.
 */
export function hasExplorerMatch(
  root: string,
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
  query: string,
  type: ExplorerTypeFilter,
  ignore?: IgnoreRules,
): boolean {
  const walk = (dir: string): boolean => {
    const state = dirs[dir]
    if (state === undefined || state.status !== 'ready') return false
    const entries = visibleEntries(state.entries, {
      root,
      ...(ignore !== undefined ? { ignore } : {}),
    })
    for (const entry of entries) {
      const kind = entry.type === 'directory' ? 'directory' : 'file'
      if (matchesSearch(entry.name, query) && matchesTypeFilter(kind, entry.name, type)) return true
      if (entry.type === 'directory' && expanded.has(entry.path) && walk(entry.path)) return true
    }
    return false
  }
  return expanded.has(root) && walk(root)
}

/**
 * Visible treeitem paths in display order. Only expanded, successfully listed
 * directories contribute children.
 */
export function visibleTreeOrder(
  root: string,
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
  options: VisibleEntryOptions = {},
): string[] {
  const order: string[] = [root]
  const walk = (dir: string): void => {
    if (!expanded.has(dir)) return
    const state = dirs[dir]
    if (state === undefined || state.status !== 'ready') return
    const entries = visibleEntries(state.entries, options)
    for (const entry of entries) {
      order.push(entry.path)
      if (entry.type === 'directory') walk(entry.path)
    }
  }
  walk(root)
  return order
}

/** Inclusive range between two paths in a visible order list. */
export function rangePaths(order: readonly string[], from: string, to: string): string[] {
  const start = order.indexOf(from)
  const end = order.indexOf(to)
  if (start < 0 || end < 0) return [to]
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return order.slice(lo, hi + 1)
}

/**
 * Load stacked ignore rules (built-in → `.gitignore` → `.dshignore` else
 * `.cursorignore` → defaults). Re-read on cwd change; host also re-reads per request.
 */
export async function readWorkspaceIgnore(
  cwd: string,
  readText: (path: string) => Promise<string>,
): Promise<IgnoreRules> {
  return loadStackedIgnore(cwd, readText, joinChild)
}

/** Drop descendants when an ancestor is also selected. */
export function pruneNested(paths: readonly string[]): string[] {
  const sorted = [...paths].sort((left, right) => left.length - right.length)
  const kept: string[] = []
  for (const path of sorted) {
    let nested = false
    for (const parent of kept) {
      if (path !== parent && isSelfOrDescendant(path, parent)) {
        nested = true
        break
      }
    }
    if (!nested) kept.push(path)
  }
  return kept
}

/**
 * Tree-internal drag MIME. Not `Files` — a Files drag would light the
 * composer overlay while rearranging the tree.
 */
export const EXPLORER_DRAG_MIME = 'application/x-dsh-explorer-paths'

/** One path carried by an explorer drag (same shape as a cut item). */
export interface ExplorerDragItem {
  path: string
  name: string
}

/** True when `types` lists the explorer move MIME (DOMStringList or array). */
export function hasExplorerDrag(
  types: ArrayLike<string> | { contains: (type: string) => boolean } | undefined | null,
): boolean {
  if (types === undefined || types === null) return false
  const contains = (types as { contains?: (type: string) => boolean }).contains
  if (typeof contains === 'function') return contains.call(types, EXPLORER_DRAG_MIME)
  const list = types as ArrayLike<string>
  for (let i = 0; i < list.length; i++) {
    if (list[i] === EXPLORER_DRAG_MIME) return true
  }
  return false
}

/** Serialize pruned drag rows for `dataTransfer.setData`. */
export function encodeExplorerDrag(items: readonly ExplorerDragItem[]): string {
  return JSON.stringify(items.map(item => ({ path: item.path, name: item.name })))
}

/** Parse a drag payload; garbage, empty, or a missing HTML5 drop is `null`. */
export function decodeExplorerDrag(raw: string): ExplorerDragItem[] | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const rows: unknown[] = parsed
    const items: ExplorerDragItem[] = []
    for (const row of rows) {
      if (row === null || typeof row !== 'object') return null
      const path = (row as { path?: unknown }).path
      const name = (row as { name?: unknown }).name
      if (typeof path !== 'string' || path === '' || typeof name !== 'string' || name === '') return null
      items.push({ path, name })
    }
    const kept = pruneNested(items.map(item => item.path))
    const byPath = new Map(items.map(item => [item.path, item]))
    const out: ExplorerDragItem[] = []
    for (const path of kept) {
      const item = byPath.get(path)
      if (item !== undefined) out.push(item)
    }
    return out.length === 0 ? null : out
  } catch {
    return null
  }
}

/** Read the explorer MIME from a drop; missing `dataTransfer` is `null`. */
export function readExplorerDrag(dataTransfer: DataTransfer | null): ExplorerDragItem[] | null {
  if (dataTransfer === null) return null
  try {
    if (!hasExplorerDrag(dataTransfer.types)) return null
    return decodeExplorerDrag(dataTransfer.getData(EXPLORER_DRAG_MIME))
  } catch {
    return null
  }
}

/** False when dest is an item or a descendant of an item, or the set is empty. */
export function canMoveInto(destDir: string, items: readonly { path: string }[]): boolean {
  if (items.length === 0) return false
  for (const item of items) {
    if (isSelfOrDescendant(destDir, item.path)) return false
  }
  return true
}

/** True when every path is the workspace root or under it. */
export function allUnderWorkspace(cwd: string, paths: readonly string[]): boolean {
  for (const path of paths) {
    if (!isSelfOrDescendant(path, cwd)) return false
  }
  return true
}

/** True when `path` is the workspace root or a listed directory. */
export function isDirectoryPath(
  path: string,
  cwd: string,
  dirs: Readonly<Record<string, DirState>>,
): boolean {
  if (path === cwd) return true
  const parent = parentOf(path)
  const state = dirs[parent]
  if (state === undefined || state.status !== 'ready') return false
  for (const entry of state.entries) {
    if (entry.path === path) return entry.type === 'directory'
  }
  return false
}

/** Extension of a Visual Studio solution file. */
const SOLUTION_EXT = 'sln'

/**
 * Solution file to hand over with a double-clicked code file, read from the
 * already-listed workspace root. Unity writes `<ProjectName>.sln` beside
 * `Assets/`, so a solution named after the root wins; otherwise the first
 * `.sln` in name order keeps the choice deterministic.
 * @param root - workspace cwd, or undefined when the session has none.
 * @param dirs - listing state; an unlisted or failed root has no solution.
 * @returns absolute solution path, or undefined when the root lists none.
 */
export function workspaceSolution(
  root: string | undefined,
  dirs: Readonly<Record<string, DirState>>,
): string | undefined {
  if (root === undefined) return undefined
  const state = dirs[root]
  if (state === undefined || state.status !== 'ready') return undefined
  const solutions = state.entries
    .filter(entry => entry.type !== 'directory' && fileExtension(entry.name) === SOLUTION_EXT)
    .sort((left, right) => left.name.localeCompare(right.name))
  const preferred = `${folderLabel(root)}.${SOLUTION_EXT}`.toLowerCase()
  const named = solutions.find(entry => entry.name.toLowerCase() === preferred)
  return (named ?? solutions[0])?.path
}

/** Paste destination: the current selected folder, otherwise the tree root. */
export function pasteTargetDir(
  cwd: string,
  current: string | undefined,
  dirs: Readonly<Record<string, DirState>>,
): string {
  if (current !== undefined && isDirectoryPath(current, cwd, dirs)) return current
  return cwd
}

/** Session workspace root, or undefined when the session has no cwd. */
export function sessionCwd(list: SessionListState, sessionId: SessionId): string | undefined {
  const cwd = list.byId[sessionId]?.cwd
  return cwd === undefined || cwd === '' ? undefined : cwd
}

/**
 * Expanded paths to restore for `cwd`: saved paths under the workspace, always
 * including the root. An empty/missing bucket expands only the root.
 * @param cwd - workspace root.
 * @param bucket - persisted browse bucket.
 * @returns absolute directory paths to expand and list.
 */
export function hydratedExpandedPaths(cwd: string, bucket: ExplorerTreeBucket): string[] {
  const under = bucket.expanded.filter(path => path === cwd || isSelfOrDescendant(path, cwd))
  if (under.length === 0) return [cwd]
  return under.includes(cwd) ? under : [cwd, ...under]
}

/**
 * Preview tab paths to restore for `cwd` (paths outside the workspace drop).
 * @param cwd - workspace root.
 * @param bucket - persisted browse bucket.
 * @returns paths and active path safe to re-open.
 */
export function hydratedPreviewTabs(
  cwd: string,
  bucket: ExplorerTreeBucket,
): { paths: string[]; activePath: string } {
  const paths = bucket.previewPaths.filter(path => isSelfOrDescendant(path, cwd))
  const activePath = paths.includes(bucket.activePath) ? bucket.activePath : (paths[0] ?? '')
  return { paths, activePath }
}

function isAbort(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'AbortError'
}

function failureText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

interface CrudTarget {
  kind: 'file' | 'directory'
  path: string
  name: string
}

interface CrudMenu {
  x: number
  y: number
  target: CrudTarget
}

type CrudDialog =
  | { type: 'writeText'; path: string; draft: string }
  | { type: 'mkdir'; path: string; draft: string }
  | { type: 'rename'; path: string; name: string; kind: 'file' | 'directory'; draft: string }
  | { type: 'delete'; path: string; name: string; kind: 'file' | 'directory' }

interface ClipItem {
  path: string
  name: string
}

interface Clip {
  mode: 'copy' | 'cut'
  items: readonly ClipItem[]
}

type SearchState =
  | { status: 'idle' }
  | { status: 'indexing' }
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly FsEntry[]; truncated: boolean }
  | { status: 'error'; message: string }

const TYPE_FILTERS: readonly ExplorerTypeFilter[] = ['all', 'directory', 'code', 'text', 'other']
const SEARCH_DEBOUNCE_MS = 180

function highlightedText(text: string, query: string): ReactNode {
  const matched = new Set(fuzzyMatchIndexes(text, query))
  if (matched.size === 0) return text
  const parts: ReactNode[] = []
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index)
    parts.push(matched.has(index)
      ? <mark className={css.searchMatch} key={index}>{char}</mark>
      : char)
  }
  return parts
}

interface ExplorerChrome {
  cwd: string
  selected: ReadonlySet<string>
  revealedPath: string | undefined
  dropTarget: string | undefined
  revealedRef: MutableRefObject<HTMLDivElement | null>
  t: ExplorerPanelProps['t']
  onActivate: (event: MouseEvent, target: CrudTarget) => void
  onContextMenu: (event: MouseEvent, target: CrudTarget) => void
  onDragStart: (event: DragEvent<HTMLElement>, target: CrudTarget) => void
  onDragOver: (event: DragEvent<HTMLElement>, target: CrudTarget) => void
  onDrop: (event: DragEvent<HTMLElement>, target: CrudTarget) => void
  onDragEnd: () => void
}

const ExplorerChromeContext = createContext<ExplorerChrome | null>(null)

function useExplorerChrome(): ExplorerChrome {
  const chrome = useContext(ExplorerChromeContext)
  if (chrome === null) throw new Error('ExplorerRow needs ExplorerChrome')
  return chrome
}

/** Arborist still mounts react-dnd; a no-op backend keeps HTML5 row drag tests intact. */
function noopDndBackend(): {
  setup: () => void
  teardown: () => void
  connectDragSource: () => () => void
  connectDragPreview: () => () => void
  connectDropTarget: () => () => void
  profile: () => Record<string, number>
} {
  const disconnect = (): void => {}
  return {
    setup: disconnect,
    teardown: disconnect,
    connectDragSource: () => disconnect,
    connectDragPreview: () => disconnect,
    connectDropTarget: () => disconnect,
    profile: () => ({}),
  }
}

/**
 * Workspace file tree occupying `conversation.details.explorer`.
 * @param props - session cwd, Host listing/open/mutate callbacks, locale.
 */
export function ExplorerPanel({
  sessionId, useSessions, useWorkspaces, useInput, listEntries, searchEntries, openPath, revealOsPath, readText, writeText, mkdir, rename,
  copy, delete: deletePath, insertWorkspaceReference, openPreview, treeBucket, persistExpanded, persistPreviewTabs,
  retainExplorerKeys, useCanOpenPath, useRevealRequest, useStore, actions, t,
}: ExplorerPanelProps): ReactNode {
  const cwd = useSessions(list => sessionCwd(list, sessionId))
  const workspacePaths = useWorkspaces(state => state.items.map(item => item.path))
  const workspacePhase = useWorkspaces(state => state.phase)
  const canOpenPath = useCanOpenPath(open => open)
  const revealRequest = useRevealRequest(request => request)
  const mentionPath = useInput(state => latestMentionPath(cwd, state.occurrences))
  const previewTabs = useStore(state => state.tabs)
  const previewActivePath = useStore(state => state.activePath)
  const [dirs, setDirs] = useState<Readonly<Record<string, DirState>>>({})
  const [probed, setProbed] = useState<Readonly<Record<string, readonly FsEntry[]>>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | undefined>()
  const [clip, setClip] = useState<Clip | null>(null)
  const [openedPath, setOpenedPath] = useState<string | undefined>()
  const [revealPath, setRevealPath] = useState<string | undefined>()
  const [openNotice, setOpenNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ExplorerTypeFilter>('all')
  const [ignore, setIgnore] = useState<IgnoreRules>(() => parseIgnore(DEFAULT_DSHIGNORE))
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [searchSelection, setSearchSelection] = useState(0)
  const [clipNotice, setClipNotice] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | undefined>()
  const [menu, setMenu] = useState<CrudMenu | null>(null)
  const [dialog, setDialog] = useState<CrudDialog | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [mutating, setMutating] = useState(false)
  const aborts = useRef(new Map<string, AbortController>())
  const listRef = useRef(listEntries)
  listRef.current = listEntries
  const dirsRef = useRef(dirs)
  dirsRef.current = dirs
  const probedRef = useRef(probed)
  probedRef.current = probed
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const clipRef = useRef(clip)
  clipRef.current = clip
  const ignoreRef = useRef(ignore)
  ignoreRef.current = ignore
  const readTextRef = useRef(readText)
  readTextRef.current = readText
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const previewTabsRef = useRef(previewTabs)
  previewTabsRef.current = previewTabs
  // openFile is declared below; the reveal effect reaches it through this ref
  // so it can open a chip's tab without a use-before-define cycle.
  const openFileRef = useRef<(path: string) => void>(() => {})
  const dragItemsRef = useRef<ExplorerDragItem[] | null>(null)
  const mutatingRef = useRef(false)
  const crudSeq = useRef(0)
  const previewSeq = useRef(0)
  const searchSeq = useRef(0)
  const indexedRoot = useRef<string | undefined>()
  const composingRef = useRef(false)
  const menuPoint = useRef({ x: 0, y: 0 })
  const revealedRef = useRef<HTMLDivElement | null>(null)
  const scrolledReveal = useRef<string | undefined>(undefined)
  const treeApi = useRef<TreeApi<ExplorerTreeNode> | undefined>(undefined)
  const treeHostRef = useRef<HTMLDivElement | null>(null)
  /** Last tree scroll offset observed while the tree was on screen. */
  const treeScroll = useRef(0)
  /** True while a search or type-filter overlay covers the tree. */
  const treeHiddenRef = useRef(false)
  const [treeSize, setTreeSize] = useState({ width: 0, height: 0 })
  /** Skip writing expanded persistence once after a cwd hydrate. */
  const skipExpandedPersist = useRef(true)
  /** Skip writing preview-tab persistence once after a cwd hydrate. */
  const skipPreviewPersist = useRef(true)

  const load = (path: string, opts?: { dropOnError?: boolean }): void => {
    aborts.current.get(path)?.abort()
    const ac = new AbortController()
    aborts.current.set(path, ac)
    setDirs(current => ({ ...current, [path]: { status: 'loading' } }))
    void listRef.current(path, ac.signal).then((entries) => {
      if (ac.signal.aborted) return
      setDirs(current => ({ ...current, [path]: { status: 'ready', entries } }))
      const visible = visibleEntries(entries, {
        ...(cwdRef.current !== undefined ? { root: cwdRef.current } : {}),
        ignore: ignoreRef.current,
      })
      if (visible.length === 0) {
        setExpanded((current) => {
          if (!current.has(path)) return current
          const next = new Set(current)
          next.delete(path)
          return next
        })
        treeApi.current?.close(path)
      } else {
        setExpanded((current) => {
          if (current.has(path)) return current
          const next = new Set(current)
          next.add(path)
          return next
        })
        treeApi.current?.open(path)
      }
    }, (reason: unknown) => {
      if (ac.signal.aborted || isAbort(reason)) return
      if (opts?.dropOnError === true) {
        setDirs((current) => {
          if (current[path] === undefined) return current
          return Object.fromEntries(Object.entries(current).filter(([key]) => key !== path))
        })
        setExpanded((current) => {
          if (!current.has(path)) return current
          const next = new Set(current)
          next.delete(path)
          return next
        })
        return
      }
      setDirs(current => ({ ...current, [path]: { status: 'error', message: failureText(reason) } }))
    })
  }

  // Background emptiness check for a visible, unexpanded directory row. Lists
  // one level into the separate `probed` cache (never `dirs`), so the folder
  // glyph derives from the same visibleEntries + ignore rules the row shows on
  // expand — no glyph flicker on open — while tree structure, chevrons, and
  // expand bookkeeping stay driven solely by real user expansions. Shares the
  // `load` abort key so an interactive expand or collapse cancels a pending
  // probe. A missing, aborted, or malformed background listing leaves the row
  // at the conservative filled glyph; a probe never surfaces an error.
  const probe = (path: string): void => {
    const ac = new AbortController()
    aborts.current.set(path, ac)
    const done = (): void => { if (aborts.current.get(path) === ac) aborts.current.delete(path) }
    void listRef.current(path, ac.signal).then((entries) => {
      done()
      if (!ac.signal.aborted) setProbed(current => ({ ...current, [path]: entries }))
    }, done)
  }

  useEffect(() => {
    const inflight = aborts.current
    const abortAll = (): void => {
      for (const ac of inflight.values()) ac.abort()
      inflight.clear()
    }
    skipExpandedPersist.current = true
    skipPreviewPersist.current = true
    crudSeq.current += 1
    setMenu(null)
    setDialog(null)
    setDialogError(null)
    setMutating(false)
    mutatingRef.current = false
    setSelected(new Set())
    setAnchor(undefined)
    setClip(null)
    setClipNotice(null)
    setDropTarget(undefined)
    dragItemsRef.current = null
    previewSeq.current += 1
    searchSeq.current += 1
    indexedRoot.current = undefined
    actions.clear()
    setSearch({ status: 'idle' })
    setQuery('')
    setTypeFilter('all')
    setIgnore(parseIgnore(DEFAULT_DSHIGNORE))
    setProbed({})
    if (cwd === undefined) {
      setDirs({})
      setExpanded(new Set())
      setOpenedPath(undefined)
      setRevealPath(undefined)
      return () => {
        abortAll()
        crudSeq.current += 1
      }
    }
    setOpenedPath(undefined)
    setRevealPath(undefined)
    const bucket = treeBucket(cwd)
    const initialExpanded = hydratedExpandedPaths(cwd, bucket)
    setExpanded(new Set(initialExpanded))
    for (const path of initialExpanded) {
      load(path, path === cwd ? undefined : { dropOnError: true })
    }
    const preview = hydratedPreviewTabs(cwd, bucket)
    if (preview.paths.length > 0) {
      openPreview()
      const seq = previewSeq.current
      for (const path of preview.paths) {
        actions.showLoading(path)
        void readTextRef.current(path).then((content) => {
          if (seq !== previewSeq.current) return
          if (isOversizedTextPreview(content)) {
            actions.close(path)
            return
          }
          setOpenedPath(path)
          actions.showText(path, content)
        }, () => {
          if (seq !== previewSeq.current) return
          actions.close(path)
        })
      }
      if (preview.activePath !== '') actions.activate(preview.activePath)
    }
    const seq = crudSeq.current
    void readWorkspaceIgnore(cwd, path => readTextRef.current(path)).then((rules) => {
      if (seq !== crudSeq.current) return
      setIgnore(rules)
    })
    return () => {
      abortAll()
      crudSeq.current += 1
    }
  }, [cwd, actions, treeBucket, openPreview])

  useEffect(() => {
    if (skipExpandedPersist.current) {
      skipExpandedPersist.current = false
      return
    }
    if (cwd === undefined) return
    persistExpanded(cwd, [...expanded])
  }, [cwd, expanded, persistExpanded])

  useEffect(() => {
    if (skipPreviewPersist.current) {
      skipPreviewPersist.current = false
      return
    }
    if (cwd === undefined) return
    persistPreviewTabs(cwd, previewTabs.map(tab => tab.path), previewActivePath)
  }, [cwd, previewTabs, previewActivePath, persistPreviewTabs])

  useEffect(() => {
    if (workspacePhase !== 'ready') return
    retainExplorerKeys([
      ...workspacePaths,
      ...(cwd !== undefined ? [cwd] : []),
    ])
  }, [workspacePhase, workspacePaths, cwd, retainExplorerKeys])

  useEffect(() => {
    if (openedPath !== undefined) setRevealPath(openedPath)
  }, [openedPath])

  useEffect(() => {
    const trimmed = query.trim()
    if (cwd === undefined || trimmed === '') {
      searchSeq.current += 1
      setSearch({ status: 'idle' })
      setSearchSelection(0)
      return
    }
    const seq = ++searchSeq.current
    const ac = new AbortController()
    setSearch({ status: indexedRoot.current === cwd ? 'loading' : 'indexing' })
    setSearchSelection(0)
    const timer = window.setTimeout(() => {
      void searchEntries(cwd, trimmed, ac.signal).then((result) => {
        if (seq !== searchSeq.current || ac.signal.aborted) return
        const visible = result.entries.filter((entry) => {
          if (entry.hidden || isMetaFile(entry)) return false
          const kind = entry.type === 'directory' ? 'directory' : 'file'
          return matchesTypeFilter(kind, entry.name, typeFilter)
        })
        indexedRoot.current = cwd
        setSearch({ status: 'ready', entries: visible, truncated: result.truncated })
      }, (reason: unknown) => {
        if (seq !== searchSeq.current || ac.signal.aborted) return
        setSearch({ status: 'error', message: failureText(reason) })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      ac.abort()
    }
  }, [cwd, query, typeFilter, searchEntries])

  useEffect(() => {
    if (mentionPath !== undefined) setRevealPath(mentionPath)
  }, [mentionPath])

  // A composer reference-chip click: highlight the row and open its preview
  // tab. A path outside the workspace, or already gone, only fails to reveal —
  // it never throws. An already-open tab is focused, not re-read, so a pending
  // edit survives; the editor's own re-scroll to the line rides the request
  // seq through the preview panel, not a tab reload here.
  useEffect(() => {
    if (revealRequest === undefined) return
    const { path } = revealRequest
    setRevealPath(path)
    if (cwd === undefined || !isSelfOrDescendant(path, cwd)) return
    if (previewTabsRef.current.some(tab => tab.path === path)) actions.activate(path)
    else openFileRef.current(path)
  }, [revealRequest, cwd, actions])

  const activeReveal = cwd !== undefined && revealPath !== undefined && isSelfOrDescendant(revealPath, cwd)
    ? revealPath
    : undefined

  const searchActive = query.trim() !== ''
  const listingReady = cwd !== undefined && dirs[cwd]?.status === 'ready'
  const searchEmpty = searchActive
    ? search.status === 'ready' && search.entries.length === 0
    : listingReady
      && typeFilter !== 'all'
      && !hasExplorerMatch(cwd, dirs, expanded, '', typeFilter, ignore)
  // Search results and the "no match for this type" copy are overlays: the tree
  // stays mounted underneath so react-arborist keeps its open map and the
  // virtualized scroller keeps its rows. Unmounting it rebuilt both from
  // `initialOpenState`, which collapsed every folder and jumped to the top.
  const treeHidden = searchActive || searchEmpty
  treeHiddenRef.current = treeHidden

  useEffect(() => {
    if (cwd === undefined || activeReveal === undefined) return
    const ancestors = dirsToReveal(cwd, activeReveal)
    setExpanded((current) => {
      let changed = false
      const next = new Set(current)
      for (const dir of ancestors) {
        if (next.has(dir)) continue
        next.add(dir)
        changed = true
      }
      return changed ? next : current
    })
    for (const dir of ancestors) {
      const state = dirsRef.current[dir]
      if (state === undefined || state.status !== 'ready') load(dir)
      treeApi.current?.open(dir)
    }
  }, [cwd, activeReveal])

  // Scroll to a reveal target only while it is still unresolved. Locking after
  // the target row exists stops later listing updates (a folder the user just
  // expanded, or a background emptiness probe) from yanking the viewport back
  // to a stale reveal and pushing the just-clicked row out of sight.
  useEffect(() => {
    if (activeReveal === undefined) {
      scrolledReveal.current = undefined
      return
    }
    if (scrolledReveal.current === activeReveal) return
    // A hidden tree cannot be scrolled, so leave the lock unset: the row is
    // scrolled into view once the overlay clears and this effect re-runs.
    if (treeHiddenRef.current) return
    // jsdom stubs often omit scrollIntoView; optional-call keeps reveal tests alive.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    revealedRef.current?.scrollIntoView?.({ block: 'nearest' })
    void treeApi.current?.scrollTo(activeReveal)
    if (cwd !== undefined && visibleTreeOrder(cwd, dirs, expanded, { root: cwd, ignore }).includes(activeReveal))
      scrolledReveal.current = activeReveal
  }, [activeReveal, dirs, cwd, expanded, ignore, treeHidden])

  // Hiding the tree destroys the scroller's box, which zeroes its scrollTop
  // while react-window still believes it renders the old offset. Writing the
  // last on-screen offset back re-syncs the pair once the overlay clears. A
  // reveal still waiting for its scroll wins: the effect above puts that row in
  // view instead of returning to where the user left off.
  useLayoutEffect(() => {
    if (treeHidden || (activeReveal !== undefined && scrolledReveal.current !== activeReveal)) return
    const scroller = treeApi.current?.listEl.current
    if (scroller === undefined || scroller === null) return
    scroller.scrollTop = treeScroll.current
  }, [treeHidden])

  // Probe each visible, unexpanded directory row once so its folder glyph can
  // show empty vs filled before the user opens it. Bounded to the direct
  // children of already-expanded directories (what `visibleTreeOrder` yields),
  // deduplicated through `dirs`/in-flight aborts, and skipped in search mode.
  useEffect(() => {
    if (cwd === undefined || query.trim() !== '') return
    const order = visibleTreeOrder(cwd, dirs, expanded, { root: cwd, ignore })
    for (const path of order) {
      if (path === cwd || dirsRef.current[path] !== undefined) continue
      if (probedRef.current[path] !== undefined || aborts.current.has(path)) continue
      if (!isDirectoryPath(path, cwd, dirsRef.current)) continue
      probe(path)
    }
  }, [cwd, dirs, expanded, ignore, query])

  useEffect(() => {
    const host = treeHostRef.current
    if (host === null) return
    const apply = (): void => {
      const width = host.clientWidth
      const height = host.clientHeight
      setTreeSize(current => (
        current.width === width && current.height === height ? current : { width, height }
      ))
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(apply)
    observer.observe(host)
    return () => { observer.disconnect() }
  }, [cwd])

  const refreshExpanded = (): void => {
    if (cwd === undefined) return
    void readWorkspaceIgnore(cwd, path => readTextRef.current(path)).then((rules) => {
      ignoreRef.current = rules
      setIgnore(rules)
      for (const path of expandedRef.current) load(path)
    })
  }

  const openFile = (path: string): void => {
    // Workspace generation, not a per-click counter: several tabs read in
    // parallel, so each result lands in its own tab (the store drops a write
    // whose tab was closed) and only a workspace switch invalidates them all.
    const seq = previewSeq.current
    setOpenNotice(null)
    openPreview()
    actions.showLoading(path)
    void readText(path).then((content) => {
      if (seq !== previewSeq.current) return
      if (isOversizedTextPreview(content)) {
        actions.showError(path, t('preview.tooLarge'))
        return
      }
      setOpenedPath(path)
      actions.showText(path, content)
    }, (reason: unknown) => {
      if (seq !== previewSeq.current) return
      actions.showError(path, failureText(reason))
    })
  }
  openFileRef.current = openFile

  const openOsPath = (path: string): void => {
    /* v8 ignore start -- Menu omits openOs unless the host can hand off */
    if (!canOpenPath) {
      setOpenNotice(t('open.unavailable'))
      return
    }
    /* v8 ignore stop */
    setOpenNotice(null)
    void openPath(path).then(() => {
      setOpenedPath(path)
    }, (reason: unknown) => {
      setOpenNotice(failureText(reason))
    })
  }

  /**
   * Unity "Show in Explorer" / VS Code "Reveal in File Explorer": open the
   * host file manager on the containing folder and select this item. Files
   * and directories share the same select semantics.
   * @param path - absolute path the context menu named.
   */
  const revealOsItem = (path: string): void => {
    if (!canOpenPath) {
      setOpenNotice(t('open.unavailable'))
      return
    }
    setOpenNotice(null)
    void revealOsPath(path).then(() => {
      setOpenedPath(path)
    }, (reason: unknown) => {
      setOpenNotice(failureText(reason))
    })
  }

  /**
   * Unity's double-click gesture for a script: hand the file to the Host OS
   * default application (Visual Studio for `.cs` on a Unity workstation) and,
   * when the workspace root lists a solution, hand that over too so the editor
   * loads the project instead of a loose file. The file goes first — a cold
   * editor then owns one window that the solution request joins, while opening
   * the solution first races an instance that is still starting up.
   * @param path - absolute code file the user double-clicked.
   */
  const openInEditor = (path: string): void => {
    if (!canOpenPath) {
      setOpenNotice(t('open.unavailable'))
      return
    }
    setOpenNotice(null)
    const solution = workspaceSolution(cwd, dirs)
    void (async () => {
      try {
        await openPath(path)
        if (solution !== undefined) await openPath(solution)
        setOpenedPath(path)
      } catch (reason: unknown) {
        setOpenNotice(failureText(reason))
      }
    })()
  }

  const onTreeToggle = (id: string): void => {
    if (id.includes('__')) return
    if (treeApi.current?.isOpen(id) === true) {
      setExpanded((current) => {
        if (current.has(id)) return current
        const next = new Set(current)
        next.add(id)
        return next
      })
      const state = dirsRef.current[id]
      if (state === undefined || state.status !== 'ready') load(id)
      return
    }
    aborts.current.get(id)?.abort()
    setExpanded((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const dropTree = (path: string, remapTo?: string): void => {
    setDirs((current) => {
      const next: Record<string, DirState> = {}
      for (const [key, value] of Object.entries(current)) {
        if (!isSelfOrDescendant(key, path)) next[key] = value
      }
      return next
    })
    setProbed((current) => {
      let changed = false
      const next: Record<string, readonly FsEntry[]> = {}
      for (const [key, value] of Object.entries(current)) {
        if (isSelfOrDescendant(key, path)) {
          changed = true
          continue
        }
        next[key] = value
      }
      return changed ? next : current
    })
    setExpanded((current) => {
      const next = new Set<string>()
      let remap = false
      for (const key of current) {
        if (isSelfOrDescendant(key, path)) {
          if (key === path) remap = true
          continue
        }
        next.add(key)
      }
      if (remap && remapTo !== undefined) next.add(remapTo)
      return next
    })
  }

  const selectOnly = (path: string): void => {
    setSelected(new Set([path]))
    setAnchor(path)
  }

  const onRowActivate = (event: MouseEvent, target: CrudTarget): void => {
    /* v8 ignore next -- the tree only mounts while a workspace cwd exists */
    if (cwd === undefined) return
    if (event.shiftKey) {
      const from = anchor ?? target.path
      setSelected(new Set(rangePaths(visibleTreeOrder(cwd, dirs, expanded, { root: cwd, ignore }), from, target.path)))
      if (anchor === undefined) setAnchor(target.path)
      return
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(target.path)) next.delete(target.path)
        else next.add(target.path)
        return next
      })
      setAnchor(target.path)
      return
    }
    selectOnly(target.path)
    if (target.kind !== 'file') return
    // `detail` counts the clicks of one sequence, so the second click of a
    // double click takes the OS handoff instead of a repeat preview read.
    // Folders keep their expand/collapse toggle, which fires per click.
    if (event.detail >= 2) {
      if (isCodeName(target.name)) openInEditor(target.path)
      return
    }
    openFile(target.path)
  }

  const snapshotClip = (mode: 'copy' | 'cut'): void => {
    const paths = selectedRef.current
    if (paths.size === 0) return
    const items = pruneNested([...paths]).map(path => ({ path, name: folderLabel(path) }))
    setClip({ mode, items })
    setClipNotice(null)
  }

  const relocateItems = (
    items: readonly ClipItem[],
    destDir: string,
    mode: 'copy' | 'move',
    clearClipOnMove: boolean,
  ): void => {
    /* v8 ignore next -- relocate is only offered while the tree is mounted */
    if (cwd === undefined) return
    if (mutatingRef.current) return
    const seq = ++crudSeq.current
    mutatingRef.current = true
    setMutating(true)
    setClipNotice(null)
    const parentsToLoad = new Set<string>([destDir])
    const remapLoads = new Set<string>()
    const moved: string[] = []
    void (async () => {
      let failed: unknown
      for (const item of items) {
        const to = joinChild(destDir, item.name)
        if (mode === 'move' && to === item.path) continue
        try {
          if (mode === 'copy') await copy(item.path, to)
          else {
            const wasListed = dirsRef.current[item.path] !== undefined
            const wasDir = isDirectoryPath(item.path, cwd, dirsRef.current)
            await rename(item.path, to)
            dropTree(item.path, wasDir && wasListed ? to : undefined)
            parentsToLoad.add(parentOf(item.path))
            if (wasDir && wasListed) remapLoads.add(to)
            moved.push(item.path)
          }
        } catch (reason: unknown) {
          failed = reason
          break
        }
      }
      if (seq !== crudSeq.current) return
      mutatingRef.current = false
      setMutating(false)
      if (moved.length > 0) {
        setSelected((current) => {
          const next = new Set(current)
          for (const path of moved) next.delete(path)
          return next
        })
      }
      if (clearClipOnMove && mode === 'move' && failed === undefined && moved.length > 0) setClip(null)
      for (const dir of parentsToLoad) {
        if (dir === destDir || expandedRef.current.has(dir) || dirsRef.current[dir] !== undefined) load(dir)
      }
      for (const dir of remapLoads) load(dir)
      if (failed !== undefined) setClipNotice(failureText(failed))
    })()
  }

  const pasteClipboard = (): void => {
    /* v8 ignore next -- paste is only offered while the tree is mounted */
    if (cwd === undefined) return
    const currentClip = clipRef.current
    if (currentClip === null) return
    const destDir = pasteTargetDir(cwd, anchor, dirsRef.current)
    relocateItems(
      currentClip.items,
      destDir,
      currentClip.mode === 'copy' ? 'copy' : 'move',
      currentClip.mode === 'cut',
    )
  }

  const onRowDragStart = (event: DragEvent<HTMLElement>, target: CrudTarget): void => {
    if (cwd !== undefined && target.path === cwd) {
      event.preventDefault()
      return
    }
    // React types DataTransfer as always present; jsdom synthetic drags can omit it.
    const dt = (event as { dataTransfer?: DataTransfer | null }).dataTransfer
    if (dt == null) return
    const paths = selectedRef.current.has(target.path)
      ? pruneNested([...selectedRef.current])
      : [target.path]
    const items = paths.map(path => ({ path, name: folderLabel(path) }))
    try {
      dt.effectAllowed = 'move'
      dt.setData(EXPLORER_DRAG_MIME, encodeExplorerDrag(items))
    } catch {
      return
    }
    dragItemsRef.current = items
  }

  const onRowDragOver = (event: DragEvent<HTMLElement>, target: CrudTarget): void => {
    if (target.kind !== 'directory') return
    const dt = (event as { dataTransfer?: DataTransfer | null }).dataTransfer
    if (dt == null) return
    if (!hasExplorerDrag(dt.types) && dragItemsRef.current === null) return
    const items = dragItemsRef.current ?? readExplorerDrag(dt)
    if (items === null) return
    event.preventDefault()
    event.stopPropagation()
    const workspaceOk = cwd === undefined
      || allUnderWorkspace(cwd, [target.path, ...items.map(item => item.path)])
    if (mutatingRef.current || !workspaceOk || !canMoveInto(target.path, items)) {
      dt.dropEffect = 'none'
      setDropTarget(undefined)
      return
    }
    dt.dropEffect = 'move'
    setDropTarget(target.path)
  }

  const onRowDrop = (event: DragEvent<HTMLElement>, target: CrudTarget): void => {
    // Synthetic drops in tests may omit dataTransfer despite React's type.
    const dt = (event as { dataTransfer?: DataTransfer | null }).dataTransfer ?? null
    const ours = hasExplorerDrag(dt === null ? undefined : dt.types) || dragItemsRef.current !== null
    if (!ours) return
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(undefined)
    const items = readExplorerDrag(dt) ?? dragItemsRef.current
    dragItemsRef.current = null
    if (items === null || cwd === undefined || target.kind !== 'directory') return
    if (!allUnderWorkspace(cwd, [target.path, ...items.map(item => item.path)])) {
      setClipNotice(t('drop.outsideWorkspace'))
      return
    }
    if (!canMoveInto(target.path, items)) {
      setClipNotice(t('drop.intoSelf'))
      return
    }
    relocateItems(items, target.path, 'move', false)
  }

  const onRowDragEnd = (): void => {
    dragItemsRef.current = null
    setDropTarget(undefined)
  }

  const onTreeDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDropTarget(undefined)
  }

  const onTreeKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (dialog !== null) return
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key !== 'c' && key !== 'x' && key !== 'v') return
    event.preventDefault()
    if (key === 'c') snapshotClip('copy')
    else if (key === 'x') snapshotClip('cut')
    else pasteClipboard()
  }

  const closeDialog = (): void => {
    if (mutating) return
    crudSeq.current += 1
    setDialog(null)
    setDialogError(null)
  }

  const failMutate = (seq: number, reason: unknown): void => {
    if (seq !== crudSeq.current) return
    setMutating(false)
    setDialogError(failureText(reason))
  }

  const submitDialog = (): void => {
    if (mutating) return
    /* v8 ignore next -- submit is only wired from an open dialog */
    if (dialog === null) return
    const seq = ++crudSeq.current
    if (dialog.type === 'writeText' || dialog.type === 'mkdir') {
      if (!isSegmentName(dialog.draft)) return
      const parent = dialog.path
      const created = joinChild(parent, dialog.draft)
      const mutate = dialog.type === 'writeText' ? writeText : mkdir
      setMutating(true)
      setDialogError(null)
      void mutate(created).then(() => {
        if (seq !== crudSeq.current) return
        setMutating(false)
        setDialog(null)
        setExpanded((current) => {
          const next = new Set(current)
          next.add(parent)
          return next
        })
        load(parent)
      }, (reason: unknown) => { failMutate(seq, reason) })
      return
    }
    if (dialog.type === 'rename') {
      if (!isSegmentName(dialog.draft)) return
      const to = joinChild(parentOf(dialog.path), dialog.draft)
      if (to === dialog.path) {
        closeDialog()
        return
      }
      const from = dialog.path
      const kind = dialog.kind
      const wasListed = dirs[from] !== undefined
      setMutating(true)
      setDialogError(null)
      void rename(from, to).then(() => {
        if (seq !== crudSeq.current) return
        setMutating(false)
        setDialog(null)
        dropTree(from, kind === 'directory' && wasListed ? to : undefined)
        load(parentOf(from))
        if (kind === 'directory' && wasListed) load(to)
      }, (reason: unknown) => { failMutate(seq, reason) })
      return
    }
    const removed = dialog.path
    setMutating(true)
    setDialogError(null)
    void deletePath(removed).then(() => {
      if (seq !== crudSeq.current) return
      setMutating(false)
      setDialog(null)
      dropTree(removed)
      load(parentOf(removed))
    }, (reason: unknown) => { failMutate(seq, reason) })
  }

  const openContextMenu = (event: MouseEvent, target: CrudTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!selected.has(target.path)) selectOnly(target.path)
    menuPoint.current = { x: event.clientX, y: event.clientY }
    setMenu({ x: event.clientX, y: event.clientY, target })
  }

  const clipItems: MenuEntry[] = clip === null
    ? [
      { id: 'copy', label: t('menu.copy') },
      { id: 'cut', label: t('menu.cut') },
    ]
    : [
      { id: 'copy', label: t('menu.copy') },
      { id: 'cut', label: t('menu.cut') },
      { id: 'paste', label: t('menu.paste') },
    ]

  const chatRefItem: MenuEntry = { id: 'addToChat', label: t('menu.addToChat') }
  const revealOsEntry: MenuEntry = { id: 'revealOs', label: t(revealOsMenuKey()) }

  const menuItems: readonly MenuEntry[] = menu === null
    ? []
    : menu.target.kind === 'directory'
      ? [
        { id: 'writeText', label: t('menu.newFile') },
        { id: 'mkdir', label: t('menu.newFolder') },
        revealOsEntry,
        { type: 'separator', id: 'clip-sep' },
        ...clipItems,
        { type: 'separator', id: 'chat-sep' },
        chatRefItem,
        { type: 'separator', id: 'crud-sep' },
        { id: 'rename', label: t('menu.rename') },
        { type: 'separator', id: 'delete-sep' },
        { id: 'delete', label: t('menu.delete'), danger: true },
      ]
      : [
        { id: 'openOs', label: t('menu.openOs') },
        revealOsEntry,
        ...clipItems,
        { type: 'separator', id: 'chat-sep' },
        chatRefItem,
        { type: 'separator', id: 'crud-sep' },
        { id: 'rename', label: t('menu.rename') },
        { type: 'separator', id: 'delete-sep' },
        { id: 'delete', label: t('menu.delete'), danger: true },
      ]

  const onMenuSelect = (id: string): void => {
    /* v8 ignore next -- Menu only selects while a row menu is open */
    if (menu === null) return
    const target = menu.target
    setMenu(null)
    setDialogError(null)
    if (id === 'copy') {
      snapshotClip('copy')
      return
    }
    if (id === 'cut') {
      snapshotClip('cut')
      return
    }
    if (id === 'paste') {
      pasteClipboard()
      return
    }
    if (id === 'openOs') {
      openOsPath(target.path)
      return
    }
    if (id === 'revealOs') {
      revealOsItem(target.path)
      return
    }
    if (id === 'addToChat') {
      if (!insertWorkspaceReference(sessionId, target.path)) setClipNotice(t('menu.addToChat.failed'))
      return
    }
    if (id === 'writeText') {
      setDialog({ type: 'writeText', path: target.path, draft: '' })
      return
    }
    if (id === 'mkdir') {
      setDialog({ type: 'mkdir', path: target.path, draft: '' })
      return
    }
    if (id === 'rename') {
      setDialog({ type: 'rename', path: target.path, name: target.name, kind: target.kind, draft: target.name })
      return
    }
    setDialog({ type: 'delete', path: target.path, name: target.name, kind: target.kind })
  }

  const dialogOpen = dialog !== null
  const nameDialog = dialog?.type === 'writeText' || dialog?.type === 'mkdir' || dialog?.type === 'rename'
  const submitDisabled = mutating
    || dialog === null
    || (nameDialog && !isSegmentName(dialog.draft))
  const dialogTitle = dialog?.type === 'writeText'
    ? t('dialog.newFile')
    : dialog?.type === 'mkdir'
      ? t('dialog.newFolder')
      : dialog?.type === 'rename'
        ? t('dialog.rename')
        : t('dialog.delete')

  const treeData = cwd === undefined
    ? []
    : explorerTreeData(cwd, dirs, expanded, t, {
      root: cwd,
      ignore,
      query: searchActive ? '' : query.trim(),
      type: typeFilter,
      probed,
    })
  const treeWidth = treeSize.width > 0 ? treeSize.width : 320
  const treeHeight = treeSize.height > 0 ? treeSize.height : 480

  const onSearchActivate = (entry: FsEntry): void => {
    /* v8 ignore next -- search rows only mount while a workspace cwd exists */
    if (cwd === undefined) return
    selectOnly(entry.path)
    if (entry.type === 'file') {
      openFile(entry.path)
      return
    }
    setQuery('')
    setRevealPath(entry.path)
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      if (query !== '') {
        event.preventDefault()
        setQuery('')
      }
      return
    }
    if (search.status !== 'ready' || search.entries.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setSearchSelection(current => (
        (current + direction + search.entries.length) % search.entries.length
      ))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = search.entries[Math.min(searchSelection, search.entries.length - 1)]
      if (entry !== undefined) onSearchActivate(entry)
    }
  }

  return (
    <section className={css.root}>
      <div className={css.heading}>
        <div className={css.title}>{t('title')}</div>
        {cwd !== undefined && (
          <button
            type="button"
            className={css.refresh}
            aria-label={t('refresh.aria')}
            onClick={refreshExpanded}
          >
            <IconRefreshOutline16 size={16} />
          </button>
        )}
      </div>
      {cwd !== undefined && (
        <>
          <div className={css.filters}>
            <Input
              {...(css.search !== undefined ? { className: css.search } : {})}
              value={query}
              placeholder={t('search.placeholder')}
              aria-label={t('search.aria')}
              onChange={(event) => { setQuery(event.target.value) }}
              onKeyDown={onSearchKeyDown}
            />
            <select
              className={css.typeButton}
              aria-label={t('type.aria')}
              value={typeFilter}
              onChange={(event) => { setTypeFilter(event.target.value as ExplorerTypeFilter) }}
            >
              {TYPE_FILTERS.map(value => (
                <option key={value} value={value}>{t(`type.${value}`)}</option>
              ))}
            </select>
          </div>
          <div className={css.scope}>{t('search.scope')}</div>
        </>
      )}
      {!canOpenPath && <div className={css.notice} role="status">{t('open.unavailable')}</div>}
      {openNotice !== null && <div className={css.notice} role="status">{openNotice}</div>}
      {clipNotice !== null && <div className={css.notice} role="status">{clipNotice}</div>}
      {cwd === undefined && <div className={css.empty}>{t('empty.workspace')}</div>}
      {cwd !== undefined && searchActive && (
        <div className={css.searchPane}>
          {search.status === 'indexing' && <div className={css.empty} role="status">{t('search.indexing')}</div>}
          {search.status === 'loading' && <div className={css.empty} role="status">{t('search.loading')}</div>}
          {search.status === 'error' && <div className={css.empty} role="alert">{t('search.error')}: {search.message}</div>}
          {searchEmpty && <div className={css.empty}>{t('empty.search')}</div>}
          {search.status === 'ready' && search.truncated && (
            <div className={css.scope} role="status">{t('search.truncated')}</div>
          )}
          {search.status === 'ready' && search.entries.length > 0 && (
            <ul className={css.searchList} aria-label={t('search.results.aria')}>
              {search.entries.map((entry, index) => {
                const kind = entry.type === 'directory' ? 'directory' : 'file'
                const iconKind = explorerIconKind(kind, entry.name, false, entry.size)
                const rel = relativePosix(cwd, entry.path)
                const label = rel === '' ? entry.name : rel
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={index === searchSelection ? `${css.searchRow} ${css.searchSelected}` : css.searchRow}
                      aria-selected={index === searchSelection}
                      aria-label={kind === 'directory' ? t('folder.expand', { name: label }) : t('open.aria', { name: label })}
                      onClick={() => { onSearchActivate(entry) }}
                      onContextMenu={(event) => {
                        openContextMenu(event, {
                          kind: kind === 'directory' ? 'directory' : 'file',
                          path: entry.path,
                          name: entry.name,
                        })
                      }}
                    >
                      <span className={css.icon} data-icon={iconKind} aria-hidden>
                        <ExplorerGlyph kind={iconKind} open={false} />
                      </span>
                      <span className={css.searchText}>
                        <span className={css.searchName}>{highlightedText(entry.name, query)}</span>
                        <span className={css.searchPath}>{highlightedText(label, query)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {cwd !== undefined && !searchActive && searchEmpty && <div className={css.empty}>{t('empty.type')}</div>}
      {cwd !== undefined && (
        <div
          ref={treeHostRef}
          className={css.treeHost}
          hidden={treeHidden}
          onKeyDown={onTreeKeyDown}
          onDragLeave={onTreeDragLeave}
        >
          <ExplorerChromeContext.Provider value={{
            cwd,
            selected,
            revealedPath: activeReveal,
            dropTarget,
            revealedRef,
            t,
            onActivate: onRowActivate,
            onContextMenu: openContextMenu,
            onDragStart: onRowDragStart,
            onDragOver: onRowDragOver,
            onDrop: onRowDrop,
            onDragEnd: onRowDragEnd,
          }}>
            <Tree<ExplorerTreeNode>
              ref={treeApi}
              data={treeData}
              openByDefault={false}
              initialOpenState={{ [cwd]: true }}
              disableDrag
              disableDrop
              disableEdit
              disableSelect={node => node.kind === 'status'}
              dndBackend={noopDndBackend}
              indent={12}
              rowHeight={28}
              width={treeWidth}
              height={treeHeight}
              overscanCount={8}
              aria-label={t('tree.aria')}
              onToggle={onTreeToggle}
              onScroll={(event: { scrollOffset: number }) => {
                if (!treeHiddenRef.current) treeScroll.current = event.scrollOffset
              }}
              renderRow={ExplorerRow}
            >
              {nodeProps => <ExplorerNode {...nodeProps} />}
            </Tree>
          </ExplorerChromeContext.Provider>
        </div>
      )}
      <Menu
        open={menu !== null}
        anchor={null}
        items={menuItems}
        onSelect={onMenuSelect}
        onClose={() => { setMenu(null) }}
        portal
        compact
        getAnchorRect={() => new DOMRect(menuPoint.current.x, menuPoint.current.y, 0, 0)}
      />
      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        title={dialogTitle}
        closeLabel={t('dialog.close')}
        {...(dialog?.type === 'delete'
          ? {
            description: t(
              dialog.kind === 'directory' ? 'dialog.delete.folder' : 'dialog.delete.file',
              { name: dialog.name },
            ),
          }
          : {})}
        footer={(
          <>
            <Button variant="outline" className={css.modalAction} disabled={mutating} onClick={closeDialog}>
              {t('dialog.cancel')}
            </Button>
            <Button
              variant="primary"
              className={css.modalAction}
              disabled={submitDisabled}
              onClick={submitDialog}
            >
              {dialog?.type === 'writeText' || dialog?.type === 'mkdir'
                ? t('dialog.create')
                : dialog?.type === 'rename' ? t('dialog.confirm') : t('menu.delete')}
            </Button>
          </>
        )}
      >
        {(dialog?.type === 'writeText' || dialog?.type === 'mkdir' || dialog?.type === 'rename') && (
          <Input
            {...(css.field !== undefined ? { className: css.field } : {})}
            value={dialog.draft}
            aria-label={dialog.type === 'writeText'
              ? t('dialog.fileName')
              : dialog.type === 'mkdir' ? t('dialog.folderName') : t('dialog.name')}
            {...(dialog.type === 'writeText'
              ? { placeholder: t('dialog.untitledFile') }
              : dialog.type === 'mkdir'
                ? { placeholder: t('dialog.untitledFolder') }
                : {})}
            autoFocus
            disabled={mutating}
            onChange={(event) => {
              const draft = event.target.value
              setDialog((current) => {
                /* v8 ignore next -- the name field only mounts for writeText/mkdir/rename */
                if (current === null || current.type === 'delete') return current
                return { ...current, draft }
              })
            }}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !composingRef.current) {
                event.preventDefault()
                submitDialog()
              }
            }}
          />
        )}
        {dialogError !== null && <div className={css.dialogError} role="alert">{dialogError}</div>}
      </Modal>
    </section>
  )
}

type ExplorerRowProps = RowRendererProps<ExplorerTreeNode>

function rowClass(
  path: string,
  revealedPath: string | undefined,
  selected: ReadonlySet<string>,
  dropTarget: string | undefined,
): string {
  const revealed = revealedPath === path
  const isSelected = selected.has(path)
  const dropping = dropTarget === path
  const parts = [css.row]
  if (revealed) parts.push(css.revealed)
  if (isSelected) parts.push(css.selected)
  if (dropping) parts.push(css.dropTarget)
  return parts.join(' ')
}

function ExplorerRow({
  node, innerRef, attrs, children,
}: ExplorerRowProps): ReactElement {
  const {
    cwd, selected, revealedPath, dropTarget, revealedRef, t,
    onActivate, onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd,
  } = useExplorerChrome()
  const data = node.data
  const status = data.kind === 'status'
  const directory = data.kind === 'directory'
  const movable = !status && data.id !== cwd
  const revealed = revealedPath === data.id
  const isSelected = selected.has(data.id)
  const empty = data.empty === true
  const iconEmpty = data.iconEmpty === true
  const ariaLabel = directory
    ? (empty || !node.isOpen ? t('folder.expand', { name: data.name }) : t('folder.collapse', { name: data.name }))
    : data.kind === 'file' ? t('open.aria', { name: data.name }) : data.name
  const target: CrudTarget | undefined = status
    ? undefined
    : { kind: directory ? 'directory' : 'file', path: data.id, name: data.name }
  return (
    <div
      {...attrs}
      ref={(el) => {
        innerRef(el)
        if (revealed) revealedRef.current = el
      }}
      data-explorer-row=""
      data-empty={empty ? '' : undefined}
      data-icon={data.kind === 'status' ? undefined : explorerIconKind(data.kind, data.name, iconEmpty, data.size)}
      className={rowClass(data.id, revealedPath, selected, dropTarget)}
      style={attrs.style}
      draggable={movable}
      aria-label={ariaLabel}
      aria-selected={isSelected}
      aria-expanded={directory && !empty ? node.isOpen : undefined}
      aria-current={revealed ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation()
        if (target === undefined) return
        onActivate(event, target)
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey && directory && !empty) node.toggle()
      }}
      onContextMenu={(event) => {
        if (target === undefined) return
        onContextMenu(event, target)
      }}
      onDragStart={movable && target !== undefined ? (event) => { onDragStart(event, target) } : undefined}
      onDragOver={directory && target !== undefined ? (event) => { onDragOver(event, target) } : undefined}
      onDrop={directory && target !== undefined ? (event) => { onDrop(event, target) } : undefined}
      onDragEnd={movable ? onDragEnd : undefined}
    >
      {children}
    </div>
  )
}

function ExplorerNode({ node, style }: NodeRendererProps<ExplorerTreeNode>): ReactElement {
  const data = node.data
  const directory = data.kind === 'directory'
  const empty = data.empty === true
  const iconEmpty = data.iconEmpty === true
  const error = data.kind === 'status' && data.id.endsWith('__error')
  const iconKind = data.kind === 'status' ? undefined : explorerIconKind(data.kind, data.name, iconEmpty, data.size)
  const showChevron = directory && !empty
  return (
    <div style={style} className={empty ? `${css.node} ${css.emptyDir}` : css.node}>
      {!empty && (
        <span className={css.chevron} aria-hidden>
          {showChevron
            ? (node.isOpen ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />)
            : null}
        </span>
      )}
      <span className={css.icon} data-icon={iconKind} aria-hidden>
        {iconKind === undefined ? null : <ExplorerGlyph kind={iconKind} open={node.isOpen && !empty} />}
      </span>
      <span className={data.kind === 'status' ? css.childStatus : css.name} role={error ? 'alert' : undefined}>
        {data.name}
      </span>
    </div>
  )
}
