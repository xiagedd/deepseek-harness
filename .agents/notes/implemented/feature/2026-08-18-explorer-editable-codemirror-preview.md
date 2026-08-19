# Agent Note: Editable CodeMirror 6 explorer preview

Status: implemented

English | [中文](2026-08-18-explorer-editable-codemirror-preview.zh.md)

## Problem

The explorer preview column showed `host.readText` bodies in a plain `<pre>`: no line numbers, no highlighting, no find/fold, and no in-page save. The product needed a maintained web text component for C# and common text files, with a path toward Monaco / VS Code–like editing later, without rewriting preview tabs or layout.

## Decision

The preview column mounts an editable **CodeMirror 6** view behind a thin **`TextPreviewEngineProps`** seam (`path`, `text`, `language`, `readOnly`, `onChange`, `onSave`). `TextPreviewBody` lazy-loads `CodeMirrorTextPreview`; panel, store, and `openFile` never import `@codemirror/*`. A later Monaco adapter replaces the lazy module only.

The shared preview store keeps `content` (last loaded/saved), `draft` (editor buffer), and `dirty`. Save is an explicit gesture (toolbar button and Mod-S) that calls inject `writeText(path, content)` → `host.writeText({ path, content })`, then `markSaved`. Tabs show a dirty mark. Bodies over **1 MiB** UTF-8 are refused before or instead of mounting the engine. Language ids come from `langFromPreviewPath` inside `ui-explorer` (not tool-fs). Theme chrome and tokens use `--dsw-*` and `--shiki-*` only.

## Alternatives considered

- **Shiki-only read-only preview.** Zero new dependencies and already themed, but no find/fold/edit/save; rejected for the producer requirement of an editable third-party editor surface now.
- **Monaco in v1.** Matches the long-term goal, but worker/CSP/Vite/jsdom cost and bundle size are disproportionate for the preview column; deferred as the second engine behind the same props.
- **Editable flag flipped on the existing CM6 read-only spike without a store draft.** Tab switches would lose unsaved text and dirty would not survive remounts; rejected in favor of store-owned `draft`/`dirty`.

## Consequences

Users edit and save text files in the preview column through the Host write path. CM6 packages land only on `dsh-client-ui-explorer`. Running `dsh web` on 3080 must rebuild the client bundle to pick up the change. There is still no CAS: concurrent writers last-write-wins. Monaco remains unimplemented; swapping engines is an adapter change, not a panel rewrite.
