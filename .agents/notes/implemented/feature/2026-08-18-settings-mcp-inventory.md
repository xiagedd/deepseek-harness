# Agent Note: Web Settings MCP inventory page

Status: implemented

English | [中文](2026-08-18-settings-mcp-inventory.zh.md)

## Problem

Users install MCP servers as `@deepseek-ai/dsh-mcp-client` Loader rows in a profile `cordis.patch.yml`, but Web Settings had no page to list them or flip their Loader `disabled` flag. The only views were the general plugin inventory (read-only, all plugins) or editing YAML by hand.

## Decision

Ship a dedicated Host Remote and Settings section:

1. **Authority** — profile Include trees remain the store. `mcpInventory.setEnabled` calls `ctx.loader.update(id, { disabled: null | true })`, which restarts or disposes the entry and persists through the owning Include write-back. `~/.dsh/settings.yaml` is unrelated (LLM / preference namespaces only).
2. **Host** — `@deepseek-ai/dsh-host-mcp-inventory` filters Loader entries to `@deepseek-ai/dsh-mcp-client`, projects `serverName`, transport, enablement, derived connection status, and current `mcp__<serverName>__*` tool counts.
3. **Client** — `@deepseek-ai/dsh-client-ui-settings-mcp` registers `settings.section` id `mcp` (order 18) via the same `slots.inject` path as Models / Plugins / Agent presets.
4. **Immediate effect** — Loader update is the activation path; the UI states that toggles take effect immediately without a Host restart.

## Alternatives considered

- **Extend read-only `pluginInventory` with mutation** — rejected: that service's contract is a point-in-time projection with no mutation path; MCP needs a narrower allowlist and MCP-specific fields.
- **Store enablement in `settings.yaml`** — rejected: it would not control whether `ctx.tools` sees MCP tools; Loader `disabled` is the existing mechanism.
- **Full Cursor-like marketplace / New MCP wizard** — deferred: no create API exists; users still insert cordis patch rows.

## Consequences

- Settings nav gains an MCP row; empty state explains the cordis-patch install path.
- Toggling writes the profile patch and unloads or reconnects tools for new agent turns.
- Deferred: New MCP wizard, User/project scope grouping, expandable error/stderr.

## Required verification

- Host unit: list filters to mcp-client; setEnabled persists disabled; non-MCP ids rejected.
- Client vitest: section registration, list render, toggle write-back, empty state.
- Client bundle: no `.cjs` shards; `require("./` count is 0.
