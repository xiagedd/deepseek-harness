# @deepseek-ai/dsh-host-rules-inventory

English | [中文](README.zh.md)

Host Remote for workspace instruction files (product "Rules"). `RulesInventoryGateway` registers the `rulesInventory` service and publishes `rulesInventory/list` and `rulesInventory/create`. Listing uses `@deepseek-ai/dsh-agent-instructions` discovery: `$DSH_HOME/AGENTS.md` plus every existing `AGENTS.md` / `CLAUDE.md` (and local overlays) from the project root to the supplied cwd. There is no per-file enable flag — presence is the authority; editing is opening the file on disk.

`create` writes a starter `AGENTS.md` at user-global (`$DSH_HOME`) or project-root scope when missing. Cursor-style `.cursor/rules` trees are not part of this product mechanism.

Public payload types live under `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No inline editor** — Settings opens the file via the OS handoff; content editing stays in the user's editor.
- **No enable toggle** — deleting or emptying a file is the disable path; this Remote does not rename candidates away.
- **Web may disable `agent-instructions`** — files remain authoritative for compositions that load the plugin; the inventory still lists and creates them.
