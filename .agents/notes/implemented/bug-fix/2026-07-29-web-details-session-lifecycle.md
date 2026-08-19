# Agent Note: Web details follow the current Session lifecycle

Status: implemented

English | [中文](2026-07-29-web-details-session-lifecycle.zh.md)

## Problem

The details entry is Session-scoped, but its preferred grid width is root-scoped. Selecting a different Session replaced the details content without closing that root preference, so the new owner inherited stale viewing geometry. Hero and other unselected states render no Session-scoped details; they need a derived zero track without becoming false owners in the comparison.

## Decision

`AppFrame` reads the current Session id from the authoritative Session projection. The homepage (no current Session) derives zero rendered details/preview tracks without mutating the stored preference. Any current Session — including blank — may open the explorer and preview columns. Selecting a different Session no longer closes those columns: explorer and CM6 preview are global capabilities across workspaces, and `ExplorerPanel` rebinds to the new session cwd ([global across workspaces](../feature/2026-08-18-explorer-preview-global-workspaces.md)). The per-Session chat selection remains owned by the session-scoped store described by the [slot system standard](../architecture/2026-07-22-slot-type-chain-implementation.md).

The layout store starts details closed and needs no Session-baseline exception. Manual close and reopen inside one unchanged Session retain their existing behavior. (The reload-to-default half of this decision was later reversed: [layout panel widths now persist across reload](../feature/2026-08-18-explorer-layout-persist.md). The Session-switch close half of this decision is superseded by the global-workspaces note linked above.) The lifecycle effect changes neither the [Workspace-owned New Session flow](../feature/2026-07-25-workspace-ui-product-flow.md), composer drafts, Session navigation, nor concession-chain resizing.


## Alternatives considered

**Close details in the New Session click handler.** Rejected because an unselected surface has no Session-scoped details and must not mutate geometry. Closure belongs to the later comparison between two defined Session owners.

**Persist panel geometry per Session.** Rejected because the product contract needs stale context removed, not a new map of remembered widths. Per-Session geometry would also reopen details when users return, contrary to the chosen close-on-leave behavior.

**Preserve persisted layout after the Session baseline is ready.** Rejected because it duplicates startup lifecycle in a presentation component solely to validate stale viewing state. Transient defaults make reload deterministic without a readiness flag.

**Treat every current-projection change as a Session switch.** Rejected because startup materialization, hero, clearing selection, and invalidation are not transitions between two Session owners.

## Consequences

Details starts closed, including when the first Session materializes. An explicit open action uses the contract default width. Switching to a different Session keeps open explorer and preview columns (see [global across workspaces](../feature/2026-08-18-explorer-preview-global-workspaces.md)); a user close still writes zero and reopen uses the contract default. Unselected states (homepage) derive a zero rendered track while leaving the preferred geometry unchanged. (Reload no longer forgets geometry — see the [layout persist note](../feature/2026-08-18-explorer-layout-persist.md).) The layout behavior test covers initial defaults, first materialization, Session switches that keep side panels open, same-Session return, and layout storage; the keyless browser e2e drives the same owner transitions through the shipped composition while checking the full grid track and browser errors.

