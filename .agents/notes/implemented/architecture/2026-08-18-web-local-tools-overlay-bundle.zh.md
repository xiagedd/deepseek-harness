# Agent Note: Web local-tools overlay bundle

Status: implemented

[English](2026-08-18-web-local-tools-overlay-bundle.md) | 中文

## Problem

本轮 Web 本地扩展混了两类改动：已随发行版交付的核心包内修改（`ui-explorer`、`ui-layout`、`ui-conversation`、`ui-settings-general`、`apiproxy`、`connection`、`remotes`、`native-command`），以及新建的独立插件（Settings 的 MCP/Skills/Rules/Ignore 与 Host inventory）。制作人需要一份别人能安装的交付物。复制半个 monorepo，或把核心代码从 `dsh-web-app` 搬走，要么让库存 web profile 无法启动，要么悄悄丢掉内置 web-app 已经挂载的 explorer/layout 行为。

## Decision

在 [`packages/bundle/web-local-tools`](../../../../packages/bundle/web-local-tools/README.md) 交付 `@deepseek-ai/dsh-web-local-tools`，作为**可选叠加组合包**。它的 `cordis.patch.yml` 只插入新建插件行。它的 `package.json` `dependencies` 列出这些包，以便 `healProfilesModuleFallback` 把它们符号链接进 `$DSH_HOME/profiles/node_modules`。

内置 [`dsh-web-app`](../../../../packages/bundle/web-app/README.md) 保留相同的行 id，因此本仓库的默认 web profile 不需要本叠加层也能启动。使用方只挂**当前内置 web-app** 或本叠加层，不要两者一起挂：`applyEntryPatches` 会把未指定目标的 `insert` 追加到组合列表，重复 id 会变成两条 Loader 条目，Settings 的 slot 注册会直接失败。

### A 类 — 已在核心包内（不在本叠加层）

这些需要本仓库当前树中的具名包。不把那些包抽出来，就无法随本叠加层交付。

| 区域 | 包 | 本轮加入的内容 |
|---|---|---|
| Explorer | `@deepseek-ai/dsh-client-ui-explorer` | CodeMirror 6 预览、工作区搜索、ignore 过滤展示、三态文件夹图标、在文件管理器中显示、双击用 OS 打开、Ctrl+L 加入聊天、浏览态持久化、搜索叠加层、全局工作区 |
| Layout | `@deepseek-ai/dsh-client-ui-layout` | details/preview 面板持久化；切换 session 不关闭这些面板 |
| Conversation | `@deepseek-ai/dsh-client-ui-conversation` | composer chip 单元格宽高、点击 reveal、行跳转 |
| Settings General | `@deepseek-ai/dsh-client-ui-settings-general` | 重启 Web 控件 |
| Host API | `@deepseek-ai/dsh-host-apiproxy` | `host.searchEntries`、workspace-ignore、`host.revealPath`、`host.restartWeb` |
| 线路 | `@deepseek-ai/dsh-client-connection`、`@deepseek-ai/dsh-api-remotes` | 这些 Host 方法的 client/generated 面 |
| 原生命令 | `@deepseek-ai/dsh-native-command` | explorer reveal 使用的免 shell 运行器 |
| 脚本 | 仓库根 | `pnpm run web:restart`、`scripts/restart-dsh-web.*` |

所属功能说明：[CodeMirror 预览](../feature/2026-08-18-explorer-codemirror-text-preview.md)、[可编辑预览](../feature/2026-08-18-explorer-editable-codemirror-preview.md)、[主题设置](../feature/2026-08-18-explorer-preview-editor-theme-settings.md)、[工作区 ignore 与搜索](../feature/2026-08-18-explorer-workspace-ignore-and-search.md)、[三态文件夹图标](../feature/2026-08-18-explorer-three-state-folder-glyph.md)、[在文件管理器中显示](../feature/2026-08-18-explorer-reveal-in-file-manager.md)、[双击用 OS 打开](../feature/2026-08-18-explorer-code-file-double-click-os-open.md)、[预览加入聊天](../feature/2026-08-18-explorer-preview-add-to-chat.md)、[浏览态持久化](../feature/2026-08-18-explorer-browse-persist.md)、[布局持久化](../feature/2026-08-18-explorer-layout-persist.md)、[全局工作区](../feature/2026-08-18-explorer-preview-global-workspaces.md)、[chip reveal 与行跳转](../feature/2026-08-18-composer-chip-reveal-and-line-jump.md)、[重启 Web](../feature/2026-08-18-settings-web-restart.md)、[重启自证](../process/2026-08-18-dsh-web-restart-self-proof.md)。

### B 类 — 新建独立包（本叠加层）

| 职责 | 包 |
|---|---|
| Host MCP inventory | `@deepseek-ai/dsh-host-mcp-inventory` |
| Host skill inventory | `@deepseek-ai/dsh-host-skill-inventory` |
| Host rules inventory | `@deepseek-ai/dsh-host-rules-inventory` |
| Settings MCP | `@deepseek-ai/dsh-client-ui-settings-mcp` |
| Settings Skills | `@deepseek-ai/dsh-client-ui-settings-skills` |
| Settings Rules | `@deepseek-ai/dsh-client-ui-settings-rules` |
| Settings Ignore | `@deepseek-ai/dsh-client-ui-settings-ignore` |
| 叠加组合包 | `@deepseek-ai/dsh-web-local-tools` |

Ignore 编辑复用 `host.readText` / `host.writeText`；没有额外 Host inventory。所属说明：[MCP inventory](../feature/2026-08-18-settings-mcp-inventory.md)、[Skills 与 Rules](../feature/2026-08-18-settings-skills-rules-inventory.md)、[Ignore 编辑器](../feature/2026-08-18-settings-ignore-editor.md)。

`PROFILE_TEMPLATES.web` 仍是 `dsh-base` + `dsh-web-app`。把本叠加层加进随发行版交付的 web 模板，会在本仓库默认 profile 上重复挂载 B 类行。

## Alternatives considered

**把新建 Settings 行从 `dsh-web-app` 挪走，只让本叠加层进入 `PROFILE_TEMPLATES.web`。** 否决：制作人正在跑的 web profile 已经从内置 web-app 组合这些行。在没有同步改 profile 模板并重启 Host 的情况下删掉它们，下次启动会丢掉 Settings 页面。

**把 explorer/layout/conversation/apiproxy 抽进本叠加层。** 否决：那些包已被内置 web-app 挂载；拆包会是一次大重构，还会让不挂本叠加层的库存 web profile 失去 CodeMirror 6 和新的 Host RPC。

**把半个 monorepo 交给别人。** 否决：第三方安装的产品形态是组合包 patch 层（`dsh plugin --profile <name> add` / `dsh.profile.bundles`），不是再 checkout 一份 `packages/client` 和 `packages/host`。

**让叠加层的 insert 幂等（已存在的 id 就跳过）。** 否决：`applyEntryPatches` 没有 skip-if-present 的 insert。把这写进 YAML 等于改 Loader；当前约定是文档写明互斥。

## Consequences

使用本仓库当前 `dsh-web-app` 的人已经同时拥有 A 类和 B 类；他们不能再挂本叠加层。web-app patch 缺少 B 类 id 的人，可以在 checkout 已含 A 类核心改动之后挂本叠加层。只挂 YAML、不把 client 包写进 app 或组合包 `dependencies` 时，Settings 页面会缺失且不报加载错误。Host RPC 新增仍需重启 Host；只重建 Client 需要硬刷新。
