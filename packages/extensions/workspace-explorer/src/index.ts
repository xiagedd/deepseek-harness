import { lstat, readdir, realpath } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

const bad = (message: string): RpcResult<never> => ({ ok: false, error: { code: 'bad-request', message, details: { issues: [] } } })
const parts = (path: unknown): string[] | undefined => typeof path === 'string' && !path.includes('\\') && !path.includes('\0') && (path === '' || path.split('/').every(p => p !== '' && p !== '.' && p !== '..')) ? (path === '' ? [] : path.split('/')) : undefined

export const inject = ['connection', 'workspaceRegistry']
export function apply(ctx: Context): void {
  ctx.connection.rpc.handle('/explorer', async (endpoint, payload): Promise<RpcResult<unknown>> => {
    if (endpoint !== 'list' || payload === null || typeof payload !== 'object') return bad('unsupported operation')
    const request = payload as { workspaceId?: unknown; path?: unknown }
    const path = parts(request.path ?? '')
    if (typeof request.workspaceId !== 'string' || path === undefined) return bad('invalid Explorer path')
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(request.workspaceId))
    if (workspace === undefined) return { ok: false, error: { code: 'workspace-not-found', message: 'workspace not found', details: { workspaceId: request.workspaceId } } }
    try {
      const root = await realpath(workspace.path)
      const candidate = resolve(root, ...path)
      const target = await realpath(candidate)
      const rel = relative(root, target)
      if ((rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`))) || (await lstat(candidate)).isSymbolicLink()) return bad('outside workspace root')
      if (!(await lstat(target)).isDirectory()) return bad('not a directory')
      const entries = (await readdir(target, { withFileTypes: true })).filter(e => !e.name.startsWith('.') && !e.name.endsWith('.meta') && (e.isDirectory() || e.isFile())).map(e => ({ name: e.name, path: [...path, e.name].join('/'), kind: e.isDirectory() ? 'directory' as const : 'file' as const })).sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1)
      return { ok: true, value: { entries } }
    } catch { return bad('directory unavailable') }
  }, { authority: 'loopback' })
}
