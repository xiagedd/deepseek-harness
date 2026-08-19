# Agent Note: Web Settings workspace .dshignore editor

Status: implemented

English | [中文](2026-08-18-settings-ignore-editor.zh.md)

## Problem

Explorer list/search already honor workspace-root `.dshignore` (preferred) or `.cursorignore`, but users had to locate and edit those files by hand. After asking where ignore rules live, the product need is a Settings entry that opens the current workspace's product ignore file without hunting the filesystem.

## Decision

1. **Client package** — `@deepseek-ai/dsh-client-ui-settings-ignore` registers `settings.section` id `ignore` (order 19, beside MCP) via `slots.inject`, matching Models / Plugins / MCP.
2. **No new Host RPC** — reuse `host.readText` / `host.writeText` against the fixed workspace-root path `.dshignore`. Host already re-reads ignore bodies on each list/search and invalidates search indexes on `writeText`, so saves apply without restarting the Host process.
3. **Root resolution** — prefer the current session `cwd`, else `workspaces.recentWorkspaceId` path, else the first registered workspace; absent any root, show an empty-state prompt.
4. **Cursor compat** — when `.dshignore` is missing but `.cursorignore` exists, keep the editor empty and show a compatibility hint; save always creates `.dshignore` (Host priority then prefers it).

## Alternatives considered

- **Dedicated `readWorkspaceIgnore` / `writeWorkspaceIgnore` Host methods** — rejected for MVP: path policy and missing-file semantics fit the existing text IO plus a thin client helper; a specialized Remote can wait for multi-root or schema needs.
- **Fold into `ui-settings-mcp` or explorer** — rejected: ignore editing is a separate Settings page and must not widen explorer's contribution surface.
- **Visual per-line rule builder** — deferred: the request is an editable text file, not a GUI matrix.

## Consequences

- Settings nav gains **忽略规则** / **Ignore**.
- Saving creates or updates only `.dshignore`; `.cursorignore` remains a read-compat fallback until a `.dshignore` exists.
- Users still need a selected workspace; the page does not invent a root.

## Required verification

- Pure helper vitest: join paths; resolve root; read existing / missing / cursor-only.
- Component vitest: no-workspace, load+save update, create missing, cursor hint + save failure.
- Browser plugin vitest: section id/order/label; lazy Host read; write payload.
- Client bundle: no `.cjs` shards; `require("./` count is 0.
