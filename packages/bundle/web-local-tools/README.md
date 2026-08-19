# `@deepseek-ai/dsh-web-local-tools`

English | [中文](README.zh.md)

Optional Web overlay bundle: [`cordis.patch.yml`](cordis.patch.yml) inserts the Settings MCP / Skills / Rules / Ignore pages and the Host inventory Remotes they call. The profile composer resolves the patch through the `dsh.bundle.patch` manifest field. The package has no runtime API.

This overlay is the installable copy of this round's **new plugin packages**. It does not extract explorer CodeMirror preview, layout persistence, composer chip jumps, or `host.searchEntries` / `host.revealPath` / `host.restartWeb`; those remain edits inside core packages. The classification and the reason the core half cannot ship as this overlay live in the [overlay Agent Note](../../../.agents/notes/implemented/architecture/2026-08-18-web-local-tools-overlay-bundle.md).

The in-box [`dsh-web-app`](../web-app/README.md) in this repository already inserts the same row ids. Hang **either** that in-box web-app **or** this overlay, never both: `applyEntryPatches` appends duplicate ids, and Settings slot registration fails loud.

## What this overlay mounts

| Row id | Package | Role |
|---|---|---|
| `mcp-inventory` | `@deepseek-ai/dsh-host-mcp-inventory` | Host Remote: list/enable MCP client Loader rows |
| `skill-inventory` | `@deepseek-ai/dsh-host-skill-inventory` | Host Remote: list filesystem skills and toggle model invocation |
| `rules-inventory` | `@deepseek-ai/dsh-host-rules-inventory` | Host Remote: list/create AGENTS.md-compatible rules |
| `ui-settings-mcp` | `@deepseek-ai/dsh-client-ui-settings-mcp` | Settings MCP page |
| `ui-settings-skills` | `@deepseek-ai/dsh-client-ui-settings-skills` | Settings Skills page |
| `ui-settings-rules` | `@deepseek-ai/dsh-client-ui-settings-rules` | Settings Rules page |
| `ui-settings-ignore` | `@deepseek-ai/dsh-client-ui-settings-ignore` | Settings `.dshignore` editor (`host.readText` / `host.writeText`; no extra Host inventory) |

Every client package named here must appear in a **using app or bundle `package.json` `dependencies`**. This overlay's manifest lists them so `healProfilesModuleFallback` can symlink them into `$DSH_HOME/profiles/node_modules`. A YAML-only insert without that dependency row leaves the browser roster unable to resolve `/plugins/<id>/client.js`, and the Settings sidebar stays empty with no load error.

## Prerequisites (core packages this overlay does not ship)

The consuming web profile must already run a checkout that contains this round's core edits. Without them, explorer preview/search/reveal, layout persistence, composer chip jumps, and Settings → Restart Web do not appear, even after this overlay loads.

Required core packages (this repository's current trees; there is no separate overlay commit range):

- `@deepseek-ai/dsh-client-ui-explorer` — CodeMirror 6 preview, workspace search, ignore-filter display, three-state folder glyphs, reveal-in-file-manager, double-click OS open, Ctrl+L add-to-chat, browse persistence, search overlay, global workspaces
- `@deepseek-ai/dsh-client-ui-layout` — details/preview panel persistence; switching session does not close those panels
- `@deepseek-ai/dsh-client-ui-conversation` — composer chip cell metrics, click-to-reveal, line jump
- `@deepseek-ai/dsh-client-ui-settings-general` — Restart Web control
- `@deepseek-ai/dsh-host-apiproxy` — `host.searchEntries`, workspace-ignore, `host.revealPath`, `host.restartWeb`
- `@deepseek-ai/dsh-client-connection` and `@deepseek-ai/dsh-api-remotes` — generated/client faces that expose those Host methods
- `@deepseek-ai/dsh-native-command` — no-shell runner used by explorer reveal

`pnpm run web:restart` and `scripts/restart-dsh-web.*` stay at the repository root; they are not this overlay's payload.

A Host process that predates those RPC methods 404s them until that Node process is restarted. A Client-only rebuild needs a hard refresh (`Ctrl+Shift+R`); it does not pick up Host methods.

## Install

Use this overlay only when the target profile's `dsh-web-app` patch **does not** already insert the row ids above.

1. Consume this package from a checkout that contains the seven workspace packages (this monorepo). `workspace:^` does not resolve from an unrelated npm install.
2. Add the overlay to the profile: `dsh plugin --profile <name> add <absolute-path-to-packages/bundle/web-local-tools>`. That writes the profile `package.json` dependency **and** appends `@deepseek-ai/dsh-web-local-tools` to `dsh.profile.bundles`. If pnpm rejects the `workspace:` protocol from outside this workspace, add the same seven packages as `file:` dependencies on the **using app or an already-mounted bundle** (this overlay's `package.json` is the list), then add `@deepseek-ai/dsh-web-local-tools` to `dsh.profile.bundles` by hand.
3. Restart Host (`pnpm run web:restart` from this checkout, or the equivalent for that install). Hard-refresh the browser.

Do not copy half the monorepo. The overlay is the patch layer; heal resolves the named plugins from the installation or profile `node_modules`.

## Colleague checklist

1. Confirm the core packages in Prerequisites are already on their dsh (this repository's current trees).
2. If their in-box `dsh-web-app` already inserts `mcp-inventory` / `ui-settings-mcp` (this repository): stop; they already have the Settings pages. Do not add this overlay.
3. Otherwise: `dsh plugin --profile web add <path-to-this-package>` (or the two-file edit in Install step 2).
4. Restart Host once, then hard-refresh the browser.

## Model Experience

Indirectly, through the inserted Settings inventory rows: each mounted package owns its model-facing behavior, and this bundle contributes none of its own.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Mutually exclusive with in-box `dsh-web-app` rows of the same ids** — hanging both appends duplicate Loader entries; Settings slot registration fails loud.
- **Does not ship explorer/layout/conversation/apiproxy edits** — those remain core-package changes; this overlay cannot provide CodeMirror 6 or the new Host RPCs by itself.
- **Client packages must be bundle/app dependencies** — a YAML-only hang leaves `healProfilesModuleFallback` without a symlink, and the Settings sidebar stays empty.
