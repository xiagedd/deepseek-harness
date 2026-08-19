# Agent Note: Explorer and CM6 preview are global across workspaces

Status: implemented

English | [中文](2026-08-18-explorer-preview-global-workspaces.zh.md)

## Problem

Opening the file tree (details) or CM6 text preview in one Session made those columns feel workspace-local: selecting another Session / workspace closed both panels before paint, and layout persist wrote the closed widths, so the next workspace looked like it lacked explorer and preview until the user reopened them by hand. Plugin registration, Host `listEntries` / `searchEntries` / `readText` / `revealPath`, and the web-app cordis row for `ui-explorer` were already account-wide — the break was the AppFrame Session-switch close, not a missing capability per cwd.

## Decision

**Semantic A — capability is global; browse state stays per workspace.** Every current Session (including blank) may open details and preview. Switching Session or workspace no longer calls `closeDetails` / `closePreview`. `ExplorerPanel` already rebinds to the new session cwd and rehydrates expand / preview-tab paths from `dsh.explorer.tree.v1` buckets keyed by cwd; Host RPCs stay path-scoped with no single-workspaceId gate. Layout geometry remains one root-scoped last-shown preference (not per-cwd). The homepage (no current Session) still derives zero rendered tracks.

This partially supersedes the Session-switch close half of the [details session-lifecycle note](../bug-fix/2026-07-29-web-details-session-lifecycle.md) and the matching sentence in [layout panel widths persist](2026-08-18-explorer-layout-persist.md). Semantic B (one shared expand/tab map across all cwds) is rejected — it would cross-contaminate trees.

## Alternatives considered

**Keep close-on-switch; tell users to reopen.** Rejected: the producer asked for the feature on every workspace, not a one-shot reopen ritual after each switch.

**Persist open/closed per workspace cwd.** Would reopen the last width when returning to a cwd, but still hide the columns on the first visit to a new workspace and adds a second geometry map. Rejected in favor of keeping one last-shown layout while never auto-closing on switch.

**Share expand/preview-tab state across workspaces (semantic B).** Rejected: two projects would fight over the same expand set and tab list.

## Consequences

- After opening explorer or preview once, switching workspaces keeps the columns open and shows that workspace's tree / tabs.
- A user close still persists as last-shown layout and survives reload.
- Stale preview bodies do not leak: the cwd effect clears the live preview store and reloads only the new bucket's paths.
- Tool-selection `openDetails` and the header Files action are unchanged.

## Testing

`packages/client/ui-layout/tests/app-frame.client.spec.tsx` asserts Session id changes keep both side tracks open. `packages/client/ui-explorer/tests/browser-plugin.client.spec.ts` asserts list/read/preview inject faces work for distinct cwd paths under one plugin registration. Run the ui-layout and ui-explorer client suites after the change.
