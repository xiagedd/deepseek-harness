/**
 * ui-workspace-file browser half: '@' workspace-file source registration
 * (duplicate-name proof + fiber teardown) against the real InputTriggerService,
 * then the source behavior contract driven on the captured source — session
 * cwd as listEntries path, searchEntries for fuzzy queries, files and
 * directories, one-level cache, slash descent via host-returned directory
 * paths, ReferenceInsert pick, and the path codec.
 */
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { InputTriggerService } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { ClientSessionContext, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as WorkspaceFileInvariant from '../src/invariant.ts'

type FsType = 'file' | 'directory' | 'other'
type FsRow = { name: string; path: string; type: FsType; hidden: boolean }
type ListResult =
  | { ok: true; value: { path: string; entries: readonly FsRow[] } }
  | { ok: false; error: { code: string; message: string; details: object } }
type SearchResult =
  | { ok: true; value: { path: string; entries: readonly FsRow[]; truncated: boolean } }
  | { ok: false; error: { code: string; message: string; details: object } }
type ListFn = (payload: { path: string; root?: string }, signal?: AbortSignal) => Promise<{ result: ListResult }>
type SearchFn = (
  payload: { root: string; query: string; limit?: number },
  signal?: AbortSignal,
) => Promise<{ result: SearchResult }>

const sid = (id: string) => id as SessionId
const proj = (id: string): ClientSessionContext => ({ sessionId: sid(id) })
const req = (query: string, signal?: AbortSignal) =>
  ({ query, position: 'inline' as const, signal: signal ?? new AbortController().signal })

function file(name: string, path: string, hidden = false): FsRow {
  return { name, path, type: 'file', hidden }
}
function dir(name: string, path: string, hidden = false): FsRow {
  return { name, path, type: 'directory', hidden }
}

const ROOT = '/ws'
const ROOT_ROWS: FsRow[] = [
  file('README.md', '/ws/README.md'),
  file('note.txt', '/ws/note.txt'),
  file('.env', '/ws/.env', true),
  dir('src', '/ws/src'),
  dir('.git', '/ws/.git', true),
  { name: 'socket', path: '/ws/socket', type: 'other', hidden: false },
]
const ROOT_VISIBLE = [
  { name: 'README.md' },
  { name: 'note.txt' },
  { name: 'src' },
] as const
const SRC_ROWS: FsRow[] = [
  file('index.ts', '/ws/src/index.ts'),
  file('util.ts', '/ws/src/util.ts'),
  dir('nested', '/ws/src/nested'),
]

function treeList(): { list: ListFn; payloads: { path: string }[]; listDirectory: ReturnType<typeof vi.fn> } {
  const payloads: { path: string }[] = []
  const listDirectory = vi.fn()
  const list: ListFn = (payload) => {
    payloads.push({ path: payload.path })
    const entries = payload.path === ROOT ? ROOT_ROWS : payload.path === '/ws/src' ? SRC_ROWS : []
    return Promise.resolve({ result: { ok: true as const, value: { path: payload.path, entries } } })
  }
  return { list, payloads, listDirectory }
}

function sessionsWith(cwdById: Record<string, string | undefined>) {
  const byId: Record<string, { cwd?: string }> = {}
  for (const [id, cwd] of Object.entries(cwdById)) byId[id] = cwd === undefined ? {} : { cwd }
  return { list: { getSnapshot: () => ({ byId }) } }
}

async function bench(
  list: ListFn,
  cwdById: Record<string, string | undefined> = { s1: ROOT },
  listDirectory: ReturnType<typeof vi.fn> = vi.fn(),
  search: SearchFn = () => Promise.resolve({
    result: { ok: true as const, value: { path: ROOT, entries: [], truncated: false } },
  }),
) {
  const ctx = new Context()
  let captured: InputTriggerSource | undefined
  ctx.provide('inputTriggers', { registerSource: (src: InputTriggerSource) => { captured = src; return () => {} } })
  ctx.provide('connection', { api: { host: { listEntries: list, listDirectory, searchEntries: search } } })
  ctx.provide('sessions', sessionsWith(cwdById))
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, source: captured!, listDirectory }
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['inputTriggers', 'connection', 'sessions'])
  })

  it('registers the "@" workspace-file source; disposal frees the name (HMR safety)', async () => {
    const ctx = new Context()
    ctx.provide('sessions', sessionsWith({ s1: ROOT }))
    await ctx.plugin(InputTriggerService).await()
    const { list } = treeList()
    ctx.provide('connection', {
      api: { host: { listEntries: list, listDirectory: vi.fn(), searchEntries: vi.fn() } },
    })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const inputTriggers = ctx.get('inputTriggers') as InputTriggerService
    const rival = {
      trigger: '@' as const,
      name: 'workspace-file',
      candidates: () => Promise.resolve([]),
      onPick: () => undefined,
    }
    expect(() => inputTriggers.registerSource(rival)).toThrow(/already registered/)
    const subagent = {
      trigger: '@' as const,
      name: 'subagent',
      candidates: () => Promise.resolve([{ name: 'child' }]),
      onPick: () => undefined,
    }
    expect(() => inputTriggers.registerSource(subagent)).not.toThrow()
    await fiber.dispose()
    expect(() => inputTriggers.registerSource(rival)).not.toThrow()
  })
})

describe('candidates: workspace listEntries', () => {
  it('lists files and directories at the session cwd and never calls listDirectory', async () => {
    const { list, payloads, listDirectory } = treeList()
    const { source } = await bench(list, { s1: ROOT }, listDirectory)
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([...ROOT_VISIBLE])
    expect(payloads).toEqual([{ path: ROOT }])
    expect(listDirectory).not.toHaveBeenCalled()
  })

  it('uses the session cwd as listEntries path without guessing a drive', async () => {
    const payloads: { path: string; root?: string }[] = []
    const cwd = String.raw`D:\proj`
    const { source } = await bench((payload) => {
      payloads.push(payload)
      return Promise.resolve({ result: { ok: true as const, value: { path: payload.path, entries: [] } } })
    }, { s1: cwd })
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([])
    expect(payloads).toEqual([{ path: cwd, root: cwd }])
  })

  it('returns empty without RPC when the session has no workspace cwd', async () => {
    const { list, payloads } = treeList()
    const search = vi.fn()
    const { source } = await bench(list, { s1: undefined, s2: '' }, vi.fn(), search)
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([])
    await expect(source.candidates(proj('s2'), req(''))).resolves.toEqual([])
    await expect(source.candidates(proj('s1'), req('note'))).resolves.toEqual([])
    expect(payloads).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('descends one named directory using the host path, not a client join', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    await expect(source.candidates(proj('s1'), req('src/'))).resolves.toEqual([
      { name: 'index.ts', description: 'src/index.ts' },
      { name: 'util.ts', description: 'src/util.ts' },
      { name: 'nested', description: 'src/nested' },
    ])
    expect(payloads).toEqual([{ path: ROOT }, { path: '/ws/src' }])
    await expect(source.candidates(proj('s1'), req('src/in'))).resolves.toEqual([
      { name: 'index.ts', description: 'src/index.ts' },
    ])
    await expect(source.candidates(proj('s1'), req(String.raw`src\u`))).resolves.toEqual([
      { name: 'util.ts', description: 'src/util.ts' },
    ])
    expect(payloads).toEqual([{ path: ROOT }, { path: '/ws/src' }])
  })

  it('returns empty for a missing directory, parent segments, or an over-long walk', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    await expect(source.candidates(proj('s1'), req('missing/a'))).resolves.toEqual([])
    await expect(source.candidates(proj('s1'), req('../a'))).resolves.toEqual([])
    const deep = `${'a/'.repeat(17)}b`
    await expect(source.candidates(proj('s1'), req(deep))).resolves.toEqual([])
    expect(payloads).toEqual([{ path: ROOT }])
  })

  it('skips empty and "." query segments', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    await expect(source.candidates(proj('s1'), req('src/./util'))).resolves.toEqual([
      { name: 'util.ts', description: 'src/util.ts' },
    ])
    expect(payloads).toEqual([{ path: ROOT }, { path: '/ws/src' }])
  })

  it('rejects on a failed result (the slash shell owns the menu-side fold)', async () => {
    const { source } = await bench(() => Promise.resolve({
      result: { ok: false, error: { code: 'fs-failed', message: 'denied', details: {} } },
    }))
    await expect(source.candidates(proj('s1'), req('')))
      .rejects.toThrow('host.listEntries failed: fs-failed: denied')
  })

  it('caps one level at 100 files and directories', async () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, index) => file(`f${index}.ts`, `/ws/f${index}.ts`)),
      ...Array.from({ length: 60 }, (_, index) => dir(`d${index}`, `/ws/d${index}`)),
    ]
    const { source } = await bench(() => Promise.resolve({
      result: { ok: true as const, value: { path: ROOT, entries: rows } },
    }))
    const items = await source.candidates(proj('s1'), req(''))
    expect(items).toHaveLength(100)
    expect(items[0]).toEqual({ name: 'f0.ts' })
    expect(items[59]).toEqual({ name: 'f59.ts' })
    expect(items[60]).toEqual({ name: 'd0' })
    expect(items[99]).toEqual({ name: 'd39' })
  })
})

describe('candidates: host.searchEntries fuzzy', () => {
  it('routes a non-empty query without separators to searchEntries with limit 100', async () => {
    const { list, payloads } = treeList()
    const searchPayloads: object[] = []
    const search: SearchFn = (payload) => {
      searchPayloads.push(payload)
      return Promise.resolve({
        result: {
          ok: true as const,
          value: {
            path: ROOT,
            truncated: false,
            entries: [
              file('note.txt', '/ws/note.txt'),
              file('util.ts', '/ws/src/util.ts'),
              dir('nested', '/ws/src/nested'),
            ],
          },
        },
      })
    }
    const { source } = await bench(list, { s1: ROOT }, vi.fn(), search)
    await expect(source.candidates(proj('s1'), req('ut'))).resolves.toEqual([
      { name: 'note.txt' },
      { name: 'util.ts', description: 'src/util.ts' },
      { name: 'nested', description: 'src/nested' },
    ])
    expect(searchPayloads).toEqual([{ root: ROOT, query: 'ut', limit: 100 }])
    expect(payloads).toEqual([])
  })

  it('maps cross-directory hits to basename + relative description and absolute pick', async () => {
    const { list } = treeList()
    const search: SearchFn = () => Promise.resolve({
      result: {
        ok: true as const,
        value: {
          path: ROOT,
          truncated: true,
          entries: [
            file('index.ts', '/ws/src/index.ts'),
            file('index.ts', '/ws/pkg/index.ts'),
          ],
        },
      },
    })
    const { source } = await bench(list, { s1: ROOT }, vi.fn(), search)
    const items = await source.candidates(proj('s1'), req('index'))
    expect(items).toEqual([
      { name: 'src/index.ts', description: 'src/index.ts' },
      { name: 'pkg/index.ts', description: 'pkg/index.ts' },
    ])
    expect(source.onPick({
      candidate: items[0]!,
      session: proj('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toEqual({
      insert: {
        source: 'workspace-file',
        ref: '/ws/src/index.ts',
        label: 'src/index.ts',
        clipboardText: '/ws/src/index.ts',
      },
    })
  })

  it('an aborted search signal yields empty without poisoning later calls', async () => {
    const { list } = treeList()
    let calls = 0
    const search: SearchFn = (_payload, signal) => {
      calls += 1
      if (signal?.aborted) {
        return Promise.resolve({
          result: { ok: true as const, value: { path: ROOT, entries: [file('stale.ts', '/ws/stale.ts')], truncated: false } },
        })
      }
      return Promise.resolve({
        result: {
          ok: true as const,
          value: { path: ROOT, entries: [file('note.txt', '/ws/note.txt')], truncated: false },
        },
      })
    }
    const { source } = await bench(list, { s1: ROOT }, vi.fn(), search)
    const aborted = new AbortController()
    aborted.abort()
    await expect(source.candidates(proj('s1'), req('note', aborted.signal))).resolves.toEqual([])
    await expect(source.candidates(proj('s1'), req('note'))).resolves.toEqual([{ name: 'note.txt' }])
    expect(calls).toBe(2)
  })

  it('rejects on a failed searchEntries result', async () => {
    const { list } = treeList()
    const { source } = await bench(list, { s1: ROOT }, vi.fn(), () => Promise.resolve({
      result: { ok: false, error: { code: 'fs-failed', message: 'walk-denied', details: {} } },
    }))
    await expect(source.candidates(proj('s1'), req('note')))
      .rejects.toThrow('host.searchEntries failed: fs-failed: walk-denied')
  })

  it('keeps slash descent on listEntries and does not call searchEntries', async () => {
    const { list, payloads } = treeList()
    const search = vi.fn()
    const { source } = await bench(list, { s1: ROOT }, vi.fn(), search)
    await source.candidates(proj('s1'), req('src/'))
    expect(search).not.toHaveBeenCalled()
    expect(payloads).toEqual([{ path: ROOT }, { path: '/ws/src' }])
  })
})

describe('listing cache', () => {
  it('re-polls on the same session path locally: one RPC across empty-query keystrokes', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    await source.candidates(proj('s1'), req(''))
    await source.candidates(proj('s1'), req(''))
    expect(payloads).toEqual([{ path: ROOT }])
  })

  it('single-flight: concurrent empty candidates on one cold key share one RPC', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    const [a, b] = await Promise.all([
      source.candidates(proj('s1'), req('')),
      source.candidates(proj('s1'), req('')),
    ])
    expect(payloads).toHaveLength(1)
    expect(a).toEqual([...ROOT_VISIBLE])
    expect(b).toEqual([...ROOT_VISIBLE])
  })

  it('an aborted caller yields empty but leaves the shared fetch warm', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    const aborted = new AbortController()
    aborted.abort()
    await expect(source.candidates(proj('s1'), req('', aborted.signal))).resolves.toEqual([])
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([...ROOT_VISIBLE])
    expect(payloads).toHaveLength(1)
  })

  it('aborts a directory walk after a cached parent listing', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    await source.candidates(proj('s1'), req(''))
    const aborted = new AbortController()
    aborted.abort()
    await expect(source.candidates(proj('s1'), req('src/', aborted.signal))).resolves.toEqual([])
  })

  it('a failed fetch does not poison the key: the next caller retries', async () => {
    let fail = true
    const payloads: object[] = []
    const { source } = await bench((payload) => {
      payloads.push(payload)
      return fail
        ? Promise.resolve({ result: { ok: false as const, error: { code: 'fs-failed', message: 'boom', details: {} } } })
        : treeList().list(payload)
    })
    await expect(source.candidates(proj('s1'), req(''))).rejects.toThrow('boom')
    fail = false
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([...ROOT_VISIBLE])
    expect(payloads).toHaveLength(2)
  })

  it('a superseded in-flight failure does not delete the replacement listing', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    const { ctx, source } = await bench(async (payload) => {
      calls += 1
      if (calls === 1) {
        await gate
        return { result: { ok: false as const, error: { code: 'fs-failed', message: 'stale', details: {} } } }
      }
      return treeList().list(payload)
    })
    const stale = source.candidates(proj('s1'), req(''))
    ctx.emit('connection/reset')
    release()
    await expect(stale).rejects.toThrow('stale')
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([...ROOT_VISIBLE])
    expect(calls).toBe(2)
  })

  it('the scope-birth warm prewarms the session cwd fire-and-forget', async () => {
    const { list, payloads } = treeList()
    const { source } = await bench(list)
    source.warm!(proj('s1'))
    await vi.waitFor(() => { expect(payloads).toHaveLength(1) })
    expect(payloads[0]).toEqual({ path: ROOT })
    await expect(source.candidates(proj('s1'), req(''))).resolves.toEqual([...ROOT_VISIBLE])
    expect(payloads).toHaveLength(1)
    source.warm!(proj('missing'))
    expect(payloads).toHaveLength(1)
  })

  it('warm swallows a failed prewarm so scope birth stays fire-and-forget', async () => {
    const { source } = await bench(() => Promise.resolve({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'denied', details: {} } },
    }))
    source.warm!(proj('s1'))
    await vi.waitFor(async () => {
      await expect(source.candidates(proj('s1'), req(''))).rejects.toThrow('denied')
    })
  })

  it('connection/reset clears every cached listing', async () => {
    const { list, payloads } = treeList()
    const { ctx, source } = await bench(list)
    await source.candidates(proj('s1'), req(''))
    expect(payloads).toHaveLength(1)
    ctx.emit('connection/reset')
    await source.candidates(proj('s1'), req(''))
    expect(payloads).toHaveLength(2)
  })
})

describe('pick and codec', () => {
  it('onPick inserts a path chip with the host absolute path, not file bytes', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    await source.candidates(proj('s1'), req(''))
    expect(source.onPick({
      candidate: { name: 'README.md' },
      session: proj('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toEqual({
      insert: {
        source: 'workspace-file',
        ref: '/ws/README.md',
        label: 'README.md',
        clipboardText: '/ws/README.md',
      },
    })
  })

  it('onPick inserts a folder path chip with the host absolute path, not directory contents', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    await source.candidates(proj('s1'), req(''))
    expect(source.onPick({
      candidate: { name: 'src' },
      session: proj('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toEqual({
      insert: {
        source: 'workspace-file',
        ref: '/ws/src',
        label: 'src',
        clipboardText: '/ws/src',
      },
    })
    await source.candidates(proj('s1'), req('src/'))
    expect(source.onPick({
      candidate: { name: 'nested', description: 'src/nested' },
      session: proj('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toEqual({
      insert: {
        source: 'workspace-file',
        ref: '/ws/src/nested',
        label: 'src/nested',
        clipboardText: '/ws/src/nested',
      },
    })
  })

  it('falls back to the candidate name when the listing lookup is cold', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    expect(source.onPick({
      candidate: { name: 'orphan.ts' },
      session: proj('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toEqual({
      insert: {
        source: 'workspace-file',
        ref: 'orphan.ts',
        label: 'orphan.ts',
        clipboardText: 'orphan.ts',
      },
    })
  })

  it('codec projects the path literal for clipboard and the model', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    expect(source.codec!.clipboardText('/ws/README.md')).toBe('/ws/README.md')
    await expect(source.codec!.serialize('/ws/README.md', new AbortController().signal))
      .resolves.toBe('/ws/README.md')
    expect(source.codec!.clipboardText('/ws/src')).toBe('/ws/src')
    await expect(source.codec!.serialize('/ws/src', new AbortController().signal))
      .resolves.toBe('/ws/src')
  })

  it('never participates in slash adjudication or the word lexicon', async () => {
    const { list } = treeList()
    const { source } = await bench(list)
    expect(typeof source.lexicon).toBe('undefined')
    expect(typeof source.subscribeLexicon).toBe('undefined')
    expect(typeof source.matchSpace).toBe('undefined')
    expect(typeof source.matchEnter).toBe('undefined')
  })
})

describe('node half and invariant companion', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })

  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(WorkspaceFileInvariant)
    await fiber.await()
    expect(WorkspaceFileInvariant.name).toBe('client-ui-workspace-file-invariant')
    expect(WorkspaceFileInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
