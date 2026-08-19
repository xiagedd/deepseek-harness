# Agent Note: Web 设置中的工作区 .dshignore 编辑器

Status: implemented

[English](2026-08-18-settings-ignore-editor.md) | 中文

## Problem

Explorer 的 list/search 已经尊重工作区根的 `.dshignore`（优先）或 `.cursorignore`，但用户仍需自己找文件手写。在询问忽略规则写在哪里之后，产品需要的是设置入口：打开当前工作区的产品 ignore 文件，而不必在文件系统里翻找。

## Decision

1. **Client 包** — `@deepseek-ai/dsh-client-ui-settings-ignore` 通过 `slots.inject` 注册 `settings.section` id `ignore`（order 19，紧挨 MCP），挂载方式与 Models / Plugins / MCP 一致。
2. **不新增 Host RPC** — 对固定的工作区根路径 `.dshignore` 复用 `host.readText` / `host.writeText`。Host 已在每次 list/search 重读 ignore 正文，并在 `writeText` 时失效搜索索引，因此保存无需重启 Host 进程。
3. **根路径解析** — 优先当前会话 `cwd`，否则 `workspaces.recentWorkspaceId` 对应路径，再否则第一个已注册工作区；都没有则显示空状态提示。
4. **Cursor 兼容** — 缺少 `.dshignore` 但存在 `.cursorignore` 时，编辑器保持为空并显示兼容提示；保存始终创建 `.dshignore`（此后 Host 优先使用它）。

## Alternatives considered

- **专用 `readWorkspaceIgnore` / `writeWorkspaceIgnore` Host 方法** — MVP 否决：路径策略与缺文件语义可由现有文本 IO 加薄客户端助手完成；多根或更强 schema 需求出现时再加专用 Remote。
- **并入 `ui-settings-mcp` 或 explorer** — 否决：忽略编辑是独立设置页，不应扩大 explorer 的贡献面。
- **可视化按行规则构建器** — 延后：需求是可编辑文本文件，不是 GUI 矩阵。

## Consequences

- 设置导航新增 **忽略规则** / **Ignore**。
- 保存只创建或更新 `.dshignore`；在出现 `.dshignore` 之前，`.cursorignore` 仍作读兼容回退。
- 用户仍需先选中工作区；页面不会臆造根路径。

## Required verification

- 纯助手 vitest：路径拼接；解析根；读已有 / 缺失 / 仅 cursor。
- 组件 vitest：无工作区、加载+保存更新、新建缺失、cursor 提示 + 保存失败。
- 浏览器插件 vitest：分区 id/order/label；懒 Host 读；写载荷。
- Client bundle：无 `.cjs` 分片；`require("./` 计数为 0。
