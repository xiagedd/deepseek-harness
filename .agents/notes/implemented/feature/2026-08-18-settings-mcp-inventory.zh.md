# Agent Note: Web 设置 MCP 清单页

Status: implemented

[English](2026-08-18-settings-mcp-inventory.md) | 中文

## Problem

用户把 MCP 服务器以 `@deepseek-ai/dsh-mcp-client` Loader 行装进 profile 的 `cordis.patch.yml`，但 Web 设置没有页面列出它们或翻转 Loader 的 `disabled` 标志。仅有的视图是通用插件清单（只读、全部插件）或手工编辑 YAML。

## Decision

交付专用的 Host Remote 与设置分区：

1. **权威存储** — 仍是 profile 的 Include 树。`mcpInventory.setEnabled` 调用 `ctx.loader.update(id, { disabled: null | true })`，由所属 Include 写回持久化。`~/.dsh/settings.yaml` 无关（只承载 LLM／偏好命名空间）。
2. **Host** — `@deepseek-ai/dsh-host-mcp-inventory` 只保留 `@deepseek-ai/dsh-mcp-client` 条目，投影 `serverName`、传输、启用态、派生连接状态，以及当前 `mcp__<serverName>__*` 工具数。
3. **Client** — `@deepseek-ai/dsh-client-ui-settings-mcp` 通过与模型／插件／Agent 预设相同的 `slots.inject` 路径注册 `settings.section` id `mcp`（order 18）。
4. **立即生效** — Loader update 即启停路径；UI 说明开关无需重启 Host。

## Alternatives considered

- **给只读的 `pluginInventory` 加写接口** — 否决：该服务约定是瞬时投影且无变更路径；MCP 需要更窄的允许列表与专用字段。
- **把启停存进 `settings.yaml`** — 否决：那不会控制 `ctx.tools` 是否看到 MCP 工具；Loader `disabled` 才是既有机制。
- **完整复刻 Cursor 市场／新建向导** — 推迟：尚无创建 API；用户仍插入 cordis patch 行。

## Consequences

- 设置导航多出 MCP 项；空态说明 cordis-patch 安装路径。
- 开关写回 profile patch，并为后续 agent 轮次卸载或重连工具。
- 推迟：新建 MCP 向导、User／项目 scope 分组、可展开错误／stderr。

## Required verification

- Host 单测：列表只含 mcp-client；setEnabled 持久化 disabled；拒绝非 MCP id。
- Client vitest：分区注册、列表渲染、开关写回、空态。
- Client bundle：无 `.cjs` 分片；`require("./` 计数为 0。
