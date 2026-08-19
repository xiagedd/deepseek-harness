# @deepseek-ai/dsh-client-ui-settings-skills

English | [中文](README.zh.md)

**Skills** settings section for the Web GUI. The browser plugin registers one localized `settings.section` contribution with id `skills` (order 15). Opening the section lazily calls `ctx.remote.skillInventory.list` / `setModelInvocable` and opens files through `ctx.workspaces.openPath`.

The page lists filesystem skills from project and user roots with name, source, path, and model visibility. The switch rewrites `disable-model-invocation` on disk. Empty, loading, and failure states stay local to the mounted component.

## Model Experience

None, as this package only visualizes and toggles Host-owned filesystem skills in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No create wizard** — adding skills remains a filesystem edit under a skill root.
- **No `user-invocable` toggle** — deferred with the Host inventory.
