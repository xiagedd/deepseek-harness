# Agent Note: Persist layout panel widths across reload

Status: implemented

English | [中文](2026-08-18-explorer-layout-persist.zh.md)

## Problem

A hard reload (F5 / Ctrl+Shift+R) of the web GUI reset the panel layout: the file-tree (details) and file-preview columns returned closed, so a user had to reopen the explorer by hand after every refresh. The [explorer browse persist](2026-08-18-explorer-browse-persist.md) work already restored expanded folders and preview tab paths, but that state hydrated into columns the layout store kept closed. The layout store was deliberately transient by the [details session-lifecycle decision](../bug-fix/2026-07-29-web-details-session-lifecycle.md), so reload always dropped the panel geometry. The producer asked to reverse that sub-decision: reload must restore the panel layout.

## Decision

`createLayoutStore` now persists the three column widths — `sidebar`, `details`, `preview` (px, `0` = closed) — to `localStorage` under `dsh.layout.panels.v1`. The viewport-derived pair (`narrow`, `narrowExpanded`) stays transient: AppFrame re-derives `narrow` from the live viewport on mount, so persisting it would restore a stale breakpoint.

The engine's `defineStore` persist writes the whole state as one JSON value, which would include the viewport pair. Instead of widening the shared store contract with a partialize option (one consumer, rippling `StoreSpec.persist` across ui-explorer / ui-workspace / ui-conversation), the factory wraps the engine instance: it rehydrates only the three widths (defensively re-clamped, `0` preserved, malformed entries ignored) and subscribes a deduplicated geometry-only projection back to storage. `clearPersisted` drops the key.

**Semantic chosen — persist the last-shown geometry.** The store persists whatever is currently rendered, including a column the user closed. Reload therefore restores exactly the last-shown layout. Switching Session / workspace no longer auto-closes explorer or preview ([global across workspaces](2026-08-18-explorer-preview-global-workspaces.md)); a user close remains part of last-shown. The alternative — persisting a separate "preference" that lifecycle closes do not touch — stays unnecessary.

This partially supersedes the reload-to-default half of the [details session-lifecycle note](../bug-fix/2026-07-29-web-details-session-lifecycle.md); that note's former Session-switch close is superseded by the global-workspaces note. Both older notes stay active and cross-linked.


## Alternatives considered

**Persist the whole state via `defineStore`'s `persist` key.** Rejected: the engine writes the entire `LayoutState`, so the viewport pair would hit disk and a stale `narrow`/`narrowExpanded` could restore over the live breakpoint.

**Add a partialize / key-subset option to the store engine.** The cleaner "foundation" shape, but `StoreSpec.persist` is a bare `string` consumed by four packages; changing it for one consumer is contract churn without a second owner. The geometry-only wrapper is local to ui-layout and deletes no shared code.

**Semantic B — persist a panel preference untouched by automatic closes.** Would keep "reopen the explorer after switching Sessions" but requires distinguishing a user close from a lifecycle close, duplicating close-cause state. Rejected; Session-switch auto-close was later removed entirely ([global across workspaces](2026-08-18-explorer-preview-global-workspaces.md)), so last-shown already matches the global-capability product rule.

**Persist per-Session geometry.** Rejected for the same reason as in the lifecycle note: the product wants one last-shown layout, not a remembered per-Session width map.


## Consequences

- Reload restores the last-shown `sidebar` / `details` / `preview` widths and open state; a user close is part of "last shown", while a Session / workspace switch leaves open explorer and preview columns open ([global across workspaces](2026-08-18-explorer-preview-global-workspaces.md)).
- The layout hydrates coherently with the explorer tree: the widths are restored synchronously at store creation, before the Session-gated columns open, so a restored column appears directly at its saved width (no default-then-resize flicker). The explorer tree then hydrates its expanded folders and preview tabs into the already-open column, and its own `openPreview()` on tab restore is idempotent with the restored preview width.
- The viewport pair always starts fresh, so a narrow-viewport override never survives a reload onto a wide viewport.
- Drag writes persist continuously (deduplicated), matching the engine's own persist cadence; viewport-only changes do not rewrite the geometry entry.

## Testing

`tests/layout-store.client.spec.ts` replaces the former "does not persist" case with: geometry write + rehydrate into a fresh instance, the viewport pair never appearing in storage, a user close persisting the closed column, stale-width re-clamp / malformed-entry ignore, and `clearPersisted`. `tests/app-frame.client.spec.tsx` clears `localStorage` in `beforeEach` so each mount starts from contract defaults, and asserts Session switches keep side panels open. Both ui-layout and ui-explorer suites are green.
