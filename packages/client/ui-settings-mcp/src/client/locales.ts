/** Copy dictionaries for the MCP Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: 'MCP',
  title: 'MCP',
  intro: '查看本部署已配置的 MCP 服务器，并开关它们。开关会写回 profile 的 cordis patch，并由 Loader 立即启停。',
  loading: '正在读取 MCP…',
  error: '暂时无法读取 MCP 配置。',
  retry: '重试',
  empty: '尚未配置任何 MCP 服务器。在 profile 的 cordis.patch.yml 中插入 @deepseek-ai/dsh-mcp-client 条目后会出现在这里。',
  catalog: '已配置的 MCP',
  tools: '{count} 个工具',
  statusDisabled: '已禁用',
  statusConnected: '已连接',
  statusConnecting: '连接中',
  statusError: '错误',
  statusDisconnected: '未连接',
  transport: '传输',
  enable: '启用 {name}',
  disable: '禁用 {name}',
  toggleBusy: '正在更新…',
  toggleFailed: '无法更新启用状态。',
  effectHint: '开关立即生效：禁用会卸载该 MCP 并移除其工具；启用会重新连接。',
} satisfies Record<string, string>

/** MCP settings locale key union. */
export type McpSettingsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'MCP',
  title: 'MCP',
  intro: 'Review configured MCP servers for this deployment and turn them on or off. Toggles write back to the profile cordis patch and the Loader starts or stops them immediately.',
  loading: 'Reading MCP…',
  error: 'MCP configuration is temporarily unavailable.',
  retry: 'Retry',
  empty: 'No MCP servers are configured yet. Insert @deepseek-ai/dsh-mcp-client rows in the profile cordis.patch.yml to see them here.',
  catalog: 'Configured MCP',
  tools: '{count} tools',
  statusDisabled: 'Disabled',
  statusConnected: 'Connected',
  statusConnecting: 'Connecting',
  statusError: 'Error',
  statusDisconnected: 'Disconnected',
  transport: 'Transport',
  enable: 'Enable {name}',
  disable: 'Disable {name}',
  toggleBusy: 'Updating…',
  toggleFailed: 'Could not update enablement.',
  effectHint: 'Toggles take effect immediately: disabling unloads that MCP and removes its tools; enabling reconnects.',
} satisfies Record<McpSettingsLocaleKey, string>
