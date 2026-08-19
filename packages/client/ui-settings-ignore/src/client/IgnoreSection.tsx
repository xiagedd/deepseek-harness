import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IgnoreFileState } from './ignore-io.ts'
import { resolveWorkspaceRoot } from './ignore-io.ts'
import css from './IgnoreSection.module.css'

/** Registration-side Host face used by the section. */
export interface IgnoreSectionInjected {
  /** Probe `.dshignore` / `.cursorignore` under one workspace root. */
  load: (root: string) => Promise<IgnoreFileState>
  /** Create or replace workspace-root `.dshignore`. */
  save: (path: string, content: string) => Promise<void>
}

/** Full component props assembled by the Settings slot renderer. */
export type IgnoreSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.ignore'>
  & InjectFace<IgnoreSectionInjected>

type ViewState =
  | { readonly status: 'no-workspace' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
    readonly status: 'ready'
    readonly root: string
    readonly path: string
    readonly exists: boolean
    readonly cursorFallback: boolean
    readonly draft: string
    readonly dirty: boolean
  }

/** Render the Ignore Settings section. */
export function IgnoreSection({
  load, save, t, useSessions, useWorkspaces,
}: IgnoreSectionProps): ReactNode {
  const currentSessionId = useSessions(list => list.current)
  const sessionsById = useSessions(list => list.byId)
  const recentWorkspaceId = useWorkspaces(state => state.recentWorkspaceId)
  const workspaces = useWorkspaces(state => state.items)
  const root = resolveWorkspaceRoot({
    currentSessionId,
    sessionsById,
    recentWorkspaceId,
    workspaces,
  })

  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>(
    root === undefined ? { status: 'no-workspace' } : { status: 'loading' },
  )
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'failed' | null>(null)

  useEffect(() => {
    if (root === undefined) {
      setState({ status: 'no-workspace' })
      setFeedback(null)
      return
    }
    let current = true
    setState({ status: 'loading' })
    setFeedback(null)
    void load(root).then(
      (file) => {
        if (!current) return
        setState({
          status: 'ready',
          root,
          path: file.path,
          exists: file.exists,
          cursorFallback: file.cursorFallback,
          draft: file.content,
          dirty: false,
        })
      },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [load, root, request])

  const retry = (): void => {
    setState(root === undefined ? { status: 'no-workspace' } : { status: 'loading' })
    setFeedback(null)
    setRequest(value => value + 1)
  }

  const onSave = async (): Promise<void> => {
    if (state.status !== 'ready' || saving) return
    setSaving(true)
    setFeedback(null)
    try {
      await save(state.path, state.draft)
      setState({
        ...state,
        exists: true,
        cursorFallback: false,
        dirty: false,
      })
      setFeedback('saved')
    } catch {
      setFeedback('failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || saving}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <p className={css.hint}>{t('syntaxHint')}</p>

      {state.status === 'no-workspace' && (
        <p className={css.status} role="status">{t('noWorkspace')}</p>
      )}

      {state.status === 'loading' && <p className={css.status} role="status">{t('loading')}</p>}

      {state.status === 'error' && (
        <div className={css.failure} role="alert">
          <p>{t('error')}</p>
          <button type="button" className={css.retry} onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <p className={css.path}>{t('pathLabel')}: {state.path}</p>
          {!state.exists && !state.cursorFallback && (
            <p className={css.banner} role="status">{t('missingHint')}</p>
          )}
          {state.cursorFallback && (
            <p className={css.banner} role="status">{t('cursorHint')}</p>
          )}
          <label className={css.status} htmlFor="dshignore-editor">{t('editorLabel')}</label>
          <textarea
            id="dshignore-editor"
            className={css.editor}
            value={state.draft}
            spellCheck={false}
            onChange={(event) => {
              const draft = event.target.value
              setState({ ...state, draft, dirty: true })
              setFeedback(null)
            }}
          />
          <div className={css.actions}>
            <button
              type="button"
              className={css.save}
              disabled={saving || (!state.dirty && state.exists)}
              onClick={() => { void onSave() }}
            >
              {saving ? t('saving') : t('save')}
            </button>
            {feedback === 'saved' && <p className={css.feedback} role="status">{t('saved')}</p>}
            {feedback === 'failed' && <p className={css.feedbackError} role="alert">{t('saveFailed')}</p>}
          </div>
        </>
      )}
    </div>
  )
}
