import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN, clampWidth, computeColumns,
  DETAILS_DEFAULT, DETAILS_MIN, PREVIEW_DEFAULT, PREVIEW_MIN,
  SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

// Numeric preference form (0 = closed); helpers keep the scenario names readable.
const open = (width: number) => width
const closed = (_width: number) => 0

describe('clampWidth', () => {
  it('clamps into the range and rounds', () => {
    expect(clampWidth(250.4, 240, 420)).toBe(250)
    expect(clampWidth(100, 240, 420)).toBe(240)
    expect(clampWidth(9999, 240, 420)).toBe(420)
  })
})

describe('computeColumns', () => {
  it('step 1: everything fits at preferred widths (both side columns open)', () => {
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1920 - 280 - 360 - 420, details: 360, preview: 420 })
  })

  it('closed sidebar keeps its compact rail while closed side columns contribute zero width', () => {
    expect(computeColumns(1920, closed(300), closed(360), closed(420)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1920 - SIDEBAR_COLLAPSED, details: 0, preview: 0 })
  })

  it('preferences beyond the clamp range are clamped before solving', () => {
    const cols = computeColumns(1920, open(9999), open(1), open(1))
    expect(cols.sidebar).toBe(420)
    expect(cols.details).toBe(300)
    expect(cols.preview).toBe(PREVIEW_MIN)
    expect(computeColumns(1920, open(1), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT)).sidebar).toBe(SIDEBAR_MIN)
  })

  it('preview is independent of details: preview open while the tree is closed', () => {
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1920 - 280 - 420, details: 0, preview: 420 })
  })

  it('details is independent of preview: tree open while preview is closed', () => {
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), closed(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1920 - 280 - 360, details: 360, preview: 0 })
  })

  it('step 2: preview shrinks first, center pinned at min', () => {
    // 280 + 360 + 420 + 640 = 1700 > 1600; preview concedes to 1600-280-360-640 = 320.
    const cols = computeColumns(1600, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, details: 360, preview: 320 })
  })

  it('step 3: details shrinks after preview bottoms out at its minimum', () => {
    // Preview pinned at 280, details concedes to 1500-280-280-640 = 300.
    const cols = computeColumns(1500, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, details: 300, preview: PREVIEW_MIN })
  })

  it('step 4: both side columns pin to their minima and center absorbs below CENTER_MIN', () => {
    const cols = computeColumns(1000, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1000 - 280 - DETAILS_MIN - PREVIEW_MIN, details: DETAILS_MIN, preview: PREVIEW_MIN })
  })

  it('preview-only squeeze pins preview at its min without opening details', () => {
    const cols = computeColumns(1000, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1000 - 280 - PREVIEW_MIN, details: 0, preview: PREVIEW_MIN })
  })

  it('the sidebar never concedes: center absorbs the deficit below CENTER_MIN', () => {
    // 700 < 280+640: sidebar keeps 280, center takes 420 < CENTER_MIN, both side columns closed.
    const cols = computeColumns(700, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT), closed(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: SIDEBAR_DEFAULT, center: 420, details: 0, preview: 0 })
  })

  it('tiny viewport with both side columns closed: sidebar holds, center takes the remainder', () => {
    const cols = computeColumns(400, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT), closed(PREVIEW_DEFAULT))
    expect(cols).toEqual({ sidebar: SIDEBAR_DEFAULT, center: Math.max(0, 400 - SIDEBAR_DEFAULT), details: 0, preview: 0 })
  })

  it('recovery is pure: re-widening restores preferred widths untouched', () => {
    const squeezed = computeColumns(1000, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(squeezed.details).toBe(DETAILS_MIN)
    expect(squeezed.preview).toBe(PREVIEW_MIN)
    const restored = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(PREVIEW_DEFAULT))
    expect(restored.details).toBe(DETAILS_DEFAULT)
    expect(restored.preview).toBe(PREVIEW_DEFAULT)
    expect(restored.sidebar).toBe(SIDEBAR_DEFAULT)
  })
})

describe('computeColumns — degenerate viewports', () => {
  it('sidebar closed and viewport below CENTER_MIN: side columns stay closed, center takes the rest', () => {
    expect(computeColumns(500, closed(300), open(DETAILS_DEFAULT), closed(PREVIEW_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 500 - SIDEBAR_COLLAPSED - DETAILS_MIN, details: DETAILS_MIN, preview: 0 })
  })
})
