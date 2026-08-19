# @deepseek-ai/dsh-client-ui-settings-rules

English | [中文](README.zh.md)

**Rules** settings section for the Web GUI. The browser plugin registers one localized `settings.section` contribution with id `rules` (order 16). Opening the section lazily calls `ctx.remote.rulesInventory.list` / `create` and opens files through `ctx.workspaces.openPath`.

The page lists AGENTS.md-compatible instruction files with display path, absolute path, and user-global vs project scope. Create buttons write a starter `AGENTS.md` when the user-global or project-root file is missing. There is no enable switch — presence is authority.

## Model Experience

None, as this package only visualizes Host-owned instruction files in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No inline editor** — content edits happen in the OS-opened file.
- **No per-file disable toggle** — remove or empty the file instead.
