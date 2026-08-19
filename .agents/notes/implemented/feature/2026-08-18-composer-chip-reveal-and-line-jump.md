# Agent Note: Composer chip click reveals file and optional line range

Status: implemented

English | [中文](2026-08-18-composer-chip-reveal-and-line-jump.zh.md)

## Problem

Workspace-file chips in the composer showed truncated basenames in a fixed 4em U+FFFC cell, and clicking a chip could not navigate to the explorer or scroll a Ctrl+L line range in the preview.

## Decision

**Width.** One draft picks one cell rung from its widest chip label via `chipCellStep`; the `DshChipCell*` families scale the U+FFFC advance with `size-adjust` and pin their vertical metrics back to one em ([ladder and metrics](../bug-fix/2026-08-18-composer-chip-cell-metrics.md)). The visible pill sits absolutely inside the transparent cell and clips to `max-width: 100%`. Rejected per-chip letter-spacing and multi-placeholder schemes: a textarea cannot give two U+FFFC glyphs two advances.

**Reveal.** Optional Cordis service `workspaceReveal.reveal(ref)` (provided by ui-explorer, consumed by ui-conversation). `parseReference` splits `path` and optional `:start-end`. The existing `RevealRequests` channel carries `lines` and a monotonic `seq`. Explorer opens details/preview, highlights the row, and activates or opens the tab without re-reading an already-open draft. When lines are present, `CodeMirrorTextPreview` clamps with `clampLineRange`, selects the range, and `scrollIntoView` with `y: 'center'`, keyed on `seq` so a repeat click re-scrolls.

## Alternatives considered

- **Cross-package value import of explorer helpers.** Rejected by client AGENTS.md; service + shared request observable only.
- **Reload the tab on every chip click.** Rejected: would discard unsaved drafts; activate + seq-keyed scroll is enough.

## Consequences

- Chip × still only deletes (`stopPropagation`); pill click reveals when the service is composed.
- Chips without a line suffix only reveal and open preview.
