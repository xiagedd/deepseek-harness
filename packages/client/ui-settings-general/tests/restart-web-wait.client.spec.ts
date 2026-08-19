import { describe, expect, it, vi } from 'vitest'
import { waitUntilOriginHealthy } from '../src/client/restart-web-wait.ts'

describe('waitUntilOriginHealthy', () => {
  it('returns true on the first 2xx', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response)
    expect(await waitUntilOriginHealthy({
      fetch: fetchImpl, now: () => 0, sleep: async () => {}, timeoutMs: 1000, intervalMs: 10,
    })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('/', { method: 'GET', cache: 'no-store' })
  })

  it('retries after a down origin then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    let t = 0
    expect(await waitUntilOriginHealthy({
      fetch: fetchImpl,
      now: () => t,
      sleep: async (ms) => { t += ms },
      timeoutMs: 1000,
      intervalMs: 10,
    })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('uses global fetch when the caller omits it', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchImpl)
    try {
      expect(await waitUntilOriginHealthy({
        now: () => 0, sleep: async () => {},
      })).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns false immediately when the timeout is already elapsed', async () => {
    expect(await waitUntilOriginHealthy({
      fetch: vi.fn(), now: () => 10, timeoutMs: 0, intervalMs: 10,
    })).toBe(false)
  })

  it('returns false when the budget elapses', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down') })
    let t = 0
    expect(await waitUntilOriginHealthy({
      fetch: fetchImpl,
      now: () => t,
      sleep: async (ms) => { t += ms },
      timeoutMs: 25,
      intervalMs: 10,
    })).toBe(false)
  })

  it('sleeps with the default timer between failed polls', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({ ok: true })
      const pending = waitUntilOriginHealthy({
        fetch: fetchImpl, timeoutMs: 1000, intervalMs: 20,
      })
      await vi.advanceTimersByTimeAsync(20)
      expect(await pending).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
