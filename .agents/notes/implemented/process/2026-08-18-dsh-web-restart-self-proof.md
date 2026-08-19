# Agent Note: dsh web restart self-proof

Status: implemented

English | [中文](2026-08-18-dsh-web-restart-self-proof.zh.md)

## Problem

Operators repeatedly "restart" `dsh web` by starting a second process while the old listener still owns the port. The new start fails with `EADDRINUSE`, the old PID keeps serving stale Host code, and a browser refresh is mistaken for a host restart. The workflow needs one command that kills only confirmed `dsh web` listeners, refuses unrelated Node processes, waits for a free port, starts a new server, and prints self-proof that fails loudly on any step.

## Decision

`pnpm run web:restart` runs [`scripts/restart-dsh-web.mjs`](../../../../scripts/restart-dsh-web.mjs). On Windows it delegates to [`scripts/restart-dsh-web.ps1`](../../../../scripts/restart-dsh-web.ps1); on macOS/Linux it uses `lsof`/`ps`/`kill` with the same confirmation rules.

Kill safety requires both a LISTENING owner of `--port <n>` and a CommandLine that matches this repo's launch (`bin.ts` + `web` + `--port <n>`, or an equivalent `dsh`/`tsx` web launch with that port). Unmatched listeners are never killed; the script exits non-zero and prints their PID and CommandLine. A matching corepack/pnpm parent may be stopped with its confirmed child. After stop, the script polls until the port is free (default 10s) before starting `node --import tsx/esm apps/cli/src/bin.ts web --port <n>`. Success requires LISTENING plus HTTP 200 on `http://127.0.0.1:<port>/`, then prints PID, CreationDate (Windows), and CommandLine. Default mode detaches and appends `.dsh-web-<port>.log` / `.dsh-web-<port>.err.log` at the repo root; `--foreground` keeps the server in the terminal. `--no-kill`, `--timeout`, `--skip-start`, and `--dry-run` support safe starts and dry validation.

Contributor guidance distinguishing host restart from browser hard refresh lives in the development guide ([English](../../../../docs/development.md#restarting-dsh-web-vs-refreshing-the-browser) / [中文](../../../../docs/development.zh.md#重启-dsh-web-与刷新浏览器)). After a Host that already loaded `host.restartWeb` is running, Settings → General → Restart Web calls the same script ([feature note](../feature/2026-08-18-settings-web-restart.md)).

## Verification

PowerShell and Node dry-run parse options without touching port 3080. A temporary high-port Node HTTP listener exercises find → confirmed kill → port-free wait with `--skip-start`, then is cleaned up. Unrelated listeners that lack the CommandLine markers must remain unkilled and fail the script when they alone occupy the port.

## Alternatives considered

**Document-only restart checklist.** Operators still invent ad-hoc kill/start sequences that leave stale listeners.

**Kill every LISTENING PID on the port.** Faster, but would terminate unrelated Node projects sharing the machine.

**Windows-only script without a Node entry.** Sufficient for one workstation, but the npm script and Unix path keep the same command for other contributors.

## Consequences

Host restarts become one fail-loud command with printed self-proof. Browser refresh remains a separate Client concern. Background logs accumulate under ignored `.dsh-web-*.log` names at the repo root. The script never treats HTTP 200 from a still-old process as success after a failed kill: port-free wait runs before start, and CreationDate/CommandLine let the operator compare against their edit time.
