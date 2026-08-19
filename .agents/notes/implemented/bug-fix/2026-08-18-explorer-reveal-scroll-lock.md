# Agent Note: Explorer reveal scrolls only until its target row exists

Status: implemented

English | [中文](2026-08-18-explorer-reveal-scroll-lock.zh.md)

## Problem

Expanding a folder in the explorer sometimes yanked the viewport upward, pushing the just-clicked row out of sight. The reveal effect re-ran on every `dirs` change and re-issued `scrollIntoView` / `treeApi.scrollTo(activeReveal)` toward whatever the current reveal target was. Because expanding a folder — and, after the emptiness probe landed, a background listing — mutates `dirs`, the effect fired again and scrolled back to a stale reveal target that sat above the row the user had just clicked. The scroll happened after layout, so the clicked row visibly jumped away.

## Decision

The reveal effect scrolls to a target only while that target's row does not yet exist in the visible order, then locks. `ExplorerPanel` keeps a `scrolledReveal` ref: once `activeReveal` is present in `visibleTreeOrder`, the effect records it and stops re-scrolling to the same path. A new reveal (a different `activeReveal`) clears the lock and scrolls once again; clearing `activeReveal` resets the ref. `scrollIntoView` keeps `block: 'nearest'`, so the initial reveal never over-centers. This makes a later `dirs` mutation — a user expand or a probe result — no longer re-anchor the viewport to a resolved reveal, so the clicked folder stays where it was and its children open downward.

## Alternatives considered

**Drop `dirs` from the effect's dependency list.** Would stop the re-fire, but the effect legitimately needs `dirs`: the first reveal of a deep path must wait for ancestors to list before the target row exists. Removing the dependency would break revealing a not-yet-listed path. The lock keeps the dependency and instead makes repeats after resolution a no-op.

**Switch `scrollIntoView` to `block: 'start'` or `'center'`.** Changes where the target lands but not the root cause: the effect would still re-scroll to a stale target on the next `dirs` change, just to a different offset. Rejected as treating the symptom.

**Guard the probe from touching `dirs`.** The probe already writes to a separate `probed` cache, not `dirs`, so it does not itself re-fire the effect through `dirs`. But a plain user expand still mutates `dirs`, so the reveal effect needed its own lock regardless; the probe decoupling is necessary but not sufficient.

## Consequences

- Expanding a folder keeps the clicked row in view; children open beneath it.
- A reveal still works the first time for a deep, not-yet-listed path, because the lock only engages once the target row exists.
- The lock is per reveal target: issuing a new reveal scrolls again, so preview/`@`-chip reveals are unaffected.

## Testing

`tests/explorer-panel.client.spec.tsx` spies on `HTMLElement.prototype.scrollIntoView`: it asserts a reveal scrolls once, then expanding an unrelated folder does not scroll again. The spec is green.
