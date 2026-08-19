# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [root README](../../../README.md#run); the command prints its URL. This guide begins after that server is running. The `dsh` process uses its invoking directory as the default filesystem location, but a fresh Web UI has no selected workspace until you add one.

## Configure a model

Open **Settings → Models**, enter a DeepSeek API key, and save it. The model route becomes usable immediately without restarting the server.

The [model configuration guide](./providers.md) covers other providers and custom OpenAI-compatible endpoints.

## Manage MCP servers

Open **Settings → MCP** to list `@deepseek-ai/dsh-mcp-client` rows from the active profile's cordis patch, see connection status and tool counts, and enable or disable them. Toggles write Loader `disabled` immediately; add new servers by editing the profile `cordis.patch.yml`.

## Manage Skills

Open **Settings → Skills** to list filesystem skills under project `.dsh/skills` / `.agents/skills` and user `~/.dsh/skills` / `~/.agents/skills`. Toggle model visibility (rewrites `disable-model-invocation`) or open the skill file in the OS editor.

## Manage Rules

Open **Settings → Rules** to list `AGENTS.md`-compatible workspace instruction files discovered by `dsh-agent-instructions`. Open a file to edit it, or create a missing user-global / project-root `AGENTS.md`. Presence is enablement; this is not Cursor `.cursor/rules`.

## Edit workspace ignore rules

Open **Settings → Ignore** to view or create `.dshignore` at the current workspace root. The editor uses the same gitignore-style patterns as Host list/search (`*.meta`, `Library/`, `#` comments, `!` negation). If only `.cursorignore` exists, the page says so; saving creates `.dshignore`. Changes apply on the next list or search without restarting the server.

## Restart the Web server

Open **Settings → General** and click **Restart Web**. Confirm the warning: the service stops for a few seconds. The Host accepts, then runs the same `web:restart` script used from the terminal (only this repo's `dsh web` listener on the current port). The page waits until the new process answers and then reloads; if it does not, hard-refresh (Ctrl+Shift+R). The button is loopback-only. The first time this control ships, the already-running Host may not yet expose `host.restartWeb` — run `pnpm run web:restart` once in a terminal, then use the button afterwards.

## Choose a workspace

Click **Choose workspace**, add the project directory where you started `dsh`, and select it. The session composer remains unavailable until a workspace is selected.

## Run a task

Start a session and send:

> Summarize this repository and identify its main packages.

The agent can read and edit workspace files, run commands, delegate work, and maintain a plan. The Web UI asks before operations that require approval under the active permission policy.

## Composer vs Cursor

The Web UI has no Cursor Ask / Agent mode switch, no Inline Edit (Ctrl+K), and no Tab completion.

| Cursor | dsh Web |
|---|---|
| Ask (read-only chat) | The composer Access chip. A pick submits `/permission <preset>`. That is a sandbox+approval bundle from the host `permissions` projection, not an Ask mode. Default names are `workspace-write` (Workspace Write) and `danger-full-access` (Full access). A `read-only` option appears only when the host table includes it. |
| Plan mode | `/plan`, or Plan in the `+` Command menu. While it is on, a Plan chip shows; `/plan off` or the chip turns it off. Plan mode is soft guidance, not a Cursor Plan-mode clone and not a read-only sandbox. |
| Agent / Edit (change files) | The current conversation. The agent uses filesystem tools; the Web UI asks before operations that need approval under the active permission policy. There is no Ctrl+K inline edit. |
| Skills | `/` then pick a skill, or type `/name`. A pick inserts the literal `/name `. A name that is also a host command still resolves as the command. |
| `@file` | Type `@` then pick a workspace file or folder (source `workspace-file`). Inserts a path chip; the model receives the absolute path literal (not file bytes). Running subagent children share the same `@` menu under a separate group. |

The composer does not provide an in-page editor, split edit, Ctrl+P, debug, an extension marketplace, an embedded browser, a full Git panel, or an IDE PTY.

Package references: [session composer](../../../packages/client/ui-conversation/README.md), [permission presets](../../../packages/client/ui-permission-presets/README.md), [plan chip](../../../packages/client/ui-plan/README.md), [slash commands](../../../packages/client/ui-commands/README.md), [skill](../../../packages/client/ui-skill/README.md), [subagent `@`](../../../packages/client/ui-subagent/README.md).

## Continue

- [Configure models](./providers.md)
- [Use the Python SDK](./python-sdk.md)
- [Use other CLI modes](../../../apps/cli/README.md)
- [Develop a plugin](../develop/basic/)
