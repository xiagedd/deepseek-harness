import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one MCP client entry. */
export type McpEntryId = Branded<'McpEntryId'>

/** Transport selected by the mcp-client Config union. */
export type McpTransport = 'stdio' | 'streamable-http' | 'unknown'

/**
 * User-visible connection state derived from Loader enablement and the entry's
 * root Fiber phase. Loader remains the sole lifecycle authority.
 */
export type McpConnectionStatus =
  | 'disabled'
  | 'connected'
  | 'connecting'
  | 'error'
  | 'disconnected'

/** One mcp-client Loader entry exposed to trusted clients. */
export interface McpInventoryEntry {
  readonly entryId: McpEntryId
  /** Model-facing server namespace from the entry config (`serverName`). */
  readonly serverName: string
  /** Transport selected in the entry config, or `unknown` when absent. */
  readonly transport: McpTransport
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  /** Derived connection status for Settings presentation. */
  readonly status: McpConnectionStatus
  /** Currently registered tools under `mcp__<serverName>__*`, or 0 when none. */
  readonly toolCount: number
}

/** Point-in-time inventory returned by the MCP inventory Remote. */
export interface McpInventorySnapshot {
  readonly entries: readonly McpInventoryEntry[]
}
