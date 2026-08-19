import { useEffect, useState, type ReactNode } from 'react'
import type { McpInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpSettingsLocaleKey } from './locales.ts'
import css from './McpSection.module.css'

/** Registration-side Remote face used by the section. */
export interface McpSectionInjected {
  /** Read the current MCP inventory. */
  list: () => Promise<McpInventorySnapshot>
  /** Persist enablement for one MCP Loader entry and return a fresh snapshot. */
  setEnabled: (entryId: string, enabled: boolean) => Promise<McpInventorySnapshot>
}

/** Full component props assembled by the Settings slot renderer. */
export type McpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.mcp'>
  & InjectFace<McpSectionInjected>

type McpEntry = McpInventorySnapshot['entries'][number]

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: McpInventorySnapshot }

const STATUS_KEYS = {
  disabled: 'statusDisabled',
  connected: 'statusConnected',
  connecting: 'statusConnecting',
  error: 'statusError',
  disconnected: 'statusDisconnected',
} satisfies Record<McpEntry['status'], McpSettingsLocaleKey>

/** Substitute `{name}` / `{count}` placeholders in a locale string. */
function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

/** Render the MCP Settings section. */
export function McpSection({ list, setEnabled, t }: McpSectionProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState(false)

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const retry = (): void => {
    setState({ status: 'loading' })
    setToggleError(false)
    setRequest(value => value + 1)
  }

  const onToggle = async (entry: McpEntry): Promise<void> => {
    if (pendingId !== null) return
    setPendingId(entry.entryId)
    setToggleError(false)
    try {
      const snapshot = await setEnabled(entry.entryId, !entry.enabled)
      setState({ status: 'ready', snapshot })
    } catch {
      setToggleError(true)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || pendingId !== null}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <p className={css.hint}>{t('effectHint')}</p>

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
            <span data-mcp-count>{state.snapshot.entries.length}</span>
          </div>
          <ul className={css.list}>
            {state.snapshot.entries.map((entry) => {
              const statusLabel = t(STATUS_KEYS[entry.status])
              const busy = pendingId === entry.entryId
              return (
                <li key={entry.entryId} className={css.row}>
                  <div className={css.meta}>
                    <div className={css.name}>{entry.serverName}</div>
                    <div className={css.details}>
                      <span
                        className={css.statusDot}
                        data-status={entry.status}
                        role="img"
                        aria-label={statusLabel}
                      />
                      <span>{statusLabel}</span>
                      <span>{format(t('tools'), { count: entry.toolCount })}</span>
                      <span>{t('transport')}: {entry.transport}</span>
                    </div>
                  </div>
                  <div className={css.trailing}>
                    <button
                      type="button"
                      className={css.switch}
                      role="switch"
                      aria-checked={entry.enabled}
                      aria-label={format(entry.enabled ? t('disable') : t('enable'), { name: entry.serverName })}
                      aria-busy={busy || undefined}
                      disabled={pendingId !== null}
                      onClick={() => { void onToggle(entry) }}
                    >
                      <span className={css.thumb} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {toggleError && <p className={css.toggleError} role="alert">{t('toggleFailed')}</p>}
        </div>
      )}
    </div>
  )
}
