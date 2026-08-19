# @deepseek-ai/dsh-host-rules-inventory

[English](README.md) | 中文

面向工作区说明文件（产品侧「Rules」）的 Host Remote。`RulesInventoryGateway` 注册 `rulesInventory` 服务，并发布 `rulesInventory/list` 与 `rulesInventory/create`。列举使用 `@deepseek-ai/dsh-agent-instructions` 的发现逻辑：`$DSH_HOME/AGENTS.md`，以及从项目根到给定 cwd 路径上每一个存在的 `AGENTS.md` / `CLAUDE.md`（及本地 overlay）。没有按文件启停标志——文件存在即权威；编辑即打开磁盘上的文件。

`create` 在缺失时于用户全局（`$DSH_HOME`）或项目根写入一份起步用 `AGENTS.md`。Cursor 风格的 `.cursor/rules` 树不属于本产品机制。

公开 payload 类型位于 `./types`。Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

## Model Experience

无。本包是仅 Host 侧的清单投影，不注册任何提示词、工具、消息或提供方请求。

#### KV Cache effect

无；本包从不组装模型输入。

## Known Limitations and Deferred Work

- **没有内嵌编辑器** — 设置页通过操作系统交接打开文件；内容编辑留在用户编辑器。
- **没有启用开关** — 删除或清空文件即禁用路径；本 Remote 不会改名候选文件。
- **Web 可能禁用 `agent-instructions`** — 对加载该插件的组合，文件仍是权威源；清单仍会列出并创建它们。
