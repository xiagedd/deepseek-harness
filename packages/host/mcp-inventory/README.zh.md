# @deepseek-ai/dsh-host-mcp-inventory

[English](README.md) | 中文

面向 MCP 客户端 Loader 条目的 Host Remote。`McpInventoryGateway` 注册 `mcpInventory` 服务，并发布两个由 Typert 生成的直接 Remote：`mcpInventory/list` 与 `mcpInventory/setEnabled`。每次调用都直接读取 `ctx.loader.entries()`，只保留 `@deepseek-ai/dsh-mcp-client` 行，并投影每行的 Loader 条目 id、`serverName`、传输方式、有效启用状态、派生的连接状态，以及当前已在 `mcp__<serverName>__*` 下注册的工具数量。

`setEnabled` 写入 Loader 的 `disabled`（启用时为 null，禁用时为 `true`）。Loader 会立即处置或重启该条目，所属 Include 树把变更持久化到引入该行的 profile patch。非 MCP 条目与未知 id 会被拒绝。工具数量来自可选的 `ctx.tools` 读取；没有该服务时记为 `0`。

公开 payload 类型位于 `./types`。Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。该服务仅 Remote：Client 包通过 [`api-remotes`](../../api/remotes/README.zh.md) 消费它。

## Model Experience

无。本包是仅 Host 侧的清单投影，不注册任何提示词、工具、消息或提供方请求。

#### KV Cache effect

无；本包从不组装模型输入。

## Known Limitations and Deferred Work

- **没有新建／编辑向导** — 新增 MCP 服务器仍需编辑 cordis patch（或安装会插入一行的组合包）。设置页只列出并开关已有行。
- **没有 User／项目 scope 分组** — 所有存活 Loader 条目以扁平列表展示；哪棵 Include 树引入该行的来源信息推迟。
- **不流式输出错误** — 失败的 fiber 仅表现为 `error` 状态，不捕获 stderr。
- **工具数量是瞬时值** — 已禁用或断开的服务器因工具已注销而报告 `0`。
