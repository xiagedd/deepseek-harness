/**
 * Host Remote for MCP client Loader entries: list configured servers and toggle
 * their Loader `disabled` flag. Persistence rides the owning Include tree's
 * ordinary write-back (profile `cordis.patch.yml` for user inserts).
 */

import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
// Type-only: makes optional `ctx.get('tools')` resolve to the Tools service.
import type {} from '@deepseek-ai/dsh-tools'
import type {
  McpConnectionStatus,
  McpEntryId,
  McpInventoryEntry,
  McpInventorySnapshot,
  McpTransport,
} from './types.ts'

export type * from './types.ts'

/** Exact module specifier of every MCP client bridge instance. */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function mcpEntryId(value: string): McpEntryId {
  return value as McpEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/**
 * Derive Settings status from enablement and root Fiber phase.
 * @param enabled - effective Loader enablement.
 * @param fiberState - live root Fiber state, or undefined when unmounted.
 */
function connectionStatus(enabled: boolean, fiberState: FiberState | undefined): McpConnectionStatus {
  if (!enabled) return 'disabled'
  if (fiberState === undefined) return 'disconnected'
  if (fiberState === FIBER_STATE.ACTIVE) return 'connected'
  if (fiberState === FIBER_STATE.FAILED) return 'error'
  if (fiberState === FIBER_STATE.PENDING || fiberState === FIBER_STATE.LOADING) return 'connecting'
  return 'disconnected'
}

/**
 * Read the public `serverName` / `transport` fields without trusting the rest of
 * the Config object (env, headers, and !!js expressions stay Host-local).
 * @param config - Loader entry config blob.
 */
function readMcpConfig(config: unknown): { serverName: string; transport: McpTransport } {
  if (config === null || typeof config !== 'object') {
    return { serverName: '', transport: 'unknown' }
  }
  const record = config as Record<string, unknown>
  const serverName = typeof record.serverName === 'string' ? record.serverName : ''
  const transport = record.transport === 'stdio' || record.transport === 'streamable-http'
    ? record.transport
    : 'unknown'
  return { serverName, transport }
}

/**
 * Count currently registered tools under one MCP server namespace.
 * @param ctx - Host context that may carry `tools`.
 * @param serverName - public MCP namespace.
 */
function countTools(ctx: Context, serverName: string): number {
  if (serverName.length === 0) return 0
  const tools = ctx.get('tools')
  if (tools === undefined) return 0
  const prefix = `mcp__${serverName}__`
  return tools.schemas().filter(schema => schema.name.startsWith(prefix)).length
}

/** Remote service exposing MCP client entries for Settings. */
export class McpInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'mcpInventory')
  }

  /**
   * Project every live mcp-client Loader entry in Loader order.
   * @returns Current MCP inventory snapshot.
   */
  @Remote('list')
  list(): McpInventorySnapshot {
    return { entries: this.collect() }
  }

  /**
   * Persist enablement on one mcp-client entry. `enabled: true` clears
   * `disabled` (null write-back); `enabled: false` sets `disabled: true`. The
   * Loader restarts or disposes the entry immediately and the Include tree
   * writes the owning cordis patch.
   * @param entryId - Loader-tree id of the target entry.
   * @param enabled - desired effective enablement for this entry.
   * @returns Fresh inventory after the update settles.
   */
  @Remote('setEnabled')
  async setEnabled(entryId: McpEntryId, enabled: boolean): Promise<McpInventorySnapshot> {
    const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === entryId)
    if (entry === undefined) {
      throw new Error(`mcpInventory.setEnabled: unknown entry ${entryId}`)
    }
    if (entry.options.name !== MCP_CLIENT_MODULE) {
      throw new Error(`mcpInventory.setEnabled: entry ${entryId} is not ${MCP_CLIENT_MODULE}`)
    }
    if (entry.options.group) {
      throw new Error(`mcpInventory.setEnabled: entry ${entryId} is a group`)
    }
    await this.ctx.loader.update(entryId, { disabled: enabled ? null : true })
    return { entries: this.collect() }
  }

  /** Build the current MCP projection without caching. */
  private collect(): McpInventoryEntry[] {
    const entries: McpInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      if (entry.options.name !== MCP_CLIENT_MODULE) continue
      const { serverName, transport } = readMcpConfig(entry.options.config)
      const enabled = !entry.disabled
      entries.push({
        entryId: mcpEntryId(entry.id),
        serverName: serverName.length > 0 ? serverName : entry.id,
        transport,
        enabled,
        status: connectionStatus(enabled, entry.fiber?.state),
        toolCount: countTools(this.ctx, serverName),
      })
    }
    return entries
  }
}

export default McpInventoryGateway
