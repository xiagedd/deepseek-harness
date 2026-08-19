# Agent Note: Persist explorer expand and preview tabs in localStorage

Status: implemented

English | [中文](2026-08-18-explorer-browse-persist.zh.md)

## Problem

A hard reload of the web GUI reset the explorer: every folder collapsed, and open preview tabs disappeared. Users who had walked deep into a workspace had to re-expand and re-open files after every refresh. Column widths and unsaved editor drafts are separate concerns; the gap here is browse state that should survive a page load in the same browser origin.

## Decision

Add a root-scoped `createExplorerTreeStore` with `persist: 'dsh.explorer.tree.v1'`. State is `{ byWorkspace: Record<cwd, { expanded, previewPaths, activePath }> }` — one localStorage key, buckets keyed by session cwd inside the payload (the same pattern as `dsh.workspace.view.v5`), never a session `scopeKey` suffix and never Host settings. Apply creates one instance with `.create()` (no scope key) and injects read/write callbacks into the explorer and preview seats; the live preview store stays unpersisted so draft/dirty/body never hit disk.

On cwd change, `ExplorerPanel` reads the bucket, expands `hydratedExpandedPaths`, and `listEntries` each path (`dropOnError` for non-root so deleted folders vanish quietly). Saved preview paths call `showLoading` + `readText`; failures `close` the tab without an error toast. `retainAccountKeys` keeps only known workspace paths. Breaking shape changes bump the key to `.vN` with no migration.

## Alternatives considered

**Put browse state in Host settings.** Rejected in [host-backed web preferences](2026-08-06-host-backed-web-preferences.md): disclosure and navigation are browser-instance state, not user-level product preferences.

**Register the tree store on the session-scoped explorer seat.** Would suffix the persist key with the session id and isolate the same cwd across sessions; rejected in favor of cwd buckets under one root key.

**Persist the full `FilePreviewState` (including draft).** Would rehydrate unsaved buffers that can disagree with disk; rejected — only paths + activePath, then reload from `host.readText`.

**Persist layout column widths.** Out of scope here; implemented separately in [layout panel widths persist across reload](2026-08-18-explorer-layout-persist.md).

## Consequences

- Hard reload restores expanded folders and preview tab paths for the current cwd; other workspaces stay in their buckets until pruned.
- Deleted paths disappear on hydrate without blocking the tree.
- Unsaved preview edits are still lost on reload (by design).
- Reveal scroll-lock and three-state folder probes keep using in-memory `dirs` / `probed`; persistence only seeds which directories to expand.

## Testing

`tests/explorer-tree-store.client.spec.ts` covers the persist key, cwd isolation, `retainAccountKeys`, and the absence of draft/body in storage. `tests/explorer-panel.client.spec.tsx` covers hydrate expand + silent stale drop for list/read failures. Run with jsdom and `localStorage.clear()` in `beforeEach`.
