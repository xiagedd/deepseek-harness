# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

**MCP** settings section for the Web GUI. The browser plugin registers one localized `settings.section` contribution with id `mcp` (order 18) into the Settings shell owned by [`ui-settings`](../ui-settings/README.md). It performs no Remote read during plugin activation. Opening the section mounts it and lazily calls `ctx.remote.mcpInventory.list()` / `setEnabled` through [`api-remotes`](../../api/remotes/README.md).

The page lists every configured `@deepseek-ai/dsh-mcp-client` Loader entry with its server name, derived connection status, transport, and current tool count. A switch writes enablement through the Host Remote; Loader restart or dispose takes effect immediately and the owning profile patch persists the `disabled` flag. Empty, loading, and generic failure states stay local to the mounted component.

## Model Experience

None, as this package only visualizes and toggles Host-owned MCP Loader entries in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No New MCP wizard** — creating servers remains a cordis-patch edit; see the Host package limitations.
- **No User / project scope grouping** — deferred with the Host inventory.
- **No expandable error output** — failed status is shown without stderr.
