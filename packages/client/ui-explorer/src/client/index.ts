/**
 * Workspace file-tree plugin, browser half. Occupies the conversation-declared
 * `conversation.details.explorer` seat and the layout `preview` column.
 * Listing goes through IApiClient.host.listEntries; workspace search uses
 * host.searchEntries; file clicks write host.readText into the shared preview
 * store. Refresh re-lists expanded layers only; Reveal highlights a real
 * preview path or composer workspace-file chip under session cwd.
 * Multi-select drives copy/cut; paste uses host.copy or host.rename.
 * Dragging a row onto a folder is the same move as cut-and-paste. Double-
 * clicking a code file hands it, plus the workspace-root `.sln` when the
 * listing shows one, to host.openPath — Unity's script gesture. OS
 * openPath stays a context-menu action; "引用到聊天" inserts a workspace-file
 * chip into the composer like typing `@`. Preview Mod-L / toolbar reuse that
 * same insert path with an optional line-range suffix (never selected body).
 * Rich text extensions open an editable CodeMirror preview (swappable
 * text-preview engine). Preview appearance (preset / overrides / typography)
 * persists in Host settings namespace `ui-explorer-preview` and publishes
 * `--dsh-editor-*` via theme.overrideTokens. Expanded folders and preview
 * tab paths persist in localStorage (`dsh.explorer.tree.v1`) keyed by
 * workspace cwd inside one root-scoped browse store — drafts and listing
 * bodies never land on disk.
 */
import type { ConnectionHandle, FsEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the explorer seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ctx.layout (header opener) and ctx.conversation.input.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls settings.general.item SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.theme Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { ExplorerPanel, folderLabel, type ExplorerInjected } from './ExplorerPanel.tsx'
import { FilePreviewPanel, type FilePreviewInjected } from './FilePreviewPanel.tsx'
import { FilesOpenAction, type FilesOpenActionInjected } from './FilesOpenAction.tsx'
import { EditorPreviewRow, type EditorPreviewRowInjected } from './EditorPreviewRow.tsx'
import {
  bindEditorPreviewSettings, EditorPreviewAppearance,
} from './editor-preview-appearance.ts'
import { relativePosix } from './ignore.ts'
import {
  createExplorerTreeStore, createFilePreviewStore, explorerBucketOf,
} from './stores.ts'
import { en, NS, zh, type ExplorerKey } from './locales.ts'
import { createRevealRequests } from './reveal-requests.ts'
import { formatLineSuffix, parseReference, withLineRange, type LineRange } from './workspace-reference.ts'

export type { ExplorerInjected } from './ExplorerPanel.tsx'
export type { FilesOpenActionInjected } from './FilesOpenAction.tsx'
export type { ExplorerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The details file tree and header opener copy. */
    explorer: ExplorerKey
  }
}

/**
 * Required services. The explorer seat is declared by ui-conversation's
 * details entry; the preview column by ui-layout's root frame. Apply
 * order is unconstrained — registrations wait through `slots.inject()`.
 * `theme` and `settingsScope` drive preview appearance persistence.
 */
export const inject = [
  'slots', 'workspaces', 'locale', 'connection', 'layout', 'conversation',
  'sessions', 'settingsScope', 'theme',
]

/** Workspace-relative chip label; falls back to basename when outside cwd. */
function workspaceLabel(cwd: string, path: string): string {
  const rel = relativePosix(cwd, path)
  return rel === '' ? folderLabel(path) : rel
}

/**
 * Client plugin body: register the tree, preview column, header opener, and
 * General Settings editor-preview row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-explorer: dictionaries')

  const appearance = new EditorPreviewAppearance(ctx, bindEditorPreviewSettings(ctx))

  const connection = ctx.get('connection') as ConnectionHandle
  const canOpenPath: HostObservable<boolean> = {
    getSnapshot: () => connection.hostDescription.getSnapshot()?.canOpenPath === true,
    subscribe: listener => connection.hostDescription.subscribe(listener),
  }

  // Reveal requests from other plugins (composer reference chips). The tree
  // itself decides what a request means — expand the ancestors, highlight the
  // row, scroll it into view — and drops one whose path lies outside the
  // session workspace or no longer lists, so a stale chip cannot break it.
  const reveals = createRevealRequests()

  const previewStore = createFilePreviewStore()
  // Root-scoped: no session scopeKey, so the persist key stays
  // `dsh.explorer.tree.v1` and buckets stay keyed by cwd inside state.
  const treeStore = createExplorerTreeStore().create()

  type HostResult<T> = { result: { ok: true; value: T } | { ok: false; error: { message: string } } }
  type ListHost = {
    listEntries?: (
      payload: { path: string; root?: string },
      signal?: AbortSignal,
    ) => Promise<HostResult<{ entries: readonly FsEntry[] }>>
    listDirectory?: (
      payload: { path: string; root?: string },
      signal?: AbortSignal,
    ) => Promise<HostResult<{ entries: readonly FsEntry[] }>>
  }
  type SearchHost = {
    searchEntries?: (
      payload: { root: string; query: string },
      signal?: AbortSignal,
    ) => Promise<HostResult<{ entries: readonly FsEntry[]; truncated: boolean }>>
  }
  type ReadHost = {
    readText?: (payload: { path: string }) => Promise<HostResult<{ content: string }>>
  }

  /**
   * Shared insert path for tree "引用到聊天" and preview Mod-L / toolbar.
   * Optional line range suffixes label, clipboardText, and codec ref alike;
   * selected body text is never uploaded.
   */
  const insertWorkspaceReference = (
    sessionId: SessionId,
    path: string,
    lines?: LineRange | null,
  ): boolean => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined || cwd === '') return false
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) return false
    const input = ctx.conversation.input.for(binding.ctx)
    const snap = input.state.getSnapshot()
    const span = { start: snap.draft.length, end: snap.draft.length, draftRev: snap.draftRev }
    const suffix = formatLineSuffix(lines)
    const ref = withLineRange(path, lines)
    return input.insertReference({
      source: 'workspace-file',
      ref,
      label: workspaceLabel(cwd, path) + suffix,
      clipboardText: ref,
    }, span)
  }

  const explorerInjected = (): ExplorerInjected => ({
    listEntries: async (path, signal) => {
      const host = connection.api.host as unknown as ListHost
      const list = host.listEntries ?? host.listDirectory
      if (list === undefined) throw new Error('当前运行时不支持目录列举')
      const snap = ctx.sessions.list.getSnapshot()
      let root: string | undefined
      const normPath = path.replace(/\\/g, '/')
      for (const session of Object.values(snap.byId)) {
        const cwd = session.cwd
        if (cwd === undefined || cwd === '') continue
        const normRoot = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
        if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
          if (root === undefined || normRoot.length > root.replace(/\\/g, '/').replace(/\/+$/, '').length)
            root = cwd
        }
      }
      const response = await list({ path, ...(root !== undefined ? { root } : {}) }, signal)
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.entries
    },
    searchEntries: async (root, query, signal) => {
      const host = connection.api.host as unknown as SearchHost
      if (host.searchEntries === undefined) throw new Error('当前运行时不支持工作区搜索')
      const response = await host.searchEntries({ root, query }, signal)
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value
    },
    openPath: async (path) => {
      await ctx.workspaces.openPath(path)
    },
    revealOsPath: async (path) => {
      await ctx.workspaces.revealPath(path)
    },
    readText: async (path) => {
      const host = connection.api.host as unknown as ReadHost
      if (host.readText === undefined) throw new Error('当前运行时不支持读取文件')
      const response = await host.readText({ path })
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.content
    },
    writeText: async (path) => {
      const response = await connection.api.host.writeText({ path })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
    mkdir: async (path) => {
      const response = await connection.api.host.mkdir({ path })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
    rename: async (from, to) => {
      const response = await connection.api.host.rename({ from, to })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
    copy: async (from, to) => {
      const response = await connection.api.host.copy({ from, to })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
    delete: async (path) => {
      const response = await connection.api.host.delete({ path })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
    insertWorkspaceReference: (sessionId, path, lines) => insertWorkspaceReference(sessionId, path, lines),
    openPreview: () => { ctx.layout.openPreview() },
    treeBucket: workspaceKey => explorerBucketOf(treeStore.getSnapshot(), workspaceKey),
    persistExpanded: (workspaceKey, expanded) => {
      treeStore.actions.setExpanded(workspaceKey, expanded)
    },
    persistPreviewTabs: (workspaceKey, paths, activePath) => {
      treeStore.actions.setPreviewTabs(workspaceKey, paths, activePath)
    },
    retainExplorerKeys: (workspaceKeys) => {
      treeStore.actions.retainAccountKeys(workspaceKeys)
    },
    hooks: { canOpenPath, revealRequest: reveals.source },
  })

  const filesInjected = (): FilesOpenActionInjected => ({
    openDetails: () => { ctx.layout.openDetails() },
  })

  ctx.slots.inject('conversation.details.explorer', () => ctx.slots.register({
    name: 'conversation.details.explorer',
    locale: NS,
    inject: explorerInjected,
    store: previewStore,
  }, ExplorerPanel))

  ctx.slots.inject('preview', () => ctx.slots.register({
    name: 'preview',
    locale: NS,
    store: previewStore,
    inject: (): FilePreviewInjected => ({
      closePreview: () => { ctx.layout.closePreview() },
      writeText: async (path, content) => {
        const response = await connection.api.host.writeText({ path, content })
        if (!response.result.ok) throw new Error(response.result.error.message)
      },
      persistPreviewTabs: (workspaceKey, paths, activePath) => {
        treeStore.actions.setPreviewTabs(workspaceKey, paths, activePath)
      },
      insertWorkspaceReference,
      hooks: { showLineNumbers: appearance.showLineNumbers, revealRequest: reveals.source },
    }),
  }, FilePreviewPanel))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'files-open',
    order: 5,
    locale: NS,
    inject: filesInjected,
  }, FilesOpenAction))

  // The optional file-browser face the composer reaches via ctx.get: a
  // reference chip knows its path, this plugin knows how to show it. Opening
  // the details panel is part of the answer — a request that only highlighted a
  // hidden row would look like nothing happened.
  ctx.provide('workspaceReveal', {
    reveal: (ref) => {
      const { path, lines } = parseReference(ref)
      if (path === '') return
      // Show both surfaces: the tree row and its preview tab. A request that
      // only highlighted a row in a closed panel would look like nothing
      // happened; opening the preview is where a line range lands.
      ctx.layout.openDetails()
      ctx.layout.openPreview()
      reveals.request(path, lines)
    },
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'editor-preview',
    order: 25,
    locale: NS,
    inject: (): EditorPreviewRowInjected => ({
      hooks: { editorSettings: appearance.settings },
      setPreset: (id) => { appearance.setPreset(id) },
      patchOverrides: (patch) => { appearance.patchOverrides(patch) },
      restoreDefaults: () => { appearance.restoreDefaults() },
    }),
  }, EditorPreviewRow))
}
