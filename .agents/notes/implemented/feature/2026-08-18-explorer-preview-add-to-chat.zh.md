# Agent Note: 预览 Mod-L 将选区引用插入聊天

Status: implemented

[English](2026-08-18-explorer-preview-add-to-chat.md) | 中文

## 问题

用户在资源管理器预览列编辑文件时，没有类似 Cursor 的快捷键，把当前选区（或整文件）作为 workspace-file 芯片插入 composer。树侧已有右键「引用到聊天」整路径能力；预览列没有。

## 决策

在 CodeMirror 文本预览引擎拥有焦点时绑定 **Mod-L**（Ctrl/Cmd+L），并设 `preventDefault: true`，避免浏览器抢走地址栏焦点。引擎只通过 `TextPreviewEngineProps.onAddToChat` 上报闭区间 1-based 行号（光标无选区时为 `null`）。`FilePreviewPanel` 把该回调接到与树相同的 inject 助手——`insertWorkspaceReference(sessionId, path, lines?)`——组装一条 `ReferenceInsert`（`source: 'workspace-file'`）并调用 `ctx.conversation.input.for(...).insertReference`。行范围同时后缀到 `label`、`clipboardText` 与 codec `ref`（如 `Assets/Npc.cs:120-146` / 同后缀的绝对路径）；不上传选中正文，与 `@` workspace-file 策略一致。工具栏可见按钮（「引用到聊天」+ Ctrl/Cmd+L 提示）与右键 portal `Menu`（「引用到聊天」）都经可变的 `addToChatApiRef` 走同一引擎路径——不另造芯片构建。无会话 / 插入被拒返回 `false` 并显示既有失败文案；预览不抛错。

## 考虑过的替代

- **注册全局键盘服务快捷键。** 否决：快捷键只应在预览编辑器聚焦时生效，且 CM6 已拥有该焦点 keymap（与 Mod-S 同模式）。
- **把 `ctx.conversation` 塞进 CM6 组件。** 否决：违反 client AGENTS.md（组件不见 ctx）；由 preview 座位的 inject 回调拥有插入。
- **把选中正文塞进芯片 / 草稿。** 否决：违背 workspace-file「仅路径字面量」的模型体验。

## 后果

- 预览 Mod-L 与树菜单共用 `ui-explorer` apply 中的同一插入实现。
- 无选区退化为整文件芯片（等同 addToChat）。
- Mod-S 保存仍是独立 keymap 项，不受影响。
- Codec `serialize` 仍原样返回 `ref`，模型看到 `path:N-M` 字面量。
