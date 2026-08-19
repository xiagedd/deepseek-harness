# @deepseek-ai/dsh-host-mcp-inventory

English | [中文](README.zh.md)

Host Remote for MCP client Loader entries. `McpInventoryGateway` registers the `mcpInventory` service and publishes two generated direct Remotes: `mcpInventory/list` and `mcpInventory/setEnabled`. Every call reads `ctx.loader.entries()` directly, keeps only `@deepseek-ai/dsh-mcp-client` rows, and projects each row's Loader entry id, `serverName`, transport, effective enablement, derived connection status, and currently registered tool count under `mcp__<serverName>__*`.

`setEnabled` writes Loader `disabled` (null when enabling, `true` when disabling). The Loader disposes or restarts the entry immediately, and the owning Include tree persists the change into the profile patch that introduced the row. Non-MCP entries and unknown ids are rejected. Tool counts come from an optional `ctx.tools` read; absence of the service yields `0`.

Public payload types live under `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`. The service is Remote-only: Client packages consume it through [`api-remotes`](../../api/remotes/README.md).

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No create/edit wizard** — adding a new MCP server still means editing a cordis patch (or installing a bundle that inserts one). The Settings page only lists and toggles existing rows.
- **No User / project scope grouping** — every live Loader entry is shown in one flat list; provenance of which Include tree introduced a row is deferred.
- **Error output is not streamed** — failed fibers surface as `error` status without stderr capture.
- **Point-in-time tool counts** — disabled or disconnected servers report `0` because their tools are unregistered.
