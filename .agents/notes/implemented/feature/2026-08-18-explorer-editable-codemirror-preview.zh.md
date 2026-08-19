# Agent Note: Editable CodeMirror 6 explorer preview

Status: implemented

[English](2026-08-18-explorer-editable-codemirror-preview.md) | 中文

## Problem

资源管理器预览列用纯 `<pre>` 展示 `host.readText` 正文：无行号、无高亮、无查找/折叠，也无法页内保存。产品需要面向 C# 与常见文本的维护型网页文本组件，并保留后续走向 Monaco / 类 VS Code 编辑的路径，同时不重做预览多标签与布局。

## Decision

预览列在薄适配 **`TextPreviewEngineProps`**（`path` / `text` / `language` / `readOnly` / `onChange` / `onSave`）之后挂载可编辑的 **CodeMirror 6**。`TextPreviewBody` 懒加载 `CodeMirrorTextPreview`；面板、store 与 `openFile` 从不 import `@codemirror/*`。后续 Monaco 只需替换该懒加载模块。

共享预览 store 持有 `content`（最近加载/已保存）、`draft`（编辑缓冲）与 `dirty`。保存是显式手势（工具栏按钮与 Mod-S），调用 inject `writeText(path, content)` → `host.writeText({ path, content })`，再 `markSaved`。标签显示 dirty 标记。超过 **1 MiB** UTF-8 的正文拒绝挂载编辑器。语言 id 由 `ui-explorer` 内 `langFromPreviewPath` 提供（不跨包依赖 tool-fs）。主题仅用 `--dsw-*` 与 `--shiki-*`。

## Alternatives considered

- **仅 Shiki 只读预览。** 零新依赖且主题已对接，但无查找/折叠/编辑/保存；因制作人要求现在即可编辑的第三方编辑器面而放弃。
- **v1 直接上 Monaco。** 符合最终目标，但 worker/CSP/Vite/jsdom 成本与包体对预览列不对称；作为同一 props 下的第二引擎推迟。
- **在已有只读 CM6 上仅翻 editable、不引入 store draft。** 切标签会丢未保存正文，dirty 也无法跨 remount；改为 store 持有 `draft`/`dirty`。

## Consequences

用户可在预览列编辑文本文件并经 Host 写盘保存。CM6 依赖只落在 `dsh-client-ui-explorer`。正在跑的 3080 `dsh web` 需重建 client bundle 后才能看到变更。仍无 CAS：并发写入后写覆盖。Monaco 尚未实现；换引擎是适配器替换，不是面板重写。
