# @deepseek-ai/dsh-client-ui-settings-rules

[English](README.md) | 中文

Web GUI 的 **Rules** 设置分区。浏览器插件注册 id 为 `rules`（order 16）的本地化 `settings.section`。打开分区时懒调用 `ctx.remote.rulesInventory.list` / `create`，并通过 `ctx.workspaces.openPath` 打开文件。

页面列出 AGENTS.md 兼容的指令文件，含展示路径、绝对路径以及用户全局／项目 scope。新建按钮在用户全局或项目根缺失时写入起步用 `AGENTS.md`。没有启用开关——文件存在即权威。

## Model Experience

无。本包只在浏览器设置中可视化 Host 拥有的指令文件，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **没有内嵌编辑器** — 内容编辑在操作系统打开的文件中进行。
- **没有按文件禁用开关** — 请删除或清空文件。
