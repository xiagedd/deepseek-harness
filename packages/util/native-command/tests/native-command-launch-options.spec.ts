/**
 * The spawn options each desktop launcher asks for. `windowsVerbatimArguments`
 * is the whole difference between the two, and the reason `explorer.exe
 * /select,<path with spaces>` reaches Explorer at all, so it is pinned here
 * rather than left to a platform-specific manual check.
 */
type SpawnMock = (
  command: string,
  args: readonly string[],
  options: { detached: boolean; stdio: string; windowsVerbatimArguments: boolean },
) => { once: (event: string, listener: () => void) => void; unref: () => void }

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn<SpawnMock>() }))

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: spawnMock }))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchNativeCommand, launchNativeCommandVerbatim } from '../src/index.ts'

/** A child that reports a successful spawn on the next tick. */
function spawnedChild() {
  return {
    once: (event: string, listener: () => void) => {
      if (event === 'spawn') setTimeout(listener, 0)
    },
    unref: () => {},
  }
}

describe('desktop launch options', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    spawnMock.mockImplementation(() => spawnedChild())
  })

  it('detaches and drops stdio for both launchers', async () => {
    await launchNativeCommand('node', ['-e', ''], new AbortController().signal)
    await launchNativeCommandVerbatim('node', ['-e', ''], new AbortController().signal)
    for (const call of spawnMock.mock.calls) {
      expect(call[2]).toMatchObject({ detached: true, stdio: 'ignore' })
    }
  })

  it('passes the Windows command line verbatim only for the verbatim launcher', async () => {
    const selectToken = '/select,C:\\work\\有 空格\\目标 文件.txt'
    await launchNativeCommandVerbatim('explorer.exe', [selectToken], new AbortController().signal)
    expect(spawnMock).toHaveBeenLastCalledWith(
      'explorer.exe', [selectToken], expect.objectContaining({ windowsVerbatimArguments: true }),
    )

    // Node's default quoting wraps that same token in double quotes, which
    // Explorer does not recognise as a switch — the silent-failure form.
    await launchNativeCommand('explorer.exe', [selectToken], new AbortController().signal)
    expect(spawnMock).toHaveBeenLastCalledWith(
      'explorer.exe', [selectToken], expect.objectContaining({ windowsVerbatimArguments: false }),
    )
  })

  it('spawns nothing when the signal is already aborted', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(launchNativeCommandVerbatim('explorer.exe', [], abort.signal)).rejects.toBeInstanceOf(Error)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('rejects a spawn failure', async () => {
    spawnMock.mockImplementationOnce(() => ({
      once: (event: string, listener: (error?: unknown) => void) => {
        if (event !== 'error') return
        setTimeout(() => {
          listener(Object.assign(new Error('spawn explorer.exe ENOENT'), { code: 'ENOENT' }))
        }, 0)
      },
      unref: () => {},
    }))
    await expect(launchNativeCommandVerbatim('explorer.exe', [], new AbortController().signal))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })
})
