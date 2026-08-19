/**
 * The chip cell ladder: the pure rung choice and the composer sheet that has to
 * realize it. The sheet half is not decoration — a rung whose vertical metrics
 * are left riding `size-adjust` makes the inline box several em tall, which
 * drops the label out of its own clipping box and every layer's glyphs out of
 * the box that paints them.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHIP_CELL_STEPS, chipCellEm, chipCellStep } from '../src/client/input/decorations.ts'
import type { ChipRender } from '../src/client/input/decorations.ts'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/skeleton/InputBar.module.css', import.meta.url)),
  'utf8',
)

/** Chip instruction carrying just the label the rung choice reads. */
const chip = (label: string): ChipRender =>
  ({ occurrenceId: 1, offset: 0, label, invalid: false, revealRef: null })

/** The declared descriptors of one cell face, in percent. */
function face(step: number): { adjust: number; ascent: number; descent: number; lineGap: number } {
  const block = new RegExp(
    `@font-face \\{\\s*font-family: 'DshChipCell${step}';([^}]*)\\}`,
  ).exec(css)
  expect(block, `no @font-face for rung ${step}`).not.toBeNull()
  const body = block![1] ?? ''
  const read = (name: string): number => {
    const found = new RegExp(`${name}: ([\\d.]+)%`).exec(body)
    expect(found, `${name} missing on rung ${step}`).not.toBeNull()
    return Number(found![1])
  }
  return {
    adjust: read('size-adjust'),
    ascent: read('ascent-override'),
    descent: read('descent-override'),
    lineGap: read('line-gap-override'),
  }
}

describe('chip cell ladder', () => {
  it('climbs in 2em rungs from the cell font own 4em advance', () => {
    expect(chipCellEm(1)).toBe(4)
    expect(chipCellEm(CHIP_CELL_STEPS)).toBe(26)
    for (let step = 2; step <= CHIP_CELL_STEPS; step += 1) {
      expect(chipCellEm(step) - chipCellEm(step - 1)).toBe(2)
    }
  })

  it('picks the narrowest rung that holds the widest label, and clamps at the last one', () => {
    expect(chipCellStep([])).toBe(1)
    // Chrome (2.7em) alone fits the base cell; each narrow glyph adds 0.45em.
    expect(chipCellStep([chip('ab')])).toBe(1)
    expect(chipCellEm(chipCellStep([chip('a.ts')]))).toBeGreaterThanOrEqual(2.7 + 4 * 0.45)
    // One rung per draft: the widest label decides for every chip.
    const wide = chipCellStep([chip('a.ts'), chip('InputBar.module.css')])
    expect(wide).toBe(chipCellStep([chip('InputBar.module.css')]))
    expect(wide).toBeGreaterThan(chipCellStep([chip('a.ts')]))
    // A name past the last rung ellipsizes inside its pill instead of running
    // under the following glyphs.
    expect(chipCellStep([chip('x'.repeat(400))])).toBe(CHIP_CELL_STEPS)
  })

  it('rides a name past the last rung on the basename, never a mid-path slice', () => {
    // A deep path costs the same rung as its basename: the pill shows the name.
    expect(chipCellStep([chip('a/very/deep/path/to/a.ts')])).toBe(chipCellStep([chip('a.ts')]))
  })

  it('declares one face per rung whose advance is that rung', () => {
    // Rung 1 is the default the stack starts on; every other rung is selected
    // by the data attribute InputBar publishes.
    expect(/\.grow \{[^}]*--dsh-chip-cell-family: 'DshChipCell1';/.test(css)).toBe(true)
    for (let step = 1; step <= CHIP_CELL_STEPS; step += 1) {
      // The glyph's own advance is 4em, so the face scale IS the rung / 4.
      expect(face(step).adjust).toBeCloseTo((chipCellEm(step) / 4) * 100, 2)
      if (step === 1) continue
      expect(css).toContain(`.grow[data-chip-cell='${step}'] {\n  --dsh-chip-cell-family: 'DshChipCell${step}';`)
    }
    // No rung beyond the ladder, and no rung the sheet forgot to bind.
    expect(css).not.toContain(`DshChipCell${CHIP_CELL_STEPS + 1}`)
  })

  it('pins every rung to a one-em content area (the metrics size-adjust would inflate)', () => {
    for (let step = 1; step <= CHIP_CELL_STEPS; step += 1) {
      const { adjust, ascent, descent, lineGap } = face(step)
      // The overrides are read through the face scale, so ascent × scale is the
      // metric the engine uses: 0.8em up, 0.2em down, one em of content area at
      // every rung.
      expect((ascent * adjust) / 100).toBeCloseTo(80, 1)
      expect((descent * adjust) / 100).toBeCloseTo(20, 1)
      expect(lineGap).toBe(0)
    }
  })

  it('keeps the chip label off the cell face so its glyphs sit inside the pill', () => {
    // The label carries no placeholder: a cell face would only lend it ITS
    // metrics, and those decide where the glyphs sit in the clipping box.
    expect(/\.chipLabel \{[^}]*font-family: var\(--dsw-font-family\)/.test(css)).toBe(true)
    // The pill is centered on the chip line, and both values are published once.
    expect(css).toContain('--dsh-chip-pill-height: 32px;')
    expect(css).toContain('--dsh-chip-line-height: 38px;')
    expect(/\.chipPill \{[^}]*height: var\(--dsh-chip-pill-height\)/.test(css)).toBe(true)
  })
})
