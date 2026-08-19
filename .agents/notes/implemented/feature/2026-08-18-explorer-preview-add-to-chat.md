# Agent Note: Preview Mod-L insert selection into chat

Status: implemented

English | [中文](2026-08-18-explorer-preview-add-to-chat.zh.md)

## Problem

Users editing a file in the explorer preview column had no Cursor-like shortcut to drop the current selection (or the whole file) into the composer as a workspace-file chip. The tree already offered right-click "引用到聊天" for whole paths; the preview column did not.

## Decision

Bind **Mod-L** (Ctrl/Cmd+L) inside the CodeMirror text-preview engine when it owns focus, with `preventDefault: true` so the browser address bar does not steal the chord. The engine only reports an inclusive 1-based line range (or `null` for a caret-only selection) through the `onAddToChat` prop on `TextPreviewEngineProps`. `FilePreviewPanel` wires that callback to the same inject helper the tree uses — `insertWorkspaceReference(sessionId, path, lines?)` — which builds one `ReferenceInsert` (`source: 'workspace-file'`) and calls `ctx.conversation.input.for(...).insertReference`. Line ranges suffix `label`, `clipboardText`, and codec `ref` alike (`Assets/Npc.cs:120-146` / absolute path with the same suffix); selected body text is never uploaded, matching the `@` workspace-file codec. A visible toolbar button ("引用到聊天" + Ctrl/Cmd+L hint) and a portaled right-click `Menu` ("引用到聊天") both invoke the same engine path via a mutable `addToChatApiRef` handle — never a second chip builder. Missing session / refused insert returns `false` and shows the existing failure status copy; the preview does not throw.

## Alternatives considered

- **Register a global keyboard service chord.** Rejected: the shortcut must only fire while the preview editor is focused, and CM6 already owns that focus keymap (same pattern as Mod-S).
- **Pass `ctx.conversation` into the CM6 component.** Rejected under client AGENTS.md: components never see ctx; inject callbacks on the preview seat own the insert.
- **Upload selected body into the chip / draft.** Rejected: contradicts the workspace-file "path literal only" model experience.

## Consequences

- Preview Mod-L and the tree menu share one insert implementation in `ui-explorer` apply.
- Empty selection degrades to a whole-file chip (same as addToChat).
- Mod-S save remains a separate keymap entry and is unaffected.
- Codec `serialize` still returns the `ref` string unchanged, so models see `path:N-M` literals.
