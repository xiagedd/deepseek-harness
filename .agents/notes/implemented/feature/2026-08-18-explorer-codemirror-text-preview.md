# Agent Note: Explorer CodeMirror text-preview engine

Status: implemented

English | [中文](2026-08-18-explorer-codemirror-text-preview.zh.md)

## Problem

The explorer preview column rendered `host.readText` bodies in a bare `<pre>`: no line numbers, no syntax highlighting, and no editor-grade find. Product needs friendlier read-only viewing for C# and common text files, while the end state must remain Monaco / VS Code-like. Wiring CodeMirror APIs into `FilePreviewPanel` would block that swap and scatter editor concerns through business UI.

## Decision

**v1 mounts CodeMirror 6 only behind a text-preview engine seam.** `TextPreviewEngineProps` (`path`, `text`, `language`, `readOnly: true`) is the React contract. `TextPreviewBody` chooses oversized fallback vs a lazy-loaded engine and never imports `@codemirror/*`. `CodeMirrorTextPreview` is the sole CM6 adapter (line numbers, language modes including csharp via legacy-modes, search, `--dsw-*` / `--shiki-*` theme). `FilePreviewPanel` keeps tabs / loading / error and replaces only the ready-body `<pre>`.

**Client size ceiling is 1 MiB UTF-8.** Oversized ready bodies show `preview.tooLarge` and do not mount the engine. Binary / non-UTF-8 failures stay store errors.

**Endgame is Monaco behind the same seam.** Swapping means a new adapter + lazy import + dependency change; store actions and multi-tab behavior stay put. Editable save remains out of scope for v1.

## Alternatives considered

**Shiki-only read view (reuse ui-primitives highlighter).** Rejected for v1 because product asked for third-party editor-grade operations (find, gutters) and a path that can grow toward Monaco; Shiki remains available for chat cards.

**Monaco in v1.** Rejected for worker / Vite / CSP / bundle cost on a read-only preview column; the seam exists so Monaco can land without rewriting the panel.

**Hand-rolled gutter + highlight + find.** Rejected under the maintained-dependencies policy; net owned code would rise.

**Editable preview in the same change.** Rejected; v1 stays read-only with no `host.writeText` from the preview column.

## Consequences

`@deepseek-ai/dsh-client-ui-explorer` depends on `@codemirror/*` packages; the CM6 chunk loads on first rich preview. Preview copy documents the 1 MiB limit and the Monaco migration seam. GUI tests cover language routing, oversized fallback, read-only engine attributes, and a mocked EditorView lifecycle. A parallel editable-preview attempt (dirty drafts / `host.writeText` save from the preview column) was rejected for v1 per producer lock; only the oversized pre-check in `ExplorerPanel.openFile` was kept from that conflict.
