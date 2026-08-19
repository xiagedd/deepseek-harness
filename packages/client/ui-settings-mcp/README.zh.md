# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

Web GUI 的 **MCP** 设置分区。浏览器插件向 [`ui-settings`](../ui-settings/README.zh.md) 拥有的设置壳注册一个 id 为 `mcp`（order 18）的本地化 `settings.section` 贡献。插件激活期间不会读取 Remote；打开该分区时才挂载组件，并通过 [`api-remotes`](../../api/remotes/README.zh.md) 懒调用 `ctx.remote.mcpInventory.list()` / `setEnabled`。

页面列出每个已配置的 `@deepseek-ai/dsh-mcp-client` Loader 条目及其服务器名、派生连接状态、传输方式与当前工具数量。开关通过 Host Remote 写入启用状态；Loader 会立即重启或处置，所属 profile patch 持久化 `disabled` 标志。空态、加载中与通用失败态留在已挂载组件本地。

## Model Experience

无。本包只在浏览器设置中可视化并开关 Host 拥有的 MCP Loader 条目，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **没有「新建 MCP」向导** — 创建服务器仍需编辑 cordis patch；见 Host 包的限制说明。
- **没有 User／项目 scope 分组** — 与 Host 清单一并推迟。
- **不可展开错误输出** — 仅显示失败状态，不含 stderr。
