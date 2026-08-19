import { describe, expect, it, vi } from 'vitest'
import {
  joinUnderRoot,
  loadIgnoreFileState,
  resolveWorkspaceRoot,
} from '../src/client/ignore-io.ts'

describe('ignore-io', () => {
  it('joins under POSIX and Windows roots', () => {
    expect(joinUnderRoot('/ws', '.dshignore')).toBe('/ws/.dshignore')
    expect(joinUnderRoot('/ws/', '.dshignore')).toBe('/ws/.dshignore')
    expect(joinUnderRoot('C:\\ws', '.dshignore')).toBe('C:\\ws\\.dshignore')
  })

  it('resolves the current session cwd before the recent workspace', () => {
    expect(resolveWorkspaceRoot({
      currentSessionId: 's1',
      sessionsById: { s1: { cwd: '/from-session' } },
      recentWorkspaceId: 'w1',
      workspaces: [{ workspaceId: 'w1', path: '/from-workspace' }],
    })).toBe('/from-session')

    expect(resolveWorkspaceRoot({
      currentSessionId: undefined,
      sessionsById: {},
      recentWorkspaceId: 'w1',
      workspaces: [{ workspaceId: 'w1', path: '/from-workspace' }],
    })).toBe('/from-workspace')

    expect(resolveWorkspaceRoot({
      currentSessionId: undefined,
      sessionsById: {},
      recentWorkspaceId: undefined,
      workspaces: [],
    })).toBeUndefined()
  })

  it('reads an existing .dshignore body', async () => {
    const readText = vi.fn(async (path: string) => {
      if (path === '/ws/.dshignore') return 'Library/\n'
      throw new Error('missing')
    })
    await expect(loadIgnoreFileState('/ws', readText)).resolves.toEqual({
      path: '/ws/.dshignore',
      content: 'Library/\n',
      exists: true,
      cursorFallback: false,
    })
  })

  it('returns empty content when neither product ignore file exists', async () => {
    const readText = vi.fn(async () => { throw new Error('missing') })
    await expect(loadIgnoreFileState('/ws', readText)).resolves.toEqual({
      path: '/ws/.dshignore',
      content: '',
      exists: false,
      cursorFallback: false,
    })
  })

  it('flags cursor fallback when only .cursorignore exists', async () => {
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.cursorignore')) return 'Temp/\n'
      throw new Error('missing')
    })
    await expect(loadIgnoreFileState('/ws', readText)).resolves.toEqual({
      path: '/ws/.dshignore',
      content: '',
      exists: false,
      cursorFallback: true,
    })
  })
})
