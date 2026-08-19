# Agent Note: Composer reference chip shows its basename and its × answers pointer state

Status: implemented

English | [中文](2026-08-18-input-chip-basename-and-remove-feedback.zh.md)

## Problem

Two defects on the composer's reference chips (`InputBar` backdrop, `ui-conversation`):

1. **Unreadable label.** A chip's cell is a fixed 4em — it must equal the textarea's U+FFFC placeholder advance or every glyph after it drifts. `.chipLabel` centered the full workspace-relative label (`justify-content: center`) and clipped it on both edges with no ellipsis, so a long path such as `Assets/script/Logic/Activity/CFishingExpertSetActivity.cs` showed a meaningless middle slice like `ctivity/C` — no basename, no ellipsis hint.
2. **No pointer feedback on ×.** The remove control lives in the `.backdrop`, which is `pointer-events: none`. The button never overrode that, so although it painted above the textarea (`z-index: 1`), pointer events fell through to the textarea: `:hover`, `:active`, and its own `onClick` never fired for a real cursor, only the InputBar `pointerdown` hit-test removed the chip. The result was a dead-feeling × with no hover or press response.

## Decision

**Label — show the basename, ellipsize the rest, keep the full path on the title.** A pure `chipDisplayLabel(label)` in `input/decorations.ts` reduces the label to its basename (posix or windows separators; a separatorless subagent/skill token is returned unchanged). `.chipLabel` is now a left-aligned single-line block with `text-overflow: ellipsis` at a smaller font, so the recognizable leading part of the name stays visible and any overflow ends in a visible ellipsis. The chip's `title` and the machine occurrence still carry the full label. Chosen over `direction: rtl` (reorders bidi-neutral path punctuation unpredictably and would keep only the tail) and over a JS middle-ellipsis (the 4em cell fits ~8 glyphs, so CSS would re-trim the result anyway; the recognizable name start disambiguates files better than a bare `….cs`, and the tooltip carries the extension).

**× — let the control answer its own pointer.** `.chipRemove` sets `pointer-events: auto` (re-enabling events inside the inert backdrop) so, being already above the textarea, it becomes the pointer target in its own rect: `:hover` and `:active` (a small squeeze) now read, and native `onClick` fires. The InputBar `pointerdown` hit-test on the textarea stays as a fallback for the surrounding cell. The hit area grows to 18px (AttachmentRail's size, within the 16–20px target) while the chip's fixed 4em cell is unchanged. Feedback tokens follow the neighboring contrast-circle controls: `--dsw-alias-interactive-bg-hover-solid` for hover/press and a `--dsw-alias-state-business-primary` `focus-visible` ring.

The × keeps `tabIndex={-1}`: it lives in an `aria-hidden` visual mirror of the textarea, so it is a pointer affordance, not a tab stop; keyboard users remove a chip by Backspace/Delete over its placeholder (native single-char atomic delete, unchanged). The `aria-label` reads `移除引用 <basename>` for parity with the visible cell.

## Alternatives considered

**Widen the chip cell to fit the whole name.** The cell advance is bound to the textarea's single U+FFFC glyph (one occurrence = one placeholder char), so widening it means scaling the embedded font and enlarging every chip in the draft. Rejected here — the basename plus tooltip reads the file within the fixed cell. A later change did widen the cell, per draft and per rung, through the stepped cell ladder ([ladder and metrics](2026-08-18-composer-chip-cell-metrics.md)); this note's basename rule still owns what the pill shows.

**Make the × a real tab stop with `tabIndex={0}`.** The backdrop is `aria-hidden`; a focusable control inside a hidden subtree is an accessibility anti-pattern, and each chip would add a tab stop that fights the textarea-centric focus model. Keyboard removal already exists via Backspace/Delete. Rejected.

## Consequences

- A long-path chip shows its basename (`CFishingExpertSetActivity.cs`), truncating with a visible ellipsis only when even the basename overflows the cell; the full path is on the `title`.
- Hovering the × tints it, pressing squeezes it, and clicking removes the chip through the button's own handler; the textarea hit-test remains as a fallback.
- The change is presentation-only: the draft, occurrence table, clipboard projection, and everything the model sees are untouched, so no session event or snapshot changes.

## Testing

`tests/input-machine.client.spec.ts` unit-tests `chipDisplayLabel` (deep path → basename, windows separator, separatorless token, trailing-separator fallback). `tests/input-bar.client.spec.tsx` asserts a long-path chip renders the basename with the full path on `title`/`aria-label`, and the existing drop-chip test now expects the basename cell plus the full-path title. The two specs are green (166 tests); `tsc -b` on the package and the package bundle (no extra `.cjs` shards, zero relative `require("./` in `client.js`) pass.
