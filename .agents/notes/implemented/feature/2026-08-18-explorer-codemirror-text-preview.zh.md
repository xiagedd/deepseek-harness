# Agent Note: Explorer CodeMirror 文本预览引擎

Status: implemented

[English](2026-08-18-explorer-codemirror-text-preview.md) | 中文

## 问题

资源管理器预览列把 `host.readText` 的正文放进裸 `<pre>`：没有行号、语法高亮，也没有编辑器级查找。产品需要对 C# 与常见文本更友好的只读浏览，终局又必须能做到 Monaco / VS Code 类似能力。若把 CodeMirror API 直接写进 `FilePreviewPanel`，会阻碍日后替换，并把编辑器细节散落到业务 UI。

## 决策

**v1 只在文本预览引擎边界之后挂载 CodeMirror 6。** `TextPreviewEngineProps`（`path`、`text`、`language`、`readOnly: true`）是 React 契约。`TextPreviewBody` 负责过大回退与懒加载引擎，且从不 import `@codemirror/*`。`CodeMirrorTextPreview` 是唯一 CM6 适配层（行号、含 csharp 的语言模式、查找、`--dsw-*` / `--shiki-*` 主题）。`FilePreviewPanel` 保留标签 / loading / error，仅替换 ready 正文的 `<pre>`。

**客户端大小门槛为 1 MiB UTF-8。** 超大 ready 正文显示 `preview.tooLarge`，不挂载引擎。二进制 / 非 UTF-8 仍走 store 错误。

**终局是同一边界后的 Monaco。** 替换时新建适配层 + lazy import + 依赖变更；store 动作与多标签行为不动。可编辑保存仍不在 v1 范围。

## 曾考虑的替代方案

**仅用 Shiki 只读视图（复用 ui-primitives 高亮）。** 不采用为 v1：产品要第三方编辑器级操作（查找、gutter），并需要能通向 Monaco 的路径；Shiki 仍用于聊天卡片。

**v1 直接上 Monaco。** 不采用：worker / Vite / CSP / bundle 成本对只读预览列不对称；引擎边界正是为日后换 Monaco 而设。

**自研 gutter + 高亮 + 查找。** 不采用：违背「优先维护好的依赖」；自有代码与测试只会增加。

**同一次改动做可编辑预览。** 不采用；v1 保持只读，预览列不走 `host.writeText`。

## 后果

`@deepseek-ai/dsh-client-ui-explorer` 依赖 `@codemirror/*`；首次富预览才加载 CM6 chunk。README 写明 1 MiB 限制与 Monaco 迁移边界。GUI 测试覆盖语言路由、过大回退、只读引擎属性，以及对 EditorView 生命周期的 mock。并行的可编辑预览尝试（dirty draft / 预览列 `host.writeText` 保存）按制作人 v1 锁定被否决；冲突中仅保留 `ExplorerPanel.openFile` 的超大文件预检。
