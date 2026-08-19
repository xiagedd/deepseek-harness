/**
 * Editable file preview occupying the layout `preview` column. Every file
 * click in the tree opens a tab here; ready text mounts a swappable
 * text-preview engine (CodeMirror 6 today) with save via host.writeText.
 * Binary / oversized stay error or status fallbacks. Mod-L / toolbar
 * "引用到聊天" insert a workspace-file chip (path + optional line range)
 * through the same inject path as the tree's addToChat menu.
 */
import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { SnapshotStore, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { folderLabel, sessionCwd } from './ExplorerPanel.tsx'
import { activeTab, type createFilePreviewStore } from './stores.ts'
import { TextPreviewBody } from './TextPreviewBody.tsx'
import type { LineRange } from './workspace-reference.ts'
import type { RevealRequest } from './reveal-requests.ts'
import css from './FilePreviewPanel.module.css'

/** Injected layout + save + chat-reference face of the preview column. */
export interface FilePreviewInjected {
  /** Close the layout file-preview column (independent of the details tree). */
  closePreview: () => void
  /**
   * Persist UTF-8 text through `host.writeText({ path, content })`.
   * @param path - absolute file path.
   * @param content - full file body to write.
   */
  writeText: (path: string, content: string) => Promise<void>
  /**
   * Persist preview tab paths only for a workspace cwd (never draft/dirty/body).
   * @param workspaceKey - session cwd.
   * @param paths - open tab paths in click order.
   * @param activePath - active tab path, or `''` when none.
   */
  persistPreviewTabs: (workspaceKey: string, paths: readonly string[], activePath: string) => void
  /**
   * Insert one workspace-file reference chip into the session composer.
   * Same path as the tree "引用到聊天" action; optional line range suffixes
   * the chip label / clipboard / model ref.
   * @param sessionId - active session.
   * @param path - absolute host path.
   * @param lines - inclusive 1-based selection range, or omit/null for whole file.
   * @returns false when no session binding / composer refused the insert.
   */
  insertWorkspaceReference: (
    sessionId: SessionId,
    path: string,
    lines?: LineRange | null,
  ) => boolean
  hooks: {
    /** Line-number preference from Host settings (Compartment-driven). */
    showLineNumbers: SnapshotStore<boolean>
    /**
     * Latest external reveal request (a composer reference-chip click). When
     * it names the active tab and carries a line range, the editor scrolls to
     * and selects it; the seq re-fires so clicking the same chip re-scrolls.
     */
    revealRequest: HostObservable<RevealRequest | undefined>
  }
}

/** Full preview-slot props: session kit, shared preview store, layout face, locale. */
export type FilePreviewPanelProps =
  PropsRuntime<'preview'>
  & PropsStore<ReturnType<typeof createFilePreviewStore>>
  & InjectFace<FilePreviewInjected>
  & PropsLocale<'explorer'>

/**
 * Preview pane with one tab per file; ready text is editable and savable.
 * @param props - preview store snapshot plus actions, save face, and explorer locale.
 * @returns the preview column body.
 */
export function FilePreviewPanel({
  sessionId, useSessions, useStore, actions, closePreview, writeText, persistPreviewTabs,
  insertWorkspaceReference, useShowLineNumbers, useRevealRequest, t,
}: FilePreviewPanelProps): ReactNode {
  const cwd = useSessions(list => sessionCwd(list, sessionId))
  const tabs = useStore(state => state.tabs)
  const active = useStore(state => activeTab(state))
  const showLineNumbers = useShowLineNumbers(value => value)
  const revealRequest = useRevealRequest(request => request)
  // The line target for the editor: only when the latest reveal names the tab
  // now showing and carried a range. The seq keys the editor's scroll effect
  // so clicking the same chip again re-scrolls even though the tab is current.
  const revealTarget = active !== undefined
    && revealRequest?.lines !== undefined
    && revealRequest.path === active.path
    ? { ...revealRequest.lines, seq: revealRequest.seq }
    : undefined
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clipNotice, setClipNotice] = useState<string | null>(null)
  const [chatMenu, setChatMenu] = useState<{ x: number; y: number } | null>(null)
  const chatMenuPoint = useRef({ x: 0, y: 0 })
  const addToChatApiRef = useRef<{ invoke: () => void } | null>(null)

  const rememberTabs = (paths: readonly string[], activePath: string): void => {
    if (cwd === undefined) return
    persistPreviewTabs(cwd, paths, activePath)
  }

  const activateKey = (event: KeyboardEvent<HTMLDivElement>, path: string): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    actions.activate(path)
    rememberTabs(tabs.map(tab => tab.path), path)
  }

  const close = (event: MouseEvent<HTMLButtonElement>, path: string): void => {
    event.stopPropagation()
    const at = tabs.findIndex(tab => tab.path === path)
    const nextTabs = tabs.filter(tab => tab.path !== path)
    const nextActive = active?.path !== path
      ? (active?.path ?? '')
      : (nextTabs[Math.min(Math.max(at, 0), Math.max(nextTabs.length - 1, 0))]?.path ?? '')
    actions.close(path)
    rememberTabs(nextTabs.map(tab => tab.path), nextActive)
    if (tabs.length <= 1) closePreview()
  }

  const saveActive = (): void => {
    if (active === undefined || active.status !== 'ready' || !active.dirty || saving) return
    const path = active.path
    const content = active.draft
    setSaving(true)
    setSaveError(null)
    void writeText(path, content).then(() => {
      actions.markSaved(path)
      setSaving(false)
    }, (reason: unknown) => {
      setSaving(false)
      setSaveError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const addActiveToChat = (range: LineRange | null): void => {
    if (active === undefined || active.status !== 'ready') return
    setClipNotice(null)
    if (!insertWorkspaceReference(sessionId, active.path, range)) {
      setClipNotice(t('menu.addToChat.failed'))
    }
  }

  /**
   * Same action as Ctrl+L / toolbar: the editor's held invoke reads the live
   * selection (or whole file when empty). The context menu is only a second
   * entry — never a parallel chip builder.
   */
  const invokeAddToChat = (): void => {
    const api = addToChatApiRef.current
    if (api !== null) api.invoke()
    else addActiveToChat(null)
  }

  const openChatMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    chatMenuPoint.current = { x: event.clientX, y: event.clientY }
    setChatMenu({ x: event.clientX, y: event.clientY })
  }

  const chatMenuItems: readonly MenuEntry[] = [
    { id: 'addToChat', label: t('menu.addToChat') },
  ]

  return (
    <section className={css.root} aria-label={t('preview.aria')}>
      {tabs.length > 0 && (
        <div className={css.tabs} role="tablist" aria-label={t('preview.tabs.aria')}>
          {tabs.map((tab) => {
            const name = folderLabel(tab.path)
            return (
              <div
                key={tab.path}
                className={css.tab}
                role="tab"
                tabIndex={0}
                title={tab.path}
                aria-selected={tab.path === active?.path}
                data-active={tab.path === active?.path || undefined}
                data-dirty={tab.dirty || undefined}
                onClick={() => {
                  actions.activate(tab.path)
                  rememberTabs(tabs.map(row => row.path), tab.path)
                }}
                onKeyDown={(event) => { activateKey(event, tab.path) }}
              >
                <span className={css.tabName}>
                  {tab.dirty ? `${name} •` : name}
                </span>
                <button
                  type="button"
                  className={css.close}
                  aria-label={t('preview.close', { name })}
                  onClick={(event) => { close(event, tab.path) }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
      {clipNotice !== null && <div className={css.notice} role="status">{clipNotice}</div>}
      {active === undefined
        ? <div className={css.empty} role="status">{t('preview.empty')}</div>
        : active.status === 'loading'
          ? <div className={css.empty} role="status">{t('preview.loading')}</div>
          : active.status === 'error'
            ? (
              <pre className={css.body} data-error role="alert">
                {active.message}
              </pre>
            )
            : (
              <div className={css.editorColumn}>
                <div className={css.toolbar}>
                  <button
                    type="button"
                    className={css.save}
                    disabled={!active.dirty || saving}
                    onClick={saveActive}
                  >
                    {saving ? t('preview.saving') : t('preview.save')}
                  </button>
                  <button
                    type="button"
                    className={css.save}
                    onClick={() => { invokeAddToChat() }}
                  >
                    {t('preview.addToChat')}
                  </button>
                  <span className={css.hint}>{t('preview.addToChatHint')}</span>
                  <span className={css.hint}>{t('preview.saveHint')}</span>
                  {saveError !== null && (
                    <span className={css.saveError} role="alert">{saveError}</span>
                  )}
                </div>
                <div className={css.editorHost} onContextMenu={openChatMenu}>
                  <TextPreviewBody
                    path={active.path}
                    text={active.draft}
                    readOnly={false}
                    showLineNumbers={showLineNumbers}
                    revealTarget={revealTarget}
                    onChange={(text) => { actions.setDraft(active.path, text) }}
                    onSave={saveActive}
                    onAddToChat={addActiveToChat}
                    addToChatApiRef={addToChatApiRef}
                    className={css.body}
                    copy={{
                      loading: t('preview.loading'),
                      tooLarge: t('preview.tooLarge'),
                    }}
                  />
                </div>
              </div>
            )}
      <Menu
        open={chatMenu !== null}
        anchor={null}
        items={chatMenuItems}
        onSelect={(id) => {
          setChatMenu(null)
          if (id === 'addToChat') invokeAddToChat()
        }}
        onClose={() => { setChatMenu(null) }}
        portal
        compact
        getAnchorRect={() => new DOMRect(chatMenuPoint.current.x, chatMenuPoint.current.y, 0, 0)}
      />
    </section>
  )
}
