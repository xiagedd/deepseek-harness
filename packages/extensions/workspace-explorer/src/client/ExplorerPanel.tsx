import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'conversation.details.explorer': { kind: 'single'; scope: 'session' } }
}

type Entry = { name: string; path: string; kind: 'file' | 'directory' }
type Workspace = { workspaceId: string; path: string }
type List = (workspaceId: string) => Promise<readonly Entry[]>
type ExplorerResult = { ok: boolean; value?: unknown; error?: { message: string } }
type Connection = { rpc: { call(channel: string, endpoint: string, payload: unknown): Promise<ExplorerResult> } }

function Panel({ useSessions, sessionId, list, workspaces }: {
  sessionId: string
  useSessions: (selector: (state: { byId: Record<string, { cwd?: string }> }) => string | undefined) => string | undefined
  list: List
  workspaces: readonly Workspace[]
}) {
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const workspace = workspaces.find(item => item.path === cwd) ?? workspaces[0]
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const [error, setError] = useState<string>()
  const load = () => {
    if (workspace === undefined) return
    setError(undefined)
    void list(workspace.workspaceId).then(setEntries, reason => setError(reason instanceof Error ? reason.message : '无法读取目录'))
  }
  useEffect(load, [workspace?.workspaceId])
  return <section style={{ padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>资源管理器</strong><button type="button" onClick={load}>刷新</button></div><div title={cwd} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cwd ?? '未选择工作区'}</div>{error !== undefined && <div>{error}</div>}<ul>{entries.map(e => <li key={e.path}>{e.kind === 'directory' ? '文件夹 ' : '文件 '}{e.name}</li>)}</ul></section>
}

export const inject = ['slots', 'connection', 'workspaces']
export function apply(ctx: Context): void {
  const connection = (ctx as unknown as { connection: Connection }).connection
  ctx.slots.register({ name: 'conversation.details.explorer', inject: () => ({
    workspaces: ctx.workspaces.list.getSnapshot().items as readonly Workspace[],
    list: async (workspaceId: string) => {
      const result = await connection.rpc.call('/explorer', 'list', { workspaceId, path: '' })
      if (!result.ok) throw new Error(result.error?.message ?? '无法读取目录')
      return (result.value as { entries: readonly Entry[] }).entries
    },
  }) }, Panel)
}
