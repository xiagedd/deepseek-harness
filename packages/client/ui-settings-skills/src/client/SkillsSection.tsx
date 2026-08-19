import { useEffect, useState, type ReactNode } from 'react'
import type { SkillInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveWorkspaceRoot } from './workspace-root.ts'
import css from './SkillsSection.module.css'

/** Registration-side Remote face used by the section. */
export interface SkillsSectionInjected {
  /** Read the current skill inventory for one workspace cwd. */
  list: (cwd?: string) => Promise<SkillInventorySnapshot>
  /** Persist model-facing enablement for one skill file and return a fresh snapshot. */
  setModelInvocable: (path: string, modelInvocable: boolean, cwd?: string) => Promise<SkillInventorySnapshot>
  /** Open a skill file with the OS default application. */
  openPath: (path: string) => Promise<void>
}

/** Full component props assembled by the Settings slot renderer. */
export type SkillsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skills'>
  & InjectFace<SkillsSectionInjected>

type SkillEntry = SkillInventorySnapshot['entries'][number]

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: SkillInventorySnapshot }

/** Substitute `{name}` placeholders in a locale string. */
function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

/** Render the Skills Settings section. */
export function SkillsSection({
  list, setModelInvocable, openPath, t, useSessions, useWorkspaces,
}: SkillsSectionProps): ReactNode {
  const currentSessionId = useSessions(listState => listState.current)
  const sessionsById = useSessions(listState => listState.byId)
  const recentWorkspaceId = useWorkspaces(state => state.recentWorkspaceId)
  const workspaces = useWorkspaces(state => state.items)
  const root = resolveWorkspaceRoot({
    currentSessionId,
    sessionsById,
    recentWorkspaceId,
    workspaces,
  })

  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [actionError, setActionError] = useState<'toggle' | 'open' | null>(null)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void Promise.resolve().then(() => list(root)).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request, root])

  const retry = (): void => {
    setState({ status: 'loading' })
    setActionError(null)
    setRequest(value => value + 1)
  }

  const onToggle = async (entry: SkillEntry): Promise<void> => {
    if (pendingPath !== null) return
    setPendingPath(entry.path)
    setActionError(null)
    try {
      const snapshot = await setModelInvocable(entry.path, !entry.modelInvocable, root)
      setState({ status: 'ready', snapshot })
    } catch {
      setActionError('toggle')
    } finally {
      setPendingPath(null)
    }
  }

  const onOpen = async (entry: SkillEntry): Promise<void> => {
    if (pendingPath !== null) return
    setPendingPath(entry.path)
    setActionError(null)
    try {
      await openPath(entry.path)
    } catch {
      setActionError('open')
    } finally {
      setPendingPath(null)
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || pendingPath !== null}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <p className={css.hint}>{t('effectHint')}</p>
      {root === undefined && <p className={css.status} role="status">{t('noWorkspace')}</p>}

      {state.status === 'loading' && <p className={css.status} role="status">{t('loading')}</p>}

      {state.status === 'error' && (
        <div className={css.failure} role="alert">
          <p>{t('error')}</p>
          <button type="button" className={css.retry} onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {state.status === 'ready' && state.snapshot.entries.length === 0 && (
        <p className={css.status} role="status">{t('empty')}</p>
      )}

      {state.status === 'ready' && state.snapshot.entries.length > 0 && (
        <div className={css.catalog}>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span data-skills-count>{state.snapshot.entries.length}</span>
          </div>
          <ul className={css.list}>
            {state.snapshot.entries.map((entry) => {
              const busy = pendingPath === entry.path
              return (
                <li key={entry.path} className={css.row}>
                  <div className={css.meta}>
                    <div className={css.name}>{entry.name}</div>
                    <div className={css.details}>
                      <span>{t('source')}: {entry.source}</span>
                      <span>{entry.modelInvocable ? t('modelOn') : t('modelOff')}</span>
                      <span title={entry.path}>{entry.path}</span>
                    </div>
                  </div>
                  <div className={css.trailing}>
                    <button
                      type="button"
                      className={css.open}
                      aria-label={format(t('openNamed'), { name: entry.name })}
                      disabled={pendingPath !== null}
                      onClick={() => { void onOpen(entry) }}
                    >
                      {t('open')}
                    </button>
                    <button
                      type="button"
                      className={css.switch}
                      role="switch"
                      aria-checked={entry.modelInvocable}
                      aria-label={format(entry.modelInvocable ? t('disable') : t('enable'), { name: entry.name })}
                      aria-busy={busy || undefined}
                      disabled={pendingPath !== null}
                      onClick={() => { void onToggle(entry) }}
                    >
                      <span className={css.thumb} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {actionError === 'toggle' && <p className={css.toggleError} role="alert">{t('toggleFailed')}</p>}
          {actionError === 'open' && <p className={css.toggleError} role="alert">{t('openFailed')}</p>}
        </div>
      )}
    </div>
  )
}
