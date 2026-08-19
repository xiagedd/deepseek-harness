/**
 * General-section row that restarts this loopback `dsh web` Host through
 * `host.restartWeb`. The browser never supplies argv; Host spawns the repo
 * restart script with only `--port`.
 */
import { useState } from 'react'
import { Button, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { RESTART_HEALTH_TIMEOUT_MS } from './restart-web-wait.ts'
import css from './RestartWebRow.module.css'

/** Result of one `host.restartWeb` attempt after the Host accepted or refused. */
export type RestartWebCallResult =
  | { ok: true; port: number }
  | { ok: false; message: string }

/** Registrant-owned dependencies of {@link RestartWebRow}. */
export interface RestartWebRowInjected {
  /** Loopback `host.restartWeb`; never passes command/argv. */
  restartWeb: (payload: { port?: number }) => Promise<RestartWebCallResult>
  /** Poll the origin until the new process answers, or time out. */
  waitUntilHealthy: (timeoutMs: number) => Promise<boolean>
  /** Reload after the new origin is healthy. */
  reload: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type RestartWebRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & RestartWebRowInjected

type Phase = 'idle' | 'confirming' | 'waiting' | 'reloading'

/**
 * Render the Restart Web row with a risk confirmation and wait/failure copy.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function RestartWebRow({
  t, restartWeb, waitUntilHealthy, reload,
}: RestartWebRowProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = phase === 'waiting' || phase === 'reloading'

  const runRestart = (): void => {
    setAcknowledged(false)
    setPhase('waiting')
    setError(null)
    void (async () => {
      const accepted = await restartWeb({})
      if (!accepted.ok) {
        setError(accepted.message)
        setPhase('idle')
        return
      }
      const healthy = await waitUntilHealthy(RESTART_HEALTH_TIMEOUT_MS)
      if (!healthy) {
        setError(t('restartWeb.error.timeout'))
        setPhase('idle')
        return
      }
      setPhase('reloading')
      reload()
    })()
  }

  const description = error === null
    ? (phase === 'waiting' || phase === 'reloading' ? t('restartWeb.waiting') : t('restartWeb.description'))
    : error

  return (
    <>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{t('restartWeb.title')}</div>
          <div className={css.desc} role={error === null ? undefined : 'alert'}>{description}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setAcknowledged(false)
            setPhase('confirming')
          }}
        >
          {t('restartWeb.button')}
        </Button>
      </div>
      <RiskConfirmation
        open={phase === 'confirming'}
        title={t('restartWeb.confirmTitle')}
        description={t('restartWeb.confirmDescription')}
        acknowledgeLabel={t('restartWeb.acknowledge')}
        cancelLabel={t('restartWeb.cancel')}
        confirmLabel={t('restartWeb.confirm')}
        acknowledged={acknowledged}
        disabled={busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={() => {
          setAcknowledged(false)
          setPhase('idle')
        }}
        onConfirm={runRestart}
      />
    </>
  )
}
