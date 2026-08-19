# Agent Note: Web local-tools overlay bundle

Status: implemented

English | [中文](2026-08-18-web-local-tools-overlay-bundle.zh.md)

## Problem

This round's Web local extensions mix two kinds of change: edits inside already-shipped core packages (`ui-explorer`, `ui-layout`, `ui-conversation`, `ui-settings-general`, `apiproxy`, `connection`, `remotes`, `native-command`) and new standalone plugins (Settings MCP/Skills/Rules/Ignore plus Host inventories). The producer needs a unit other people can install. Copying half the monorepo, or moving core code out of `dsh-web-app`, would either fail to boot a stock web profile or silently drop explorer/layout behavior that the in-box web-app already mounts.

## Decision

Ship `@deepseek-ai/dsh-web-local-tools` at [`packages/bundle/web-local-tools`](../../../../packages/bundle/web-local-tools/README.md) as an **optional overlay bundle**. Its `cordis.patch.yml` inserts only the new plugin rows. Its `package.json` `dependencies` list those same packages so `healProfilesModuleFallback` can symlink them into `$DSH_HOME/profiles/node_modules`.

The in-box [`dsh-web-app`](../../../../packages/bundle/web-app/README.md) keeps the identical row ids so the default web profile in this repository continues to boot without this overlay. Consumers hang **either** current in-box web-app **or** this overlay, never both: `applyEntryPatches` appends an untargeted `insert` onto the composed list, so duplicate ids become two Loader entries and Settings slot registration fails loud.

### Class A — already in core packages (not this overlay)

These need this repository's current trees of the named packages. They cannot ship as the overlay without extracting those packages.

| Area | Package | What this round added |
|---|---|---|
| Explorer | `@deepseek-ai/dsh-client-ui-explorer` | CodeMirror 6 preview, workspace search, ignore-filter display, three-state folder glyphs, reveal-in-file-manager, double-click OS open, Ctrl+L add-to-chat, browse persistence, search overlay, global workspaces |
| Layout | `@deepseek-ai/dsh-client-ui-layout` | details/preview panel persistence; switching session does not close those panels |
| Conversation | `@deepseek-ai/dsh-client-ui-conversation` | composer chip cell metrics, click-to-reveal, line jump |
| Settings General | `@deepseek-ai/dsh-client-ui-settings-general` | Restart Web control |
| Host API | `@deepseek-ai/dsh-host-apiproxy` | `host.searchEntries`, workspace-ignore, `host.revealPath`, `host.restartWeb` |
| Wire | `@deepseek-ai/dsh-client-connection`, `@deepseek-ai/dsh-api-remotes` | client/generated faces for those Host methods |
| Native runner | `@deepseek-ai/dsh-native-command` | no-shell runner used by explorer reveal |
| Scripts | repository root | `pnpm run web:restart`, `scripts/restart-dsh-web.*` |

Owning feature notes: [CodeMirror preview](../feature/2026-08-18-explorer-codemirror-text-preview.md), [editable preview](../feature/2026-08-18-explorer-editable-codemirror-preview.md), [theme settings](../feature/2026-08-18-explorer-preview-editor-theme-settings.md), [workspace ignore and search](../feature/2026-08-18-explorer-workspace-ignore-and-search.md), [three-state folder glyph](../feature/2026-08-18-explorer-three-state-folder-glyph.md), [reveal in file manager](../feature/2026-08-18-explorer-reveal-in-file-manager.md), [double-click OS open](../feature/2026-08-18-explorer-code-file-double-click-os-open.md), [preview add to chat](../feature/2026-08-18-explorer-preview-add-to-chat.md), [browse persist](../feature/2026-08-18-explorer-browse-persist.md), [layout persist](../feature/2026-08-18-explorer-layout-persist.md), [global workspaces](../feature/2026-08-18-explorer-preview-global-workspaces.md), [chip reveal and line jump](../feature/2026-08-18-composer-chip-reveal-and-line-jump.md), [Restart Web](../feature/2026-08-18-settings-web-restart.md), [restart self-proof](../process/2026-08-18-dsh-web-restart-self-proof.md).

### Class B — new standalone packages (this overlay)

| Role | Package |
|---|---|
| Host MCP inventory | `@deepseek-ai/dsh-host-mcp-inventory` |
| Host skill inventory | `@deepseek-ai/dsh-host-skill-inventory` |
| Host rules inventory | `@deepseek-ai/dsh-host-rules-inventory` |
| Settings MCP | `@deepseek-ai/dsh-client-ui-settings-mcp` |
| Settings Skills | `@deepseek-ai/dsh-client-ui-settings-skills` |
| Settings Rules | `@deepseek-ai/dsh-client-ui-settings-rules` |
| Settings Ignore | `@deepseek-ai/dsh-client-ui-settings-ignore` |
| Overlay bundle | `@deepseek-ai/dsh-web-local-tools` |

Ignore editing reuses `host.readText` / `host.writeText`; it has no extra Host inventory. Owning notes: [MCP inventory](../feature/2026-08-18-settings-mcp-inventory.md), [Skills and Rules](../feature/2026-08-18-settings-skills-rules-inventory.md), [Ignore editor](../feature/2026-08-18-settings-ignore-editor.md).

`PROFILE_TEMPLATES.web` stays `dsh-base` + `dsh-web-app`. Adding this overlay to the shipped web template would duplicate Class B rows on this repository's default profile.

## Alternatives considered

**Move the new Settings rows out of `dsh-web-app` and put only this overlay in `PROFILE_TEMPLATES.web`.** Rejected: the producer’s running web profile already composes those rows from in-box web-app. Removing them without a coordinated profile-template + Host restart would drop Settings pages on the next boot.

**Extract explorer/layout/conversation/apiproxy into this overlay.** Rejected: those packages are already mounted by in-box web-app; splitting them would be a large refactor and would take CodeMirror 6 and the new Host RPCs off a stock web profile that does not hang the overlay.

**Hand people a copy of half the monorepo.** Rejected: the product form for third-party install is a bundle patch layer (`dsh plugin --profile <name> add` / `dsh.profile.bundles`), not a second checkout of `packages/client` and `packages/host`.

**Make the overlay insert idempotent (skip ids that already exist).** Rejected: `applyEntryPatches` has no skip-if-present insert. Encoding that in YAML would be a Loader change; documenting mutual exclusion is the current contract.

## Consequences

People on this repository's current `dsh-web-app` already have Class A and Class B; they must not also hang the overlay. People whose web-app patch lacks the Class B ids can hang this overlay after their checkout already contains the Class A core edits. A YAML-only hang without listing the client packages on an app or bundle `dependencies` leaves Settings pages missing with no load error. Host RPC additions still require a Host restart; Client-only rebuilds need a hard refresh.
