/**
 * Which launcher the Windows reveal reaches for when no test injects one.
 * `explorer.exe /select,<path>` is one argv token, so the default launcher must
 * be the verbatim one: Node's ordinary quoting wraps a token containing a space
 * and Explorer then raises no window, with nothing for the Host to observe.
 */
const { launchVerbatim, launchQuoted, run } = vi.hoisted(() => ({
  launchVerbatim: vi.fn(async () => ({ stdout: '', stderr: '' })),
  launchQuoted: vi.fn(async () => ({ stdout: '', stderr: '' })),
  run: vi.fn(async () => ({ stdout: '', stderr: '' })),
}))

vi.mock('@deepseek-ai/dsh-native-command', () => ({
  launchNativeCommandVerbatim: launchVerbatim,
  launchNativeCommand: launchQuoted,
  runNativeCommand: run,
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revealNativePath } from '../src/native-path-opener.ts'

describe('windows reveal launcher', () => {
  beforeEach(() => {
    launchVerbatim.mockClear()
    launchQuoted.mockClear()
    run.mockClear()
  })

  it('reveals a spaced, non-ASCII path through the verbatim launcher', async () => {
    await revealNativePath('H:/工作 空间/目标 文件.txt', new AbortController().signal, { platform: 'win32' })
    expect(launchVerbatim).toHaveBeenCalledWith(
      'explorer.exe',
      ['/select,H:\\工作 空间\\目标 文件.txt'],
      expect.any(AbortSignal),
    )
    expect(launchQuoted).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('reveals a translated WSL path through the same launcher', async () => {
    run.mockImplementationOnce(async () => ({ stdout: '\\\\wsl.localhost\\Ubuntu\\home\\a b\\c.txt\r\n', stderr: '' }))
    await revealNativePath('/home/a b/c.txt', new AbortController().signal, {
      platform: 'linux', osRelease: '5.15.0-microsoft-standard-WSL2', env: { WSL_DISTRO_NAME: 'Ubuntu' },
    })
    expect(launchVerbatim).toHaveBeenCalledWith(
      'explorer.exe',
      ['/select,\\\\wsl.localhost\\Ubuntu\\home\\a b\\c.txt'],
      expect.any(AbortSignal),
    )
  })
})
