/**
 * Shared file-preview viewing store and the browser-persisted explorer browse
 * store. The preview store holds live tab bodies (draft/dirty stay in memory).
 * The tree store persists expanded folders and preview tab paths per workspace
 * cwd under one root localStorage key — never via session scopeKey.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** localStorage key for explorer browse state (bump on breaking shape changes). */
export const EXPLORER_TREE_PERSIST_KEY = 'dsh.explorer.tree.v1'

/** Per-tab read states — loading until host.readText settles, then ready or error. */
export type FilePreviewStatus = 'loading' | 'ready' | 'error'

/**
 * One open preview tab. `content` is the last loaded / saved disk text when
 * ready; `draft` is the in-editor buffer; `dirty` is draft !== content.
 */
export type FilePreviewTab = {
  path: string
  status: FilePreviewStatus
  content: string
  draft: string
  dirty: boolean
  message: string
}

/** Preview column snapshot: open tabs in click order, and the active path (`''` when none). */
export type FilePreviewState = {
  tabs: FilePreviewTab[]
  activePath: string
}

/** Annotation twin of the actions literal below. */
type FilePreviewActions = {
  showLoading: (draft: FilePreviewState, path: string) => void
  showText: (draft: FilePreviewState, path: string, content: string) => void
  showError: (draft: FilePreviewState, path: string, message: string) => void
  setDraft: (draft: FilePreviewState, path: string, text: string) => void
  markSaved: (draft: FilePreviewState, path: string) => void
  activate: (draft: FilePreviewState, path: string) => void
  close: (draft: FilePreviewState, path: string) => void
  clear: (draft: FilePreviewState) => void
}

/** Empty tab row used when opening a path. */
function emptyTab(path: string): FilePreviewTab {
  return { path, status: 'loading', content: '', draft: '', dirty: false, message: '' }
}

/** The tab for `path`, or undefined once it was closed (a settling read must not resurrect it). */
export function tabOf(state: FilePreviewState, path: string): FilePreviewTab | undefined {
  return state.tabs.find(tab => tab.path === path)
}

/** The tab the preview column renders, or undefined when nothing is open. */
export function activeTab(state: FilePreviewState): FilePreviewTab | undefined {
  return tabOf(state, state.activePath)
}

/**
 * Create the file-preview viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createFilePreviewStore(): EngineStoreHandle<FilePreviewState, FilePreviewActions> {
  return defineStore({
    init: (): FilePreviewState => ({ tabs: [], activePath: '' }),
    actions: {
      showLoading: (d, path: string) => {
        const tab = d.tabs.find(row => row.path === path)
        if (tab === undefined) d.tabs.push(emptyTab(path))
        else {
          tab.status = 'loading'
          tab.content = ''
          tab.draft = ''
          tab.dirty = false
          tab.message = ''
        }
        d.activePath = path
      },
      showText: (d, path: string, content: string) => {
        const tab = d.tabs.find(row => row.path === path)
        if (tab === undefined) return
        tab.status = 'ready'
        tab.content = content
        tab.draft = content
        tab.dirty = false
        tab.message = ''
      },
      showError: (d, path: string, message: string) => {
        const tab = d.tabs.find(row => row.path === path)
        if (tab === undefined) return
        tab.status = 'error'
        tab.content = ''
        tab.draft = ''
        tab.dirty = false
        tab.message = message
      },
      setDraft: (d, path: string, text: string) => {
        const tab = d.tabs.find(row => row.path === path)
        if (tab === undefined || tab.status !== 'ready') return
        tab.draft = text
        tab.dirty = text !== tab.content
      },
      markSaved: (d, path: string) => {
        const tab = d.tabs.find(row => row.path === path)
        if (tab === undefined || tab.status !== 'ready') return
        tab.content = tab.draft
        tab.dirty = false
      },
      activate: (d, path: string) => {
        if (d.tabs.some(row => row.path === path)) d.activePath = path
      },
      close: (d, path: string) => {
        const at = d.tabs.findIndex(row => row.path === path)
        if (at < 0) return
        d.tabs.splice(at, 1)
        if (d.activePath !== path) return
        const next = d.tabs[Math.min(at, d.tabs.length - 1)]
        d.activePath = next === undefined ? '' : next.path
      },
      clear: (d) => {
        d.tabs = []
        d.activePath = ''
      },
    },
  })
}

/**
 * Per-workspace browse facts that survive a hard reload. Only paths — never
 * listing bodies, drafts, dirty flags, or scroll offsets.
 */
export type ExplorerTreeBucket = {
  /** Absolute directory paths currently expanded (includes the workspace root when open). */
  expanded: string[]
  /** Open preview tab paths in click order. */
  previewPaths: string[]
  /** Active preview path, or `''` when none. */
  activePath: string
}

/** Root-scoped explorer browse state: one bucket per workspace cwd. */
export type ExplorerTreeState = {
  byWorkspace: Record<string, ExplorerTreeBucket>
}

/** Annotation twin of the explorer-tree actions literal below. */
type ExplorerTreeActions = {
  setExpanded: (draft: ExplorerTreeState, workspaceKey: string, expanded: readonly string[]) => void
  setPreviewTabs: (
    draft: ExplorerTreeState,
    workspaceKey: string,
    paths: readonly string[],
    activePath: string,
  ) => void
  retainAccountKeys: (draft: ExplorerTreeState, workspaceKeys: readonly string[]) => void
}

/** Empty bucket used when a workspace has never been visited. */
export function emptyExplorerBucket(): ExplorerTreeBucket {
  return { expanded: [], previewPaths: [], activePath: '' }
}

/**
 * Bucket for `workspaceKey`, or an empty bucket when none is stored yet.
 * @param state - explorer tree snapshot.
 * @param workspaceKey - session cwd / workspace path.
 * @returns the bucket (never shared mutable state from `state` when absent).
 */
export function explorerBucketOf(state: ExplorerTreeState, workspaceKey: string): ExplorerTreeBucket {
  return state.byWorkspace[workspaceKey] ?? emptyExplorerBucket()
}

/** Ensure a mutable bucket exists under `workspaceKey` and return it. */
function ensureBucket(draft: ExplorerTreeState, workspaceKey: string): ExplorerTreeBucket {
  const existing = draft.byWorkspace[workspaceKey]
  if (existing !== undefined) return existing
  const created = emptyExplorerBucket()
  draft.byWorkspace[workspaceKey] = created
  return created
}

/**
 * Create the root-scoped explorer browse store (expanded folders + preview tab
 * paths). Call `.create()` with no scopeKey so the persist key stays
 * {@link EXPLORER_TREE_PERSIST_KEY} and buckets stay keyed by cwd inside state.
 * @returns the store handle.
 */
export function createExplorerTreeStore(): EngineStoreHandle<ExplorerTreeState, ExplorerTreeActions> {
  return defineStore({
    init: (): ExplorerTreeState => ({ byWorkspace: {} }),
    persist: EXPLORER_TREE_PERSIST_KEY,
    actions: {
      setExpanded: (d, workspaceKey: string, expanded: readonly string[]) => {
        ensureBucket(d, workspaceKey).expanded = [...expanded]
      },
      setPreviewTabs: (d, workspaceKey: string, paths: readonly string[], activePath: string) => {
        const bucket = ensureBucket(d, workspaceKey)
        bucket.previewPaths = [...paths]
        bucket.activePath = activePath
      },
      retainAccountKeys: (d, workspaceKeys: readonly string[]) => {
        const retained = new Set(workspaceKeys)
        d.byWorkspace = Object.fromEntries(
          Object.entries(d.byWorkspace).filter(([key]) => retained.has(key)),
        )
      },
    },
  })
}
