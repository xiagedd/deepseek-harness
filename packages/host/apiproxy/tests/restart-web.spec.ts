import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  resolveRestartListenPort, resolveRestartWebScript, restartWebScriptArgs, restartWebSpawnEnv,
  scheduleRestartWeb, spawnRestartWeb, RESTART_WEB_FLUSH_MS,
} from '../src/restart-web.ts'

describe('restart-web helpers', () => {
  it('accepts only a port in argv and defaults listen port to 3080', () => {
    expect(restartWebScriptArgs(4090)).toEqual(['--port', '4090'])
    expect(resolveRestartListenPort(undefined, {})).toBe(3080)
    expect(resolveRestartListenPort(4100, { configured: 3080, hosted: 3090 })).toBe(4100)
    expect(resolveRestartListenPort(undefined, { configured: 3080 })).toBe(3080)
    expect(resolveRestartListenPort(undefined, { hosted: 3090 })).toBe(3090)
  })

  it('resolves the script only when it exists under cwd', () => {
    const missing = mkdtempSync(join(tmpdir(), 'dsh-restart-missing-'))
    expect(resolveRestartWebScript(missing)).toBeUndefined()
    const root = mkdtempSync(join(tmpdir(), 'dsh-restart-present-'))
    mkdirSync(join(root, 'scripts'))
    const script = join(root, 'scripts', 'restart-dsh-web.mjs')
    writeFileSync(script, 'export {}\n')
    expect(resolveRestartWebScript(root)).toBe(script)
  })

  it('spawns node with the script path and --port only, then unrefs', () => {
    const unref = vi.fn()
    const spawnImpl = vi.fn(() => ({ unref }))
    spawnRestartWeb({ scriptPath: '/repo/scripts/restart-dsh-web.mjs', port: 3080, cwd: '/repo' }, spawnImpl)
    expect(spawnImpl).toHaveBeenCalledOnce()
    const [command, args, options] = spawnImpl.mock.calls[0]!
    expect(command).toBe(process.execPath)
    expect(args).toEqual(['/repo/scripts/restart-dsh-web.mjs', '--port', '3080'])
    expect(options).toMatchObject({ cwd: '/repo', detached: true, stdio: 'ignore', windowsHide: true })
    expect(unref).toHaveBeenCalledOnce()
  })

  it('appends the Windows Node directory only on win32', () => {
    expect(restartWebSpawnEnv('linux', { PATH: '/usr/bin' }).PATH).toBe('/usr/bin')
    expect(restartWebSpawnEnv('win32', { PATH: 'C:\\Windows' }).PATH)
      .toBe('C:\\Windows;C:\\Program Files\\nodejs')
    expect(restartWebSpawnEnv('win32', {}).PATH).toBe(';C:\\Program Files\\nodejs')
  })

  it('schedules work after the flush delay', () => {
    vi.useFakeTimers()
    try {
      const work = vi.fn()
      scheduleRestartWeb(work)
      expect(work).not.toHaveBeenCalled()
      vi.advanceTimersByTime(RESTART_WEB_FLUSH_MS)
      expect(work).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
