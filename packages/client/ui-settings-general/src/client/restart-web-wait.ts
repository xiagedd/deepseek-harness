/** Wait until the current origin answers HTTP 2xx after a host restart. */

/** Default wait budget covering kill + listen + health in the restart script. */
export const RESTART_HEALTH_TIMEOUT_MS = 45_000

/** Poll interval while the origin is down. */
export const RESTART_HEALTH_INTERVAL_MS = 500

/** Injectable clock and fetch used by {@link waitUntilOriginHealthy}. */
export interface RestartHealthWaitOptions {
  timeoutMs?: number
  intervalMs?: number
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Poll `GET /` until it returns 2xx or the timeout elapses.
 * @param options - timeout, interval, and injectable fetch/clock.
 * @returns true when the origin recovered.
 */
export async function waitUntilOriginHealthy(options: RestartHealthWaitOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? RESTART_HEALTH_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? RESTART_HEALTH_INTERVAL_MS
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  }))
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    try {
      const response = await fetchImpl('/', { method: 'GET', cache: 'no-store' })
      if (response.ok) return true
    } catch {
      // Origin is down while the host process is restarting.
    }
    const remaining = deadline - now()
    if (remaining <= intervalMs) return false
    await sleep(intervalMs)
  }
  return false
}
