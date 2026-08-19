/**
 * ui-explorer browser half on a real SlotRegistry: occupies the conversation
 * `conversation.details.explorer` seat (never `details`), the layout `preview`
 * column, and a header action that opens the details column; listing/openPath
 * close over the connection and workspaces fakes; teardown empties the seats.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { ExplorerInjected, FilesOpenActionInjected } from '../src/client/index.ts'
import type { FilePreviewInjected } from '../src/client/FilePreviewPanel.tsx'
import { apply as applyNode } from '../src/index.ts'
import * as ExplorerInvariant from '../src/invariant.ts'
import { ExplorerPanel } from '../src/client/ExplorerPanel.tsx'
import { FilePreviewPanel } from '../src/client/FilePreviewPanel.tsx'
import { FilesOpenAction } from '../src/client/FilesOpenAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

/** Boot the browser half over seats this plugin fills, never the details body. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.details.explorer': { kind: 'single', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'preview': { kind: 'single', scope: 'session' },
    },
  } as never, () => null)
  const listEntries = vi.fn(async (payload: { path: string }) => ({
    result: { ok: true as const, value: { path: payload.path, entries: [] as const } },
  }))
  const readText = vi.fn(async (payload: { path: string }) => ({
    result: { ok: true as const, value: { path: payload.path, content: `// ${payload.path}\n` } },
  }))
  const writeText = vi.fn(async (payload: { path: string }) => ({
    result: { ok: true as const, value: { path: payload.path } },
  }))
  const mkdir = vi.fn(async (payload: { path: string }) => ({
    result: { ok: true as const, value: { path: payload.path } },
  }))
  const rename = vi.fn(async (payload: { from: string; to: string }) => ({
    result: { ok: true as const, value: { path: payload.to } },
  }))
  const copy = vi.fn(async (payload: { from: string; to: string }) => ({
    result: { ok: true as const, value: { path: payload.to } },
  }))
  const deletePath = vi.fn(async () => ({
    result: { ok: true as const, value: { deleted: true as const } },
  }))
  const openPath = vi.fn(async () => {})
  const revealPath = vi.fn(async () => {})
  const openDetails = vi.fn()
  const closePreview = vi.fn()
  let canOpenPath = true
  const descriptionListeners = new Set<() => void>()
  ctx.provide('connection', {
    api: { host: { listEntries, readText, writeText, mkdir, rename, copy, delete: deletePath } },
    hostDescription: {
      getSnapshot: () => ({ canOpenPath }),
      subscribe: (listener: () => void) => {
        descriptionListeners.add(listener)
        return () => { descriptionListeners.delete(listener) }
      },
    },
  })
  ctx.provide('workspaces', { openPath, revealPath })
  ctx.provide('layout', { openDetails, closePreview, openPreview: vi.fn() })
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} },
    binding: () => undefined,
  } as never)
  ctx.provide('conversation', { input: { for: () => undefined } } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  ctx.provide('theme', {
    getTheme: () => ({
      preference: 'system',
      active: { id: 'light', colorScheme: 'light', tokens: {} },
      themes: [],
      revision: 0,
    }),
    overrideTokens: vi.fn(() => () => {}),
  })
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return {
    ctx, fiber, listEntries, readText, writeText, mkdir, rename, copy, deletePath, openPath, revealPath, openDetails, closePreview,
    setCanOpenPath: (next: boolean) => {
      canOpenPath = next
      for (const listener of descriptionListeners) listener()
    },
  }
}

describe('ui-explorer browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual([
      'slots', 'workspaces', 'locale', 'connection', 'layout', 'conversation',
      'sessions', 'settingsScope', 'theme',
    ])
  })

  it('occupies the explorer child seat and the preview column over one shared store', async () => {
    const b = await bench()
    const explorer = b.ctx.slots.entries('conversation.details.explorer')
    expect(explorer).toHaveLength(1)
    expect(explorer[0]!.component).toBe(ExplorerPanel)
    expect(explorer[0]!.locale).toBe(NS)
    const previewSeat = b.ctx.slots.entries('preview')
    expect(previewSeat).toHaveLength(1)
    expect(previewSeat[0]!.component).toBe(FilePreviewPanel)
    expect(previewSeat[0]!.locale).toBe(NS)
    // One handle for both seats: the tree writes what the preview column reads.
    expect((previewSeat[0] as { store?: unknown }).store).toBe((explorer[0] as { store?: unknown }).store)
    expect(b.ctx.slots.entries('details')).toHaveLength(0)
    const header = b.ctx.slots.entries('conversation.session.header.actions')
    expect(header.map(entry => entry.options.id)).toContain('files-open')
    expect(header.find(entry => entry.options.id === 'files-open')!.component).toBe(FilesOpenAction)
  })

  it('exposes list/read/preview faces for every workspace cwd, not one pinned root', async () => {
    const b = await bench()
    const injected = (b.ctx.slots.entries('conversation.details.explorer')[0]!.inject as () => ExplorerInjected)()
    await expect(injected.listEntries('/ws-a')).resolves.toEqual([])
    await expect(injected.listEntries('/ws-b')).resolves.toEqual([])
    await expect(injected.readText('/ws-a/a.ts')).resolves.toBe('// /ws-a/a.ts\n')
    await expect(injected.readText('/ws-b/b.ts')).resolves.toBe('// /ws-b/b.ts\n')
    expect(b.listEntries).toHaveBeenCalledWith({ path: '/ws-a' }, undefined)
    expect(b.listEntries).toHaveBeenCalledWith({ path: '/ws-b' }, undefined)
    expect(b.readText).toHaveBeenCalledWith({ path: '/ws-a/a.ts' })
    expect(b.readText).toHaveBeenCalledWith({ path: '/ws-b/b.ts' })
    expect(typeof injected.searchEntries).toBe('function')
    expect(typeof injected.openPreview).toBe('function')
    expect(b.ctx.slots.entries('preview')).toHaveLength(1)
    expect(b.ctx.slots.entries('preview')[0]!.component).toBe(FilePreviewPanel)
  })

  it('lists through host.listEntries and mutates through writeText/mkdir/rename/copy/delete', async () => {
    const b = await bench()
    const injected = (b.ctx.slots.entries('conversation.details.explorer')[0]!.inject as () => ExplorerInjected)()
    await expect(injected.listEntries('/ws')).resolves.toEqual([])
    expect(b.listEntries).toHaveBeenCalledWith({ path: '/ws' }, undefined)
    await injected.openPath('/ws/a.ts')
    expect(b.openPath).toHaveBeenCalledWith('/ws/a.ts')
    await injected.revealOsPath('/ws/a.ts')
    expect(b.revealPath).toHaveBeenCalledWith('/ws/a.ts')
    await expect(injected.readText('/ws/a.ts')).resolves.toBe('// /ws/a.ts\n')
    expect(b.readText).toHaveBeenCalledWith({ path: '/ws/a.ts' })
    await injected.writeText('/ws/a.ts')
    expect(b.writeText).toHaveBeenCalledWith({ path: '/ws/a.ts' })
    await injected.mkdir('/ws/lib')
    expect(b.mkdir).toHaveBeenCalledWith({ path: '/ws/lib' })
    await injected.rename('/ws/a.ts', '/ws/b.ts')
    expect(b.rename).toHaveBeenCalledWith({ from: '/ws/a.ts', to: '/ws/b.ts' })
    await injected.copy('/ws/b.ts', '/ws/c.ts')
    expect(b.copy).toHaveBeenCalledWith({ from: '/ws/b.ts', to: '/ws/c.ts' })
    await injected.delete('/ws/b.ts')
    expect(b.deletePath).toHaveBeenCalledWith({ path: '/ws/b.ts' })

    b.listEntries.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'denied', details: {} } },
    } as never)
    await expect(injected.listEntries('/missing')).rejects.toThrow('denied')
    b.readText.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'not-text', details: {} } },
    } as never)
    await expect(injected.readText('/ws/bin')).rejects.toThrow('not-text')
    b.writeText.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'fs-failed', details: {} } },
    } as never)
    await expect(injected.writeText('/ws/dup.ts')).rejects.toThrow('fs-failed')
    b.mkdir.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'FS_ALREADY_EXISTS', details: {} } },
    } as never)
    await expect(injected.mkdir('/ws/dup')).rejects.toThrow('FS_ALREADY_EXISTS')
    b.rename.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'fs-failed', details: {} } },
    } as never)
    await expect(injected.rename('/ws/a', '/ws/b')).rejects.toThrow('fs-failed')
    b.copy.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'fs-failed', details: {} } },
    } as never)
    await expect(injected.copy('/ws/a', '/ws/b')).rejects.toThrow('fs-failed')
    b.deletePath.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'FS_NOT_FOUND', details: {} } },
    } as never)
    await expect(injected.delete('/missing')).rejects.toThrow('FS_NOT_FOUND')
  })

  it('preview column saves through host.writeText with content and closes via layout', async () => {
    const b = await bench()
    const preview = (b.ctx.slots.entries('preview')[0]!.inject as () => FilePreviewInjected)()
    await preview.writeText('/ws/a.ts', 'export {}\n')
    expect(b.writeText).toHaveBeenCalledWith({ path: '/ws/a.ts', content: 'export {}\n' })
    preview.closePreview()
    expect(b.closePreview).toHaveBeenCalledTimes(1)
    b.writeText.mockResolvedValueOnce({
      result: { ok: false as const, error: { code: 'fs-failed', message: 'write-denied', details: {} } },
    } as never)
    await expect(preview.writeText('/ws/a.ts', 'x')).rejects.toThrow('write-denied')
  })

  it('insertWorkspaceReference suffixes line ranges and returns false without a session', async () => {
    const b = await bench()
    const explorer = (b.ctx.slots.entries('conversation.details.explorer')[0]!.inject as () => ExplorerInjected)()
    const preview = (b.ctx.slots.entries('preview')[0]!.inject as () => FilePreviewInjected)()
    expect(explorer.insertWorkspaceReference('missing' as never, '/ws/a.ts')).toBe(false)
    expect(preview.insertWorkspaceReference('missing' as never, '/ws/a.ts', {
      startLine: 1,
      endLine: 2,
    })).toBe(false)

    const insertReference = vi.fn(() => true)
    const state = {
      getSnapshot: () => ({ draft: '', draftRev: 1 }),
      subscribe: () => () => {},
    }
    ;(b.ctx.get('sessions') as {
      list: { getSnapshot: () => unknown }
      binding: (id: string) => unknown
    }).list.getSnapshot = () => ({
      byId: { s1: { cwd: '/ws' } },
    })
    ;(b.ctx.get('sessions') as { binding: (id: string) => unknown }).binding = () => ({
      ctx: {},
    })
    ;(b.ctx.get('conversation') as {
      input: { for: (actx: unknown) => unknown }
    }).input.for = () => ({ state, insertReference })

    expect(preview.insertWorkspaceReference('s1' as never, '/ws/Assets/Npc.cs', {
      startLine: 120,
      endLine: 146,
    })).toBe(true)
    expect(insertReference).toHaveBeenCalledWith({
      source: 'workspace-file',
      ref: '/ws/Assets/Npc.cs:120-146',
      label: 'Assets/Npc.cs:120-146',
      clipboardText: '/ws/Assets/Npc.cs:120-146',
    }, { start: 0, end: 0, draftRev: 1 })

    expect(explorer.insertWorkspaceReference('s1' as never, '/ws/Assets/Npc.cs')).toBe(true)
    expect(insertReference).toHaveBeenLastCalledWith({
      source: 'workspace-file',
      ref: '/ws/Assets/Npc.cs',
      label: 'Assets/Npc.cs',
      clipboardText: '/ws/Assets/Npc.cs',
    }, { start: 0, end: 0, draftRev: 1 })
  })

  it('falls back to host.listDirectory and throws when neither list RPC exists', async () => {
    const b = await bench()
    const injected = (b.ctx.slots.entries('conversation.details.explorer')[0]!.inject as () => ExplorerInjected)()
    const host = (b.ctx.get('connection') as { api: { host: Record<string, unknown> } }).api.host
    const listDirectory = vi.fn(async (payload: { path: string }) => ({
      result: { ok: true as const, value: { path: payload.path, entries: [] as const } },
    }))
    delete host.listEntries
    host.listDirectory = listDirectory
    await expect(injected.listEntries('/ws')).resolves.toEqual([])
    expect(listDirectory).toHaveBeenCalledWith({ path: '/ws' }, undefined)
    delete host.listDirectory
    await expect(injected.listEntries('/ws')).rejects.toThrow('当前运行时不支持目录列举')
    delete host.readText
    await expect(injected.readText('/ws/a.ts')).rejects.toThrow('当前运行时不支持读取文件')
  })

  it('header opener calls layout.openDetails; canOpenPath follows hostDescription', async () => {
    const b = await bench()
    const header = b.ctx.slots.entries('conversation.session.header.actions')
      .find(entry => entry.options.id === 'files-open')!
    const injected = (header.inject as () => FilesOpenActionInjected)()
    injected.openDetails()
    expect(b.openDetails).toHaveBeenCalledTimes(1)

    const explorer = (b.ctx.slots.entries('conversation.details.explorer')[0]!.inject as () => ExplorerInjected)()
    expect(explorer.hooks.canOpenPath.getSnapshot()).toBe(true)
    const seen: boolean[] = []
    const off = explorer.hooks.canOpenPath.subscribe(() => {
      seen.push(explorer.hooks.canOpenPath.getSnapshot())
    })
    b.setCanOpenPath(false)
    expect(seen).toEqual([false])
    off()
  })

  it('registers dictionaries and unregisters both seats on teardown', async () => {
    const b = await bench()
    const translate = b.ctx.locale.bind(NS)
    expect(translate('title')).toBe(zh.title)
    b.ctx.locale.setLocale('en')
    expect(translate('title')).toBe(en.title)
    await b.fiber.dispose()
    expect(b.ctx.slots.entries('conversation.details.explorer')).toHaveLength(0)
    expect(b.ctx.slots.entries('preview')).toHaveLength(0)
    expect(b.ctx.slots.entries('conversation.session.header.actions')).toHaveLength(0)
    expect(translate('title')).not.toBe(en.title)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-explorer node half', () => {
  it('tolerates a Host without settings', () => {
    expect(() => { applyNode(new Context()) }).not.toThrow()
  })
})

describe('ui-explorer invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(ExplorerInvariant)
    await fiber.await()
    expect(ExplorerInvariant.name).toBe('client-ui-explorer-invariant')
    expect(ExplorerInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
