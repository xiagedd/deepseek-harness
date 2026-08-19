# Agent Note: Explorer search keeps the browsing state

Status: implemented

English | [中文](2026-08-18-explorer-search-overlay-state.zh.md)

## Problem

Searching the Explorer reset the browsing state it interrupted. Every folder the user had expanded came back collapsed, and the viewport was at the top, once the query was cleared. The panel rendered the tree and the search results as alternatives of one conditional, so an active query unmounted the `react-arborist` `Tree`. React state survived that unmount — `expanded`, `selected`, and the `dsh.explorer.tree.v1` persistence were never written empty — but the tree's own open map was rebuilt from `initialOpenState` (the workspace root alone) and the virtualized scroller remounted at offset zero. The same conditional also unmounted the tree whenever a type filter matched nothing.

## Decision

Search results and the "no match for this type" copy are overlays. The tree host renders whenever a workspace `cwd` exists and carries `hidden` while an overlay is up, so `react-arborist` keeps its open map and its rendered rows for the whole search round trip. Hiding an element destroys its box and zeroes the scroller's `scrollTop` while `react-window` still believes it renders the old offset, so the panel remembers the last offset reported by the tree's `onScroll` while visible and writes it back to `TreeApi.listEl` in a layout effect when the overlay clears. A reveal that is still waiting for its scroll wins that restore: the reveal effect skips its scroll (and keeps its lock unset) while the tree is hidden, then puts the revealed row in view once the tree returns.

## Alternatives considered

**Restoring arborist's open map from `expanded` after each remount.** Rejected because it rebuilds state that never needed to be destroyed, and it cannot restore the scroll offset at all.

**`TreeApi.scrollToOffset` for the restore.** Rejected because `react-window` drops a `scrollTo` to the offset it already holds in state, which is exactly the desynchronized case after hiding: state keeps the old offset while the DOM sits at zero.

**Overlaying with absolute positioning instead of `hidden`.** Rejected because a covered tree stays in the accessibility tree and keyboard order, and sizing it under an overlay of a different height re-enters the resize path this fix avoids.

## Consequences

Entering search keeps expansion, selection, and scroll; clearing it returns to them. Activating a result stays a deliberate move: a directory result clears the query and reveals itself, a file result opens its preview tab, and both expand the ancestors they need. The tree now stays mounted while hidden, so its `ResizeObserver` keeps observing the live host element across search rounds instead of a detached one, and background listings continue to land in a tree the user cannot see.
