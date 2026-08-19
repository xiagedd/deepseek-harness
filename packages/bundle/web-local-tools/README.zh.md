# `@deepseek-ai/dsh-web-local-tools`

[English](README.md) | 中文

可选的 Web 叠加组合包：[`cordis.patch.yml`](cordis.patch.yml) 插入 Settings 的 MCP / Skills / Rules / Ignore 页面，以及它们调用的 Host inventory Remote。profile 组合器通过 manifest（元数据清单）的 `dsh.bundle.patch` 字段解析该 patch。本包没有运行时 API。

本叠加层是本轮**新建插件包**的可安装副本。它不抽出 explorer 的 CodeMirror 预览、布局持久化、composer chip 跳转，或 `host.searchEntries` / `host.revealPath` / `host.restartWeb`；那些仍是核心包内的改动。分类以及核心一半无法随本叠加层交付的原因，见 [叠加层 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-18-web-local-tools-overlay-bundle.md)。

本仓库内置的 [`dsh-web-app`](../web-app/README.md) 已经插入相同的行 id。只挂内置 web-app **或** 本叠加层，不要两者一起挂：`applyEntryPatches` 会追加重复 id，Settings 的 slot 注册会直接失败。

## 本叠加层挂载的行

| 行 id | 包 | 职责 |
|---|---|---|
| `mcp-inventory` | `@deepseek-ai/dsh-host-mcp-inventory` | Host Remote：列出/启用 MCP client Loader 行 |
| `skill-inventory` | `@deepseek-ai/dsh-host-skill-inventory` | Host Remote：列出文件系统 skill 并切换模型调用 |
| `rules-inventory` | `@deepseek-ai/dsh-host-rules-inventory` | Host Remote：列出/创建与 AGENTS.md 兼容的 rules |
| `ui-settings-mcp` | `@deepseek-ai/dsh-client-ui-settings-mcp` | Settings MCP 页 |
| `ui-settings-skills` | `@deepseek-ai/dsh-client-ui-settings-skills` | Settings Skills 页 |
| `ui-settings-rules` | `@deepseek-ai/dsh-client-ui-settings-rules` | Settings Rules 页 |
| `ui-settings-ignore` | `@deepseek-ai/dsh-client-ui-settings-ignore` | Settings `.dshignore` 编辑器（走 `host.readText` / `host.writeText`；没有额外 Host inventory） |

这里点名的每个 client 包都必须出现在**使用方 app 或组合包 `package.json` 的 `dependencies`** 里。本叠加层的 manifest 已经列出它们，以便 `healProfilesModuleFallback` 把它们符号链接进 `$DSH_HOME/profiles/node_modules`。只改 YAML、不写依赖行时，浏览器 roster 解析不到 `/plugins/<id>/client.js`，Settings 侧栏会保持空白且不报加载错误。

## 前置依赖（本叠加层不交付的核心包）

使用方的 web profile 必须已经跑在包含本轮核心改动的 checkout 上。没有那些改动时，即使本叠加层加载成功，explorer 预览/搜索/reveal、布局持久化、composer chip 跳转，以及 Settings → 重启 Web 也不会出现。

必需的核心包（本仓库当前树；没有单独的叠加层 commit 范围）：

- `@deepseek-ai/dsh-client-ui-explorer` — CodeMirror 6 预览、工作区搜索、ignore 过滤展示、三态文件夹图标、在文件管理器中显示、双击用 OS 打开、Ctrl+L 加入聊天、浏览态持久化、搜索叠加层、全局工作区
- `@deepseek-ai/dsh-client-ui-layout` — details/preview 面板持久化；切换 session 不关闭这些面板
- `@deepseek-ai/dsh-client-ui-conversation` — composer chip 单元格宽高、点击 reveal、行跳转
- `@deepseek-ai/dsh-client-ui-settings-general` — 重启 Web 控件
- `@deepseek-ai/dsh-host-apiproxy` — `host.searchEntries`、workspace-ignore、`host.revealPath`、`host.restartWeb`
- `@deepseek-ai/dsh-client-connection` 与 `@deepseek-ai/dsh-api-remotes` — 暴露这些 Host 方法的 generated/client 面
- `@deepseek-ai/dsh-native-command` — explorer reveal 使用的免 shell 运行器

`pnpm run web:restart` 与 `scripts/restart-dsh-web.*` 留在仓库根，不是本叠加层的载荷。

早于这些 RPC 方法的 Host 进程会对它们返回 404，直到该 Node 进程重启。只重建 Client 需要硬刷新（`Ctrl+Shift+R`）；硬刷新不会带上 Host 方法。

## 安装

仅当目标 profile 的 `dsh-web-app` patch **尚未**插入上表那些行 id 时，才使用本叠加层。

1. 从包含上述七个 workspace 包的 checkout（本 monorepo）消费本包。无关的 npm 安装解析不了 `workspace:^`。
2. 把叠加层加进 profile：`dsh plugin --profile <name> add <packages/bundle/web-local-tools 的绝对路径>`。这会写入 profile `package.json` 依赖，并把 `@deepseek-ai/dsh-web-local-tools` 追加到 `dsh.profile.bundles`。若 pnpm 在本 workspace 之外拒绝 `workspace:` 协议，就把同样的七个包作为 `file:` 依赖写到**使用方 app 或某个已挂载组合包**上（清单以本叠加层的 `package.json` 为准），再手工把 `@deepseek-ai/dsh-web-local-tools` 写入 `dsh.profile.bundles`。
3. 重启 Host（在本 checkout 执行 `pnpm run web:restart`，或该安装对应的等价命令）。然后硬刷新浏览器。

不要复制半个 monorepo。叠加层是 patch 层；heal 从安装目录或 profile 的 `node_modules` 解析被点名的插件。

## 给同事的清单

1. 确认前置依赖里的核心包已经在对方的 dsh 上（本仓库当前树）。
2. 若其内置 `dsh-web-app` 已经插入 `mcp-inventory` / `ui-settings-mcp`（本仓库即是）：到此结束；Settings 页面已有。不要再加本叠加层。
3. 否则：`dsh plugin --profile web add <本包路径>`（或安装第 2 步的两文件改法）。
4. 重启一次 Host，然后硬刷新浏览器。

## 模型体验

通过插入的 Settings inventory 行间接产生影响：每条挂载行的模型可见行为由其所属的包负责；本组合包自身不贡献任何模型可见文本。

#### KV Cache 影响

无直接影响；每条插入行的影响由其所属的包负责。

## 已知限制与延期工作

- **与内置 `dsh-web-app` 中相同 id 的行互斥** — 两者一起挂会追加重复 Loader 条目；Settings 的 slot 注册会直接失败。
- **不交付 explorer/layout/conversation/apiproxy 的改动** — 那些仍是核心包内的修改；本叠加层不能单独提供 CodeMirror 6 或新的 Host RPC。
- **client 包必须写在组合包/app 依赖里** — 只挂 YAML 时 `healProfilesModuleFallback` 没有符号链接，Settings 侧栏保持空白。
