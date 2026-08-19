# @deepseek-ai/dsh-client-ui-settings-ignore

English | [中文](README.zh.md)

**Ignore** settings section for the Web GUI. The browser plugin registers one localized `settings.section` contribution with id `ignore` (order 19, beside MCP) into the Settings shell owned by [`ui-settings`](../ui-settings/README.md). Opening the section resolves the current workspace root (active session `cwd`, else the recent workspace path) and loads that root's `.dshignore` through existing `host.readText`. Save writes the same absolute path through `host.writeText`.

When `.dshignore` is missing, the editor stays empty and states that save will create it. When only `.cursorignore` exists, the page shows a compatibility hint; Host list/search already prefer `.dshignore` and fall back to `.cursorignore`, and both re-read on the next request (search also invalidates its index on `writeText`), so no Host restart is required.

## Model Experience

None, as this package only edits a workspace ignore file from browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No visual rule builder** — the page is a multiline text editor, not a per-line GUI matrix.
- **One root at a time** — the editor targets the current session or recent workspace only; multi-root pickers are deferred.
