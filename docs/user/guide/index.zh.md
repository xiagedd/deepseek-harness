# 使用 Web UI

[English](index.md) | 中文

先按照[根 README](../../../README.md#run)启动 Web UI；命令会打印其访问地址。本指南从服务器已经运行的状态开始。`dsh` 进程会把调用目录作为默认文件系统位置，但新的 Web UI 在添加工作区前不会选中任何工作区。

## 配置模型

打开**设置 → 模型**，输入 DeepSeek API 密钥并保存。模型路由会立即可用，不需要重启服务器。

[模型配置指南](./providers.md)介绍其他提供方和自定义 OpenAI 兼容端点。

## 管理 MCP 服务器

打开**设置 → MCP**，可查看当前 profile cordis patch 中的 `@deepseek-ai/dsh-mcp-client` 行、连接状态与工具数量，并启用或禁用它们。开关会立即写入 Loader 的 `disabled`；新增服务器需编辑 profile 的 `cordis.patch.yml`。

## 管理 Skills

打开**设置 → Skills**，可列出项目 `.dsh/skills` / `.agents/skills` 与用户 `~/.dsh/skills` / `~/.agents/skills` 下的文件系统 skill。可开关模型可见性（改写 `disable-model-invocation`），或用系统编辑器打开 skill 文件。

## 管理 Rules

打开**设置 → Rules**，可列出 `dsh-agent-instructions` 发现的 `AGENTS.md` 兼容工作区指令文件。打开文件即可编辑，或在缺失时创建用户全局／项目根 `AGENTS.md`。文件存在即生效；这不是 Cursor 的 `.cursor/rules`。

## 编辑工作区忽略规则

打开**设置 → 忽略规则**，可查看或新建当前工作区根的 `.dshignore`。编辑器使用与 Host list/search 相同的 gitignore 风格模式（`*.meta`、`Library/`、`#` 注释、`!` 否定）。若仅有 `.cursorignore`，页面会提示；保存将创建 `.dshignore`。修改在下次列举或搜索即生效，无需重启服务器。

## 重启 Web 服务

打开**设置 → 通用设置**，点击**重启 Web 服务**。确认警告：服务会中断数秒。Host 接受后执行与终端相同的 `web:restart` 脚本（只结束本仓库当前端口上的 `dsh web` 监听）。页面等到新进程响应后刷新；若没有自动刷新，请硬刷新（Ctrl+Shift+R）。该按钮仅限回环。此入口第一次上线时，正在跑的 Host 可能还没有 `host.restartWeb`——请先在终端运行一次 `pnpm run web:restart`，之后即可用按钮。

## 选择工作区

点击**选择工作区**，添加启动 `dsh` 时所在的项目目录，然后选中它。选中工作区前，会话输入框不可用。

## 运行任务

启动一个会话并发送：

> Summarize this repository and identify its main packages.

agent 可以读取和编辑工作区文件、运行命令、委派工作并维护计划。当操作在当前权限策略下需要审批时，Web UI 会先询问你。

## Composer 与 Cursor

Web UI 没有 Cursor 的 Ask / Agent 模式切换、没有 Inline Edit（Ctrl+K），也没有 Tab 补全。

| Cursor | dsh Web |
|---|---|
| Ask（只读对话） | 输入框的 Access chip。选中即提交 `/permission <preset>`。这是 host `permissions` 投影里的沙箱+审批捆绑，不是 Ask 模式。默认名称是 `workspace-write`（Workspace Write）和 `danger-full-access`（Full access）。只有 host 表里包含 `read-only` 时，chip 才会出现该选项。 |
| Plan mode | `/plan`，或在 `+` Command 菜单里选 Plan。开启后出现 Plan chip；`/plan off` 或点击该 chip 即可关闭。plan mode 是软性指引，不是 Cursor Plan 模式的翻版，也不是只读沙箱。 |
| Agent / Edit（改文件） | 当前对话。agent 使用文件系统工具；当操作在当前权限策略下需要审批时，Web UI 会先询问你。没有 Ctrl+K 内联编辑。 |
| skill（技能） | 输入 `/` 后挑选 skill，或键入 `/name`。选中后插入字面文本 `/name `。与 host 命令同名的名称仍解析为命令。 |
| `@file` | 输入 `@` 后选择工作区文件或文件夹（source `workspace-file`）。插入路径芯片；模型收到绝对路径字面量（不塞文件正文）。正在运行的 subagent child 在同一 `@` 菜单的另一分组中。 |

输入框不会提供页内编辑器、分屏编辑、Ctrl+P、debug、扩展市场、内嵌浏览器、完整 Git 面板或 IDE PTY。

包约定：[会话 composer](../../../packages/client/ui-conversation/README.md)、[权限预设](../../../packages/client/ui-permission-presets/README.md)、[plan chip](../../../packages/client/ui-plan/README.md)、[斜杠命令](../../../packages/client/ui-commands/README.md)、[skill](../../../packages/client/ui-skill/README.md)、[subagent `@`](../../../packages/client/ui-subagent/README.md)。

## 继续使用

- [配置模型](./providers.md)
- [使用 Python SDK](./python-sdk.md)
- [使用其他 CLI 模式](../../../apps/cli/README.md)
- [开发插件](../develop/basic/)
