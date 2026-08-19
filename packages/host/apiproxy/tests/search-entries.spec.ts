import { afterEach, describe, expect, it, vi } from 'vitest'
import { FsTargetKey, FsVersion, type FsDirEntry } from '@deepseek-ai/dsh-fs'
import {
  invalidateSearchIndexes,
  searchWorkspaceEntries,
} from '../src/search-entries.ts'
import { loadWorkspaceIgnore } from '../src/workspace-ignore.ts'

function row(path: string, type: 'file' | 'directory'): FsDirEntry {
  const name = path.split('/').pop() ?? path
  return {
    name,
    type,
    target: { targetKey: FsTargetKey(path), displayPath: path },
    version: FsVersion('v1'),
  }
}

async function missingIgnore(): Promise<string> {
  throw new Error('missing')
}

afterEach(() => {
  invalidateSearchIndexes()
})

describe('searchWorkspaceEntries', () => {
  it('indexes files and folders while pruning ignored trees and .meta files', async () => {
    const pages = new Map<string, FsDirEntry[]>([
      ['/ws', [
        row('/ws/Assets', 'directory'),
        row('/ws/Library', 'directory'),
        row('/ws/node_modules', 'directory'),
      ]],
      ['/ws/Assets', [
        row('/ws/Assets/FooBarService.cs', 'file'),
        row('/ws/Assets/FooBarService.cs.meta', 'file'),
        row('/ws/Assets/Buff', 'directory'),
      ]],
      ['/ws/Assets/Buff', []],
    ])
    const listDir = vi.fn(async (path: string) => pages.get(path) ?? [])

    const result = await searchWorkspaceEntries(
      listDir,
      async (path) => {
        if (path.endsWith('/.dshignore')) return 'Library/\nnode_modules/\n*.meta\n'
        throw new Error('missing')
      },
      '/ws',
      'fbs',
      200,
      new AbortController().signal,
    )

    expect(result.entries.map(entry => entry.name)).toEqual(['FooBarService.cs'])
    expect(listDir.mock.calls.map(call => call[0])).not.toContain('/ws/Library')
    expect(listDir.mock.calls.map(call => call[0])).not.toContain('/ws/node_modules')
    expect(result.entries).not.toContainEqual(expect.objectContaining({ name: 'FooBarService.cs.meta' }))
    const folders = await searchWorkspaceEntries(
      listDir,
      missingIgnore,
      '/ws',
      'buff',
      200,
      new AbortController().signal,
    )
    expect(folders.entries).toContainEqual(expect.objectContaining({ name: 'Buff', type: 'directory' }))
  })

  it('reuses the lazy per-root index and invalidates it after a mutation', async () => {
    const listDir = vi.fn(async () => [row('/ws/Buff.cs', 'file')])
    const signal = new AbortController().signal

    await searchWorkspaceEntries(listDir, missingIgnore, '/ws', 'buff', 200, signal)
    await searchWorkspaceEntries(listDir, missingIgnore, '/ws', 'cs', 200, signal)
    expect(listDir).toHaveBeenCalledTimes(1)

    invalidateSearchIndexes()
    await searchWorkspaceEntries(listDir, missingIgnore, '/ws', 'buff', 200, signal)
    expect(listDir).toHaveBeenCalledTimes(2)
  })

  it('weights basename matches, reports truncation, and cancels callers', async () => {
    const listDir = vi.fn(async (path: string) => path === '/ws'
      ? [
        row('/ws/deep/path/b_u_f_f_notes.txt', 'file'),
        row('/ws/Buff.cs', 'file'),
      ]
      : [])
    const limited = await searchWorkspaceEntries(
      listDir,
      missingIgnore,
      '/ws',
      'buff',
      1,
      new AbortController().signal,
    )
    expect(limited.entries[0]?.name).toBe('Buff.cs')
    expect(limited.truncated).toBe(true)

    const aborted = new AbortController()
    aborted.abort()
    await expect(searchWorkspaceEntries(listDir, missingIgnore, '/other', 'x', 10, aborted.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stacks gitignore with cursor fallback and gives dshignore priority', async () => {
    const fallbackFiles = new Map([
      ['/ws/.gitignore', 'node_modules/\n'],
      ['/ws/.cursorignore', 'Library/\n*.sln\n!keep.sln\n'],
    ])
    const fallback = await loadWorkspaceIgnore('/ws', async (path) => {
      const text = fallbackFiles.get(path)
      if (text === undefined) throw new Error('missing')
      return text
    })
    expect(fallback.ignores('node_modules', true)).toBe(true)
    expect(fallback.ignores('Library', true)).toBe(true)
    expect(fallback.ignores('Game.sln', false)).toBe(true)
    expect(fallback.ignores('keep.sln', false)).toBe(false)

    const preferredFiles = new Map([
      ['/ws/.dshignore', '.idea/\n'],
      ['/ws/.cursorignore', 'Library/\n'],
    ])
    const preferred = await loadWorkspaceIgnore('/ws', async (path) => {
      const text = preferredFiles.get(path)
      if (text === undefined) throw new Error('missing')
      return text
    })
    expect(preferred.ignores('.idea', true)).toBe(true)
    expect(preferred.ignores('Library', true)).toBe(false)
  })
})
