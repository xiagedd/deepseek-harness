import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'
import { FileSystem, FsError, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsWriteIntent, FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import type { HostFrame, WorkspaceId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`workspace-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

async function nextHostFrame(
  stream: AsyncIterator<RpcRequest<HostFrame>>,
): Promise<RpcRequest<HostFrame>> {
  const next = await stream.next()
  if (next.done === true) throw new Error('Host stream ended before the expected increment')
  return next.value
}

function stubAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Compose the API over real Session, Agent, Storage, Domain, and Workspace services. */
async function harness(
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-apiproxy-workspace-'))),
  picker: DirectoryPickerCapability = { kind: 'native', pick: async () => null },
  extras: {
    openPath?: (path: string, signal: AbortSignal) => Promise<void>
    revealPath?: (path: string, signal: AbortSignal) => Promise<void>
    canOpenPath?: () => boolean
    resolveRestartWebScript?: (cwd: string) => string | undefined
    spawnRestartWeb?: (request: { scriptPath: string; port: number; cwd: string }) => void
    scheduleRestartWeb?: (work: () => void) => void
    restartListenPort?: number
  } = {},
) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)

  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = stubAgent(session)
      const unregister = ctx.agents.register(agent)
      return {
        agent,
        dispose: () => {
          unregister()
          return Promise.resolve()
        },
      }
    },
    async resume() {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)
  // Structural picker fake: the gateway only reads capability(); a stable
  // object per harness mirrors the seam's stability contract.
  ctx.provide('directoryPicker', { capability: () => picker } as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
    ...extras.openPath === undefined ? {} : { openPath: extras.openPath },
    ...extras.revealPath === undefined ? {} : { revealPath: extras.revealPath },
    ...extras.canOpenPath === undefined ? {} : { canOpenPath: extras.canOpenPath },
    ...extras.resolveRestartWebScript === undefined ? {} : { resolveRestartWebScript: extras.resolveRestartWebScript },
    ...extras.spawnRestartWeb === undefined ? {} : { spawnRestartWeb: extras.spawnRestartWeb },
    ...extras.scheduleRestartWeb === undefined ? {} : { scheduleRestartWeb: extras.scheduleRestartWeb },
    ...extras.restartListenPort === undefined ? {} : { restartListenPort: extras.restartListenPort },
  })
  return { api, ctx, storageDomain, root }
}

/** Stage one directory under the harness root for path adoption. */
function stageDir(root: string, name: string): string {
  const path = join(root, name)
  mkdirSync(path)
  return path
}

describe('host.pickDirectory', () => {
  it('returns a selected path or explicit cancellation from the native capability', async () => {
    const selected = await harness(undefined, { kind: 'native', pick: async () => '/tmp/project' })
    expect((await selected.api.host.pickDirectory(request({}), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { path: '/tmp/project' } })

    const cancelled = await harness(undefined, { kind: 'native', pick: async () => null })
    expect((await cancelled.api.host.pickDirectory(request({}), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { path: null } })
  })

  it('propagates abort into the native capability as a cancelled RPC error', async () => {
    const { api } = await harness(undefined, {
      kind: 'native',
      pick: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const abort = new AbortController()
    const pending = api.host.pickDirectory(request({}), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })

  it('folds a non-abort native-chooser failure into an internal error', async () => {
    const { api } = await harness(undefined, { kind: 'native', pick: async () => { throw new Error('no chooser installed') } })
    const response = await api.host.pickDirectory(request({}), new AbortController().signal)
    expect(response.result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('refuses the native RPC under a browse composition', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    const response = await api.host.pickDirectory(request({}), new AbortController().signal)
    expect(response.result).toMatchObject({
      ok: false,
      error: { code: 'directory-picker-unavailable', details: { capability: 'browse' } },
    })
  })
})

/** Canned browse capability: one listing, one created path, typed failures on demand. */
const BROWSE_STUB: DirectoryPickerCapability = {
  kind: 'browse',
  list: async (path) => {
    if (path === '/denied') throw new DirectoryPickerError('directory-unreadable', '/denied', 'cannot list /denied')
    const target = path ?? '/home/user'
    return {
      path: target,
      home: '/home/user',
      crumbs: [{ name: '/', path: '/', hidden: false }],
      entries: [{ name: 'projects', path: `${target}/projects`, hidden: false }],
      truncated: false,
    }
  },
  createDirectory: async (path, name) => {
    if (name === 'taken') throw new DirectoryPickerError('directory-exists', `${path}/${name}`, 'already exists')
    if (name === 'unwritable') throw new Error('disk detached')
    return `${path}/${name}`
  },
}

describe('host.listDirectory / host.createDirectory', () => {
  it('serves listings and creation through the browse capability, defaulting to home', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    const home = await api.host.listDirectory(request({}), new AbortController().signal)
    expect(home.result).toMatchObject({ ok: true, value: { path: '/home/user', home: '/home/user' } })
    const listed = await api.host.listDirectory(request({ path: '/home/user/projects' }), new AbortController().signal)
    expect(listed.result).toMatchObject({ ok: true, value: { path: '/home/user/projects' } })
    const created = await api.host.createDirectory(request({ path: '/home/user', name: 'fresh' }))
    expect(created.result).toEqual({ ok: true, value: { path: '/home/user/fresh' } })
  })

  it('maps typed picker failures onto the wire error codes and folds unknown throws to internal', async () => {
    const { api } = await harness(undefined, BROWSE_STUB)
    expect((await api.host.listDirectory(request({ path: '/denied' }), new AbortController().signal)).result).toMatchObject({
      ok: false, error: { code: 'directory-unreadable', details: { path: '/denied' } },
    })
    expect((await api.host.createDirectory(request({ path: '/home/user', name: 'taken' }))).result).toMatchObject({
      ok: false, error: { code: 'directory-exists' },
    })
    expect((await api.host.createDirectory(request({ path: '/home/user', name: 'unwritable' }))).result).toMatchObject({
      ok: false, error: { code: 'internal' },
    })
  })

  it('reports an aborted listing as cancelled, like the other signal-following RPCs', async () => {
    const { api } = await harness(undefined, {
      kind: 'browse',
      list: (_path, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(new Error('scan aborted')) }, { once: true })
      }),
      createDirectory: async () => '/never',
    })
    const abort = new AbortController()
    const pending = api.host.listDirectory(request({}), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })

  it('refuses the browse RPCs under a native composition', async () => {
    const { api } = await harness()
    expect((await api.host.listDirectory(request({}), new AbortController().signal)).result).toMatchObject({
      ok: false, error: { code: 'directory-picker-unavailable', details: { capability: 'native' } },
    })
    expect((await api.host.createDirectory(request({ path: '/x', name: 'y' }))).result).toMatchObject({
      ok: false, error: { code: 'directory-picker-unavailable', details: { capability: 'native' } },
    })
  })
})

/** In-memory `ctx.fs` for the workspace file-tree RPCs (not the folder-only picker). */
class WorkspaceFsFake extends FileSystem {
  listed: FsDirEntry[] = [
    {
      name: '.hidden.txt',
      type: 'file',
      target: { targetKey: FsTargetKey('/ws/.hidden.txt'), displayPath: '/ws/.hidden.txt' },
      size: 3,
      version: FsVersion('v1'),
    },
    {
      name: 'notes.md',
      type: 'file',
      target: { targetKey: FsTargetKey('/ws/notes.md'), displayPath: '/ws/notes.md' },
      size: 4,
      version: FsVersion('v1'),
    },
    {
      name: 'src',
      type: 'directory',
      target: { targetKey: FsTargetKey('/ws/src'), displayPath: '/ws/src' },
      version: FsVersion('v1'),
    },
  ]
  failWith: InstanceType<typeof FsError> | undefined
  lastWrite: { path: string; content: string } | undefined
  lastRead: string | undefined
  fileText = new Map<string, string>([['/ws/notes.md', 'note']])

  override async resolve(path: string, opts?: { signal?: AbortSignal }): Promise<FsTarget> {
    if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED')
    if (this.failWith) throw this.failWith
    return { targetKey: FsTargetKey(path), displayPath: path }
  }
  override processPath(target: FsTarget): string { return target.displayPath }
  override fileUrl(target: FsTarget): string { return `file://${target.displayPath}` }
  override contains(): boolean { return false }
  override async stat(): Promise<FsInfo | undefined> { return undefined }
  override async lstat(): Promise<FsPathInfo | undefined> { return undefined }
  override async readText(target: FsTarget): Promise<string> {
    if (this.failWith) throw this.failWith
    this.lastRead = target.displayPath
    const stored = this.fileText.get(target.displayPath)
    if (stored === undefined) throw new FsError('not text', 'FS_NOT_FOUND')
    return stored
  }
  override async streamText(): Promise<AsyncIterable<string>> {
    return (async function* () { yield '' })()
  }
  override async readBytes(): Promise<Uint8Array> { return new Uint8Array() }
  override async listDir(_target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    if (signal?.aborted) throw new FsError('listing aborted', 'FS_ABORTED')
    if (this.failWith) throw this.failWith
    return this.listed
  }
  override async writeText(target: FsTarget, content: string, _expected?: FsWriteIntent): Promise<FsWriteOutcome> {
    if (this.failWith) throw this.failWith
    this.lastWrite = { path: target.displayPath, content }
    this.fileText.set(target.displayPath, content)
    return { operation: 'create', version: FsVersion('v1'), before: null, after: content }
  }
  override async editText(_target: FsTarget, _edit: FsEditRequest): Promise<FsEditOutcome> {
    return { version: FsVersion('v1'), before: '', after: '' }
  }
  override async mkdir(target: FsTarget): Promise<void> {
    if (this.failWith) throw this.failWith
    this.listed.push({
      name: target.displayPath.slice(target.displayPath.lastIndexOf('/') + 1),
      type: 'directory',
      target,
      version: FsVersion('v1'),
    })
  }
  override async rename(_source: FsTarget, destination: FsTarget): Promise<void> {
    if (this.failWith) throw this.failWith
    this.listed.push({
      name: destination.displayPath.slice(destination.displayPath.lastIndexOf('/') + 1),
      type: 'file',
      target: destination,
      version: FsVersion('v1'),
    })
  }
  override async delete(_target: FsTarget): Promise<void> {
    if (this.failWith) throw this.failWith
  }
  override async copy(_source: FsTarget, destination: FsTarget): Promise<void> {
    if (this.failWith) throw this.failWith
    this.listed.push({
      name: destination.displayPath.slice(destination.displayPath.lastIndexOf('/') + 1),
      type: 'file',
      target: destination,
      size: 1,
      version: FsVersion('v1'),
    })
  }
}

describe('host.listEntries / host.mkdir / host.rename / host.delete / host.copy / host.writeText / host.readText', () => {
  it('lists files and folders through ctx.fs without changing the folder-only picker', async () => {
    const { api, ctx } = await harness(undefined, BROWSE_STUB)
    await ctx.plugin(WorkspaceFsFake)
    const picker = await api.host.listDirectory(request({ path: '/home/user' }), new AbortController().signal)
    expect(picker.result).toMatchObject({
      ok: true,
      value: { entries: [{ name: 'projects', path: '/home/user/projects', hidden: false }] },
    })
    const listed = await api.host.listEntries(request({ path: '/ws' }), new AbortController().signal)
    expect(listed.result).toEqual({
      ok: true,
      value: {
        path: '/ws',
        entries: [
          { name: '.hidden.txt', path: '/ws/.hidden.txt', type: 'file', hidden: true, size: 3 },
          { name: 'notes.md', path: '/ws/notes.md', type: 'file', hidden: false, size: 4 },
          { name: 'src', path: '/ws/src', type: 'directory', hidden: false },
        ],
      },
    })
  })

  it('filters listEntries from live workspace ignore files on every request', async () => {
    const { api, ctx } = await harness()
    await ctx.plugin(WorkspaceFsFake)
    const fs = ctx.fs as WorkspaceFsFake
    fs.listed.push(
      {
        name: 'Library',
        type: 'directory',
        target: { targetKey: FsTargetKey('/ws/Library'), displayPath: '/ws/Library' },
        version: FsVersion('v1'),
      },
      {
        name: '.idea',
        type: 'directory',
        target: { targetKey: FsTargetKey('/ws/.idea'), displayPath: '/ws/.idea' },
        version: FsVersion('v1'),
      },
      {
        name: 'Game.cs.meta',
        type: 'file',
        target: { targetKey: FsTargetKey('/ws/Game.cs.meta'), displayPath: '/ws/Game.cs.meta' },
        version: FsVersion('v1'),
      },
    )
    fs.fileText.set('/ws/.dshignore', 'Library/\n.idea/\n*.meta\n')

    const first = expectOk(await api.host.listEntries(
      request({ path: '/ws', root: '/ws' }),
      new AbortController().signal,
    ))
    expect(first.entries.map(entry => entry.name)).not.toEqual(
      expect.arrayContaining(['Library', '.idea', 'Game.cs.meta']),
    )

    fs.fileText.set('/ws/.dshignore', '.idea/\n')
    const refreshed = expectOk(await api.host.listEntries(
      request({ path: '/ws', root: '/ws' }),
      new AbortController().signal,
    ))
    expect(refreshed.entries.map(entry => entry.name)).toContain('Library')
    expect(refreshed.entries.map(entry => entry.name)).not.toContain('.idea')
  })

  it('creates, renames, copies, deletes, and writes through ctx.fs', async () => {
    const { api, ctx } = await harness()
    await ctx.plugin(WorkspaceFsFake)
    expect((await api.host.mkdir(request({ path: '/ws/fresh' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/fresh' } })
    expect((await api.host.rename(request({ from: '/ws/notes.md', to: '/ws/renamed.md' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/renamed.md' } })
    expect((await api.host.copy(request({ from: '/ws/notes.md', to: '/ws/copy.md' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/copy.md' } })
    expect((await api.host.delete(request({ path: '/ws/copy.md' }))).result)
      .toEqual({ ok: true, value: { deleted: true } })
    expect((await api.host.writeText(request({ path: '/ws/empty.txt' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/empty.txt' } })
    expect((ctx.fs as WorkspaceFsFake).lastWrite).toEqual({ path: '/ws/empty.txt', content: '' })
    expect((await api.host.writeText(request({ path: '/ws/notes.md', content: 'hi' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/notes.md' } })
    expect((ctx.fs as WorkspaceFsFake).lastWrite).toEqual({ path: '/ws/notes.md', content: 'hi' })
    expect((await api.host.readText(request({ path: '/ws/notes.md' }))).result)
      .toEqual({ ok: true, value: { path: '/ws/notes.md', content: 'hi' } })
    expect((ctx.fs as WorkspaceFsFake).lastRead).toBe('/ws/notes.md')
  })

  it('reports missing ctx.fs as internal rather than falling back to node:fs', async () => {
    const { api } = await harness()
    expect((await api.host.listEntries(request({ path: '/ws' }), new AbortController().signal)).result)
      .toMatchObject({ ok: false, error: { code: 'internal', message: 'host.listEntries needs ctx.fs' } })
    expect((await api.host.mkdir(request({ path: '/ws/fresh' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal', message: 'host.mkdir needs ctx.fs' } })
    expect((await api.host.rename(request({ from: '/a', to: '/b' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal' } })
    expect((await api.host.delete(request({ path: '/a' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal' } })
    expect((await api.host.copy(request({ from: '/a', to: '/b' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal' } })
    expect((await api.host.writeText(request({ path: '/ws/a.txt' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal', message: 'host.writeText needs ctx.fs' } })
    expect((await api.host.readText(request({ path: '/ws/a.txt' }))).result)
      .toMatchObject({ ok: false, error: { code: 'internal', message: 'host.readText needs ctx.fs' } })
  })

  it('maps provider FsError onto fs-failed without swallowing the reason', async () => {
    const { api, ctx } = await harness()
    await ctx.plugin(WorkspaceFsFake)
    const fs = ctx.fs as WorkspaceFsFake
    fs.failWith = new FsError('already there', 'FS_ALREADY_EXISTS')
    expect((await api.host.mkdir(request({ path: '/ws/taken' }))).result).toMatchObject({
      ok: false,
      error: { code: 'fs-failed', details: { path: '/ws/taken', reason: 'FS_ALREADY_EXISTS' } },
    })
    expect((await api.host.writeText(request({ path: '/ws/taken.txt', content: 'x' }))).result).toMatchObject({
      ok: false,
      error: { code: 'fs-failed', details: { path: '/ws/taken.txt', reason: 'FS_ALREADY_EXISTS' } },
    })
    expect((await api.host.readText(request({ path: '/ws/taken.txt' }))).result).toMatchObject({
      ok: false,
      error: { code: 'fs-failed', details: { path: '/ws/taken.txt', reason: 'FS_ALREADY_EXISTS' } },
    })
  })

  it('reports an aborted listing as cancelled', async () => {
    const { api, ctx } = await harness()
    await ctx.plugin(WorkspaceFsFake)
    const abort = new AbortController()
    abort.abort()
    expect((await api.host.listEntries(request({ path: '/ws' }), abort.signal)).result)
      .toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })
})

describe('host.openPath', () => {
  it('describes whether this deployment can reach a user-visible native desktop', async () => {
    const visible = await harness(undefined, undefined, { canOpenPath: () => true })
    const headless = await harness(undefined, undefined, { canOpenPath: () => false })
    expect(expectOk(await visible.api.host.describe(request({}))).canOpenPath).toBe(true)
    expect(expectOk(await headless.api.host.describe(request({}))).canOpenPath).toBe(false)
  })

  it('opens through the injected native boundary', async () => {
    const opened: string[] = []
    const { api } = await harness(undefined, undefined, {
      openPath: async (path) => { opened.push(path) },
    })
    expect((await api.host.openPath(request({ path: '/tmp/a.txt' }), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { opened: true } })
    expect(opened).toEqual(['/tmp/a.txt'])
  })

  it('propagates abort into the native boundary as a cancelled RPC error', async () => {
    const { api } = await harness(undefined, undefined, {
      openPath: (_path, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const abort = new AbortController()
    const pending = api.host.openPath(request({ path: '/tmp/a.txt' }), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })
})

describe('host.revealPath', () => {
  it('reveals through the injected native boundary', async () => {
    const revealed: string[] = []
    const { api } = await harness(undefined, undefined, {
      revealPath: async (path) => { revealed.push(path) },
    })
    expect((await api.host.revealPath(request({ path: '/tmp/a.txt' }), new AbortController().signal)).result)
      .toEqual({ ok: true, value: { revealed: true } })
    expect(revealed).toEqual(['/tmp/a.txt'])
  })

  it('propagates abort into the native reveal boundary as a cancelled RPC error', async () => {
    const { api } = await harness(undefined, undefined, {
      revealPath: (_path, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const abort = new AbortController()
    const pending = api.host.revealPath(request({ path: '/tmp/a.txt' }), abort.signal)
    abort.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })
})

describe('host.restartWeb', () => {
  it('accepts a port-only payload, returns before spawn, and never forwards extra argv', async () => {
    const spawned: Array<{ scriptPath: string; port: number; cwd: string }> = []
    let scheduled: (() => void) | undefined
    const { api, root } = await harness(undefined, undefined, {
      resolveRestartWebScript: cwd => join(cwd, 'scripts', 'restart-dsh-web.mjs'),
      spawnRestartWeb: (request) => { spawned.push(request) },
      scheduleRestartWeb: (work) => { scheduled = work },
      restartListenPort: 3080,
    })
    expect((await api.host.restartWeb(request({}))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 3080 } })
    expect(spawned).toEqual([])
    scheduled?.()
    expect(spawned).toEqual([{
      scriptPath: join(root, 'scripts', 'restart-dsh-web.mjs'),
      port: 3080,
      cwd: root,
    }])
  })

  it('uses the payload port and hosted listen port fallbacks', async () => {
    const spawned: number[] = []
    const { api } = await harness(undefined, undefined, {
      resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
      spawnRestartWeb: (request) => { spawned.push(request.port) },
      scheduleRestartWeb: (work) => { work() },
      restartListenPort: 3090,
    })
    expect((await api.host.restartWeb(request({ port: 4100 }))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 4100 } })
    expect(spawned).toEqual([4100])
  })

  it('refuses when the restart script is missing and does not spawn', async () => {
    const spawnRestartWeb = vi.fn()
    const { api, root } = await harness(undefined, undefined, {
      spawnRestartWeb,
      scheduleRestartWeb: (work) => { work() },
    })
    expect((await api.host.restartWeb(request({}))).result).toMatchObject({
      ok: false,
      error: {
        code: 'internal',
        message: `host.restartWeb cannot find scripts/restart-dsh-web.mjs under ${root}`,
      },
    })
    expect(spawnRestartWeb).not.toHaveBeenCalled()
  })

  it('logs a spawn failure after accept without rolling back the response', async () => {
    const { api } = await harness(undefined, undefined, {
      resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
      spawnRestartWeb: () => { throw new Error('spawn blocked') },
      scheduleRestartWeb: (work) => { work() },
    })
    expect((await api.host.restartWeb(request({}))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 3080 } })
  })

  it('stringifies a non-Error spawn throw after accept', async () => {
    const { api } = await harness(undefined, undefined, {
      resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
      spawnRestartWeb: () => { throw 'spawn blocked' },
      scheduleRestartWeb: (work) => { work() },
    })
    expect((await api.host.restartWeb(request({}))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 3080 } })
  })

  it('reads the live webServer port when payload and config omit it', async () => {
    const spawned: number[] = []
    const { api, ctx } = await harness(undefined, undefined, {
      resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
      spawnRestartWeb: (request) => { spawned.push(request.port) },
      scheduleRestartWeb: (work) => { work() },
    })
    ctx.provide('webServer', { port: 4090 } as never)
    expect((await api.host.restartWeb(request({}))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 4090 } })
    expect(spawned).toEqual([4090])
  })

  it('schedules spawn after accept when no scheduler is injected', async () => {
    vi.useFakeTimers()
    try {
      const spawnRestartWeb = vi.fn()
      const { api } = await harness(undefined, undefined, {
        resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
        spawnRestartWeb,
      })
      expect((await api.host.restartWeb(request({}))).result)
        .toEqual({ ok: true, value: { accepted: true, port: 3080 } })
      expect(spawnRestartWeb).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(spawnRestartWeb).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('binds the production spawner after accept without invoking it in tests', async () => {
    let scheduled: (() => void) | undefined
    const { api } = await harness(undefined, undefined, {
      resolveRestartWebScript: () => '/repo/scripts/restart-dsh-web.mjs',
      scheduleRestartWeb: (work) => { scheduled = work },
    })
    expect((await api.host.restartWeb(request({}))).result)
      .toEqual({ ok: true, value: { accepted: true, port: 3080 } })
    expect(scheduled).toEqual(expect.any(Function))
  })
})

describe('workspace.create', () => {
  it('serializes concurrent creates of one path into a single registration', async () => {
    const { api, root } = await harness()
    const target = stageDir(root, 'alpha')
    const responses = await Promise.all([
      api.workspace.create(request({ path: target })),
      api.workspace.create(request({ path: target })),
    ])
    const values = responses.map(response => expectOk(response))
    const created = values.find(value => value.created)
    const resolved = values.find(value => !value.created)

    expect(created).toMatchObject({ workspace: { path: target, title: 'alpha' } })
    expect(resolved?.workspace.workspaceId).toBe(created?.workspace.workspaceId)
    expect(expectOk(await api.workspace.list(request({}))).items).toHaveLength(1)
  })

  it('adopts only existing directories', async () => {
    const { api, root } = await harness()
    const existing = stageDir(root, 'existing')
    const first = expectOk(await api.workspace.create(request({ path: existing })))
    const repeated = expectOk(await api.workspace.create(request({ path: existing })))
    expect(first).toMatchObject({ created: true, workspace: { path: existing, title: 'existing' } })
    expect(repeated).toMatchObject({ created: false, workspace: { workspaceId: first.workspace.workspaceId } })

    expectOk(await api.workspace.rename(request({
      workspaceId: first.workspace.workspaceId,
      title: 'renamed-existing',
    })))
    const reopened = expectOk(await api.workspace.create(request({ path: existing })))
    expect(reopened.workspace.title).toBe('renamed-existing')

    const missing = join(root, 'missing')
    const missingResult = await api.workspace.create(request({ path: missing }))
    expect(missingResult.result).toMatchObject({ ok: false, error: { code: 'workspace-invalid-path' } })
    expect(existsSync(missing)).toBe(false)
  })

  it('adopts different paths that derive the same Workspace title', async () => {
    const { api, root } = await harness()
    const first = join(root, 'one', 'project')
    const second = join(root, 'two', 'project')
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })
    const firstResult = expectOk(await api.workspace.create(request({ path: first })))
    const secondResult = expectOk(await api.workspace.create(request({ path: second })))
    expect(firstResult).toMatchObject({
      created: true,
      workspace: { path: first, title: 'project' },
    })
    expect(secondResult).toMatchObject({
      created: true,
      workspace: { path: second, title: 'project' },
    })
    expect(secondResult.workspace.workspaceId).not.toBe(firstResult.workspace.workspaceId)
    expect(expectOk(await api.workspace.list(request({}))).items.map(workspace => workspace.path))
      .toEqual([second, first])
  })
})

describe('workspace.insertBefore', () => {
  it('commits the complete order, streams one order frame, and maps unknown ids', async () => {
    const { api, ctx, root } = await harness()
    const first = expectOk(await api.workspace.create(request({ path: stageDir(root, 'first') }))).workspace
    const second = expectOk(await api.workspace.create(request({ path: stageDir(root, 'second') }))).workspace
    const third = expectOk(await api.workspace.create(request({ path: stageDir(root, 'third') }))).workspace

    const abort = new AbortController()
    const listWorkspaces = vi.spyOn(ctx.workspaceRegistry, 'list')
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
    const changed = nextHostFrame(stream)
    const reordered = expectOk(await api.workspace.insertBefore(request({
      workspaceId: first.workspaceId,
      beforeWorkspaceId: second.workspaceId,
    })))
    expect(reordered.workspaceIds).toEqual([third.workspaceId, first.workspaceId, second.workspaceId])
    expect(await changed).toMatchObject({
      payload: {
        type: 'host/workspace-order-changed',
        workspaceIds: [third.workspaceId, first.workspaceId, second.workspaceId],
      },
    })
    expect(expectOk(await api.workspace.list(request({}))).items.map(item => item.workspaceId))
      .toEqual(reordered.workspaceIds)

    const missingSource = await api.workspace.insertBefore(request({
      workspaceId: 'missing' as WorkspaceId,
    }))
    expect(missingSource.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing' } },
    })
    const missingAnchor = await api.workspace.insertBefore(request({
      workspaceId: first.workspaceId,
      beforeWorkspaceId: 'missing-anchor' as WorkspaceId,
    }))
    expect(missingAnchor.result).toMatchObject({
      ok: false, error: { code: 'workspace-not-found', details: { workspaceId: 'missing-anchor' } },
    })
    abort.abort()
  })
})

describe('session creation and Workspace membership', () => {
  it('attaches a preallocated idempotent session while cwd-only sessions stay ungrouped', async () => {
    const { api, ctx, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    const sessionId = SessionId('session-workspace-preallocated')

    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
    expect(ctx.agents.list().filter(agent => agent.id === sessionId)).toHaveLength(1)

    const ungrouped = SessionId('session-cwd-only')
    expectOk(await api.sessions.create(request({ cwd: workspace.path, sessionId: ungrouped })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(ungrouped)

    const conflict = await api.sessions.create(request({ cwd: join(workspace.path, 'other'), sessionId }))
    expect(conflict.result).toMatchObject({
      ok: false,
      error: { code: 'session-conflict', details: { sessionId, existingCwd: workspace.path } },
    })
    const missing = await api.sessions.create(request({
      workspaceId: 'missing-workspace' as WorkspaceId,
      sessionId: SessionId('session-missing-workspace'),
    }))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'workspace-not-found' } })
  })

  it('retains a published session when attachment fails and repairs it on retry', async () => {
    const { api, ctx, root } = await harness()
    const created = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    const workspace = ctx.workspaceRegistry.list()[0]
    if (workspace === undefined) throw new Error('workspace missing from registry')
    vi.spyOn(workspace, 'attachSession').mockRejectedValueOnce(new Error('simulated write failure'))
    const sessionId = SessionId('session-attach-retry')

    const failed = await api.sessions.create(request({ workspaceId: created.workspaceId, sessionId }))
    expect(failed.result).toMatchObject({
      ok: false,
      error: { code: 'workspace-attach-failed', details: { sessionId, workspaceId: created.workspaceId } },
    })
    expect(ctx.agents.get(sessionId)).toBeDefined()

    expectOk(await api.sessions.create(request({ workspaceId: created.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).items[0]?.sessionIds).toEqual([sessionId])
  })
})

describe('Host Workspace increments', () => {
  it('projects subagent origin in attached summaries and creation increments', async () => {
    const { api, ctx } = await harness()
    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const pending = nextHostFrame(stream)
    const childId = SessionId('session-subagent-child')

    ctx.sessions.create(childId, {
      meta: {
        cwd: '/tmp',
        parentSession: SessionId('session-parent'),
        origin: 'subagent',
      },
    })

    expect(await pending).toMatchObject({
      payload: {
        type: 'host/session-added',
        sessionId: childId,
        parentSessionId: 'session-parent',
        origin: 'subagent',
      },
    })
    expect(expectOk(await api.sessions.list(request({}))).items).toContainEqual(
      expect.objectContaining({ sessionId: childId, origin: 'subagent' }),
    )
    abort.abort()
  })

  it('streams committed Workspace and Session increments after empty baselines', async () => {
    const { api, root } = await harness()
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items).toEqual([])

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const workspaceIncrement = nextHostFrame(stream)
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'project') }))).workspace
    expect(await workspaceIncrement).toMatchObject({
      payload: { type: 'host/workspace-changed', workspace: { workspaceId: workspace.workspaceId } },
    })

    const sessionId = SessionId('session-streamed-workspace')
    const pending = nextHostFrame(stream)
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    const increments: HostFrame[] = []
    increments.push((await pending).payload)
    while (increments.length < 2) {
      const next = await stream.next()
      if (next.done === true) throw new Error('Host stream ended before both increments')
      increments.push(next.value.payload)
    }
    expect(increments.find(increment => increment.type === 'host/session-added')).toMatchObject({
      // A just-created session has no events: the frame constantly carries blank:true.
      type: 'host/session-added', sessionId, blank: true, cwd: workspace.path,
    })
    const workspaceChanged = increments.find(
      (increment): increment is Extract<HostFrame, { type: 'host/workspace-changed' }> =>
        increment.type === 'host/workspace-changed',
    )
    expect(workspaceChanged?.workspace.sessionIds).toEqual([sessionId])
    abort.abort()
  })

  it('does not publish a Workspace whose registry-order commit fails', async () => {
    const { api, storageDomain, root } = await harness()
    const domain = storageDomain.get('workspace')
    if (domain === undefined) throw new Error('workspace domain is not open')
    vi.spyOn(domain.global, 'set').mockRejectedValueOnce(new Error('simulated registry order failure'))
    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const next = stream.next()

    const failed = await api.workspace.create(request({ path: stageDir(root, 'ghost') }))
    expect(failed.result.ok).toBe(false)
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    abort.abort()
    expect(await next).toMatchObject({ done: true })
  })

  it('deletes the registration, keeps its session and folder, and streams one removal', async () => {
    const { api, ctx, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'delete-me') }))).workspace
    const sessionId = SessionId('session-kept-after-workspace-delete')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const removed = nextHostFrame(stream)
    expectOk(await api.workspace.delete(request({ workspaceId: workspace.workspaceId })))
    expect(await removed).toMatchObject({
      payload: { type: 'host/workspace-removed', workspaceId: workspace.workspaceId },
    })
    expect(expectOk(await api.workspace.list(request({}))).items).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)
    expect(ctx.agents.get(sessionId)).toBeDefined()
    expect(existsSync(workspace.path)).toBe(true)

    const missing = await api.workspace.delete(request({ workspaceId: workspace.workspaceId }))
    expect(missing.result).toMatchObject({
      ok: false,
      error: { code: 'workspace-not-found', details: { workspaceId: workspace.workspaceId } },
    })

    const reregistered = expectOk(await api.workspace.create(request({ path: workspace.path }))).workspace
    expect(reregistered.workspaceId).not.toBe(workspace.workspaceId)
    expect(reregistered.path).toBe(workspace.path)
    expect(reregistered.sessionIds).toEqual([])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)
    abort.abort()
  })

  it('archives a session into the global set, keeps its accounting, and streams the set once', async () => {
    const { api, root } = await harness()
    const workspace = expectOk(await api.workspace.create(request({ path: stageDir(root, 'archive-home') }))).workspace
    const sessionId = SessionId('session-to-archive')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId })))
    expect(expectOk(await api.workspace.list(request({}))).archivedSessionIds).toEqual([])

    const abort = new AbortController()
    const stream: AsyncIterator<RpcRequest<HostFrame>> =
      api.events.host(request({}), abort.signal)[Symbol.asyncIterator]()
    const changed = nextHostFrame(stream)
    expect(expectOk(await api.workspace.archiveSession(request({ sessionId }))).archivedSessionIds)
      .toEqual([sessionId])
    expect(await changed).toMatchObject({
      payload: { type: 'host/archived-sessions-changed', archivedSessionIds: [sessionId] },
    })

    // Accounting and the session itself are untouched; list re-baselines the set.
    const listed = expectOk(await api.workspace.list(request({})))
    expect(listed.archivedSessionIds).toEqual([sessionId])
    expect(listed.items[0]?.sessionIds).toEqual([sessionId])
    expect(expectOk(await api.sessions.list(request({}))).items.map(item => item.sessionId)).toContain(sessionId)

    // The idempotent repeat emits no second frame: the next observed frame is
    // the workspace-changed of a later attach, not another archive snapshot.
    const after = nextHostFrame(stream)
    expect(expectOk(await api.workspace.archiveSession(request({ sessionId }))).archivedSessionIds)
      .toEqual([sessionId])
    const otherSession = SessionId('session-after-archive')
    expectOk(await api.sessions.create(request({ workspaceId: workspace.workspaceId, sessionId: otherSession })))
    expect((await after).payload.type).not.toBe('host/archived-sessions-changed')

    const missing = await api.workspace.archiveSession(request({ sessionId: SessionId('session-ghost') }))
    expect(missing.result).toMatchObject({
      ok: false,
      error: { code: 'session-not-found', details: { sessionId: 'session-ghost' } },
    })
    abort.abort()
  })
})
