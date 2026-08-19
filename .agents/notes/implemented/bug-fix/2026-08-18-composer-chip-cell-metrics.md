# Agent Note: The composer chip cell ladder pins its vertical font metrics

Status: implemented

English | [中文](2026-08-18-composer-chip-cell-metrics.zh.md)

## Problem

The stepped cell font that widens a chip's U+FFFC placeholder broke the chip it was widening: the pill painted an empty rounded block whose filename was invisible and whose background covered only a band of where the glyphs actually landed.

`size-adjust` scales every metric of a face, ascent and descent included — not only the glyph advance the ladder wanted. The composer puts the stepped face first on `.input`, `.mirror`, and `.backdrop`, so at rung N the content area of every inline box in all three layers became N em tall while the line box stayed 38px. The content area is what positions the baseline inside its line box (space above the baseline = half-leading + ascent), so the glyphs were drawn 0.3 × N em too low: measured in Chromium at a 19-character basename (then rung 3), `.chipLabel`'s own inline box was 42px tall inside its 22px `overflow: hidden` clipping box, leaving the name almost entirely clipped, and the plain draft text after the chip landed below the layers' 42px height. The pill itself was correctly centered — its `top: 50%` inside the inline containing block cancels the inflation exactly — which is why the light-blue rounded box appeared to cover only "half" of the text: it covered the line the text should have occupied, while the text sat below it.

## Decision

**Pin the vertical metrics per face, keep `size-adjust` for the advance alone.** Every `DshChipCellN` face declares `ascent-override`, `descent-override`, and `line-gap-override` divided by its own scale, so the used metrics are ascent 0.8em / descent 0.2em — a one-em content area — at every rung, while the U+FFFC advance still scales. The overrides are read through the same multiplier as the outlines (measured: `size-adjust: 300%` with `ascent-override: 80%` yields a 48px content area at 16px, and `26.667%` yields 16px), so dividing is what makes the metric constant.

**The chip label names the app family directly.** `.chipLabel` carries no placeholder, so a cell face would only lend it ITS metrics; `font-family: var(--dsw-font-family)` keeps the label's glyphs inside the pill even on an engine that ignores the metric overrides.

**The ladder climbs in 2em rungs (4em … 26em, twelve faces) instead of 4em cells.** `chipCellEm(step)` owns the arithmetic and `chipCellStep` picks the narrowest rung that holds the widest label of the draft, halving the transparent slack left after a pill. One draft still runs at one rung: the textarea cannot give two U+FFFC glyphs two advances, so a multi-chip draft rides its widest label.

## Alternatives considered

**Generate one font per rung with the advance baked into `hmtx`.** Removes the descriptor interaction entirely, but replaces one audited blob with twelve hand-patched ones and no generator to reproduce them. Rejected: the override percentages are visible in the sheet and asserted by a test, which the blobs would not be.

**Measure each pill in the DOM and write the width back.** The exact width needs a hidden un-clamped measurer, a layout-phase read, and a re-render per draft edit, and it still quantizes to a rung. Rejected for this fix: the pill is already content-sized, so the residual is transparent slack, not a visible block.

**Leave the label on the layers' stack and only pin metrics.** One engine ignoring the overrides would re-clip every label. Rejected: the label has no reason to inherit a placeholder-only face.

## Consequences

- A chip shows its full basename, vertically centered in a 32px pill that wraps it with 5px above and below; the × stays centered with its hover and press feedback.
- Cell advance is `2(step + 1)` em: a short name reserves a 4–6em cell instead of jumping a whole 4em step, and a name past 26em ellipsizes inside its pill with the full path on the chip title.
- Caret alignment is unchanged by construction: all three layers keep one family, one advance, and now one content area, so the backdrop's glyph runs and the mirror's agree to the pixel.
- Presentation only — draft text, occurrence table, clipboard projection, and everything the model sees are untouched, so no session event or snapshot moves.

## Testing

`tests/chip-cell-ladder.client.spec.ts` (6 tests) covers the rung arithmetic and gates the sheet that realizes it: every rung declares a face whose scale is its advance, `ascent-override × size-adjust` is 80% and `descent-override × size-adjust` is 20% at every rung, each rung binds its family, and `.chipLabel` names the app family. `tests/input-bar.client.spec.tsx` keeps the rendering, removal, and reveal behavior green (92 tests with the ladder spec; 449 of 451 in the package, the two `gate-branch-tails` failures being pre-existing).

Box-model correctness was verified by rendering the real sheet in headless Chromium (the sheet as authored and again as the bundle ships it, with hashed class names) across short, long, CJK, over-long, two-chip, and soft-wrapped drafts, asserting: chip inline box exactly one em, pill center on the line center, label ink inside both the pill and its clipping box, × centered, placeholder advance equal to the rung, and the backdrop's trailing text run at the same origin as the mirror's.
