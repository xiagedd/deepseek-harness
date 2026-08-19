import { useEffect, useState, type ReactNode } from 'react'
import type { RulesInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveWorkspaceRoot } from './workspace-root.ts'
import css from './RulesSection.module.css'

/** Registration-side Remote face used by the section. */
export interface RulesSectionInjected {
  /** Read the current rules inventory for one workspace cwd. */
  list: (cwd?: string) => Promise<RulesInventorySnapshot>
  /** Create a missing default AGENTS.md and return a fresh snapshot. */
  create: (target: 'user-global' | 'project-root', cwd?: string) => Promise<RulesInventorySnapshot>
  /** Open an instruction file with the OS default application. */
  openPath: (path: string) => Promise<void>
}

/** Full component props assembled by the Settings slot renderer. */
export type RulesSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.rules'>
  & InjectFace<RulesSectionInjected>

type RulesEntry = RulesInventorySnapshot['entries'][number]

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: RulesInventorySnapshot }

/** Substitute `{name}` placeholders in a locale string. */
function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

/** Render the Rules Settings section. */
export function RulesSection({
  list, create, openPath, t, useSessions, useWorkspaces,
}: RulesSectionProps): ReactNode {
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
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<'open' | 'create' | null>(null)

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

  const onOpen = async (entry: RulesEntry): Promise<void> => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      await openPath(entry.absolutePath)
    } catch {
      setActionError('open')
    } finally {
      setBusy(false)
    }
  }

  const onCreate = async (target: 'user-global' | 'project-root'): Promise<void> => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const snapshot = await create(target, root)
      setState({ status: 'ready', snapshot })
    } catch {
      setActionError('create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || busy}>
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

      {state.status === 'ready' && (
        <div className={css.actions}>
          {state.snapshot.canCreateUserGlobal && (
            <button type="button" className={css.open} disabled={busy} onClick={() => { void onCreate('user-global') }}>
              {t('createUser')}
            </button>
          )}
          {state.snapshot.canCreateProjectRoot && root !== undefined && (
            <button type="button" className={css.open} disabled={busy} onClick={() => { void onCreate('project-root') }}>
              {t('createProject')}
            </button>
          )}
        </div>
      )}

      {state.status === 'ready' && state.snapshot.entries.length === 0 && (
        <p className={css.status} role="status">{t('empty')}</p>
      )}

      {state.status === 'ready' && state.snapshot.entries.length > 0 && (
        <div className={css.catalog}>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span data-rules-count>{state.snapshot.entries.length}</span>
          </div>
          <ul className={css.list}>
            {state.snapshot.entries.map(entry => (
              <li key={entry.absolutePath} className={css.row}>
                <div className={css.meta}>
                  <div className={css.name}>{entry.displayPath}</div>
                  <div className={css.details}>
                    <span>{entry.scope === 'user-global' ? t('scopeUser') : t('scopeProject')}</span>
                    <span title={entry.absolutePath}>{entry.absolutePath}</span>
                  </div>
                </div>
                <div className={css.trailing}>
                  <button
                    type="button"
                    className={css.open}
                    aria-label={format(t('openNamed'), { name: entry.displayPath })}
                    disabled={busy}
                    onClick={() => { void onOpen(entry) }}
                  >
                    {t('open')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {actionError === 'open' && <p className={css.toggleError} role="alert">{t('openFailed')}</p>}
          {actionError === 'create' && <p className={css.toggleError} role="alert">{t('createFailed')}</p>}
        </div>
      )}

      {state.status === 'ready' && state.snapshot.entries.length === 0 && actionError === 'create' && (
        <p className={css.toggleError} role="alert">{t('createFailed')}</p>
      )}
    </div>
  )
}
