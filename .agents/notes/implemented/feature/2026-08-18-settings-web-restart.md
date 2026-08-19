# Agent Note: Settings Restart Web control

Status: implemented

English | [中文](2026-08-18-settings-web-restart.zh.md)

## Problem

The restart script (`pnpm run web:restart`) exists, but operators still have to leave the UI, open a terminal, and paste the command. The producer asked for a Settings-panel button that runs that tool.

## Decision

Ship a loopback-only **Restart Web** row on Settings → General (`ui-settings-general`, id `restart-web`, order 90) that calls Host RPC `host.restartWeb`.

1. **Narrow RPC** — payload is `{ port?: number }` with a strict schema. Extra keys (`command`, `argv`, …) are `bad-request`. An omitted port uses the live `webServer` listen port, else 3080. The Host never forwards arbitrary argv.
2. **Spawn** — after confirming `scripts/restart-dsh-web.mjs` exists under the host cwd, the method returns `{ accepted, port }` and then schedules a detached spawn of that script with only `--port <n>` so the HTTP response can flush. Kill safety stays in the script (CommandLine-confirmed `dsh` / `web` / `--port` only). A missing script is `internal` with the path.
3. **UI** — RiskConfirmation warns that the service will drop for several seconds. After accept, the page polls `GET /` until 2xx or 45s, then reloads. Timeout and Host errors render in the row. Remote browsers never register the row. `host.restartWeb` is in the connection privileged set (loopback-only).
4. **First load** — the button lives in the already-loaded `ui-settings-general` client bundle, so a rebuilt bundle plus hard refresh can show it. The Host method exists only after the Node process that registered it is running. An older 3080 process 404s the RPC until one manual `pnpm run web:restart` (or equivalent) loads it; afterwards the button works.

## Alternatives considered

- **Arbitrary command runner in Settings** — rejected: the browser must not spawn shell. The Host exposes one verb that can only launch the repo restart script.
- **Block the RPC until the new process is healthy** — rejected: the current process dies during restart, so the in-flight HTTP call cannot wait. Accept-then-spawn plus client-side health wait is the only ordering that can flush a response.
- **Put the control on a new Settings section or the sidebar footer** — rejected: General already owns ownerless chrome, and the producer screenshot sits on that page beside Open configuration file.

## Consequences

Operators with a loopback tab can restart Host from Settings after one process that includes `host.restartWeb` is running. Remote tabs never get the control. Tests inject spawn and must not kill port 3080.
