/**
 * Pure concession-chain column solver for the four-column AppFrame.
 * Chain order is fixed by contract: keep center >= CENTER_MIN by shrinking
 * preview toward its minimum first, then details, then letting center absorb
 * any remaining deficit with both side columns pinned at their minima
 * (preferred widths are never rewritten, so widening the window restores
 * them). The file preview and the file tree are independent panels: either
 * may be open or closed on its own, and a closed side column simply
 * contributes zero width without forcing the other closed. The sidebar never
 * concedes: its rendered width is always the drag preference (or the collapsed
 * rail). Inputs are the layout store's plain width preferences (0 = closed).
 * A closed sidebar resolves to the fixed SIDEBAR_COLLAPSED control rail. The
 * SIDEBAR_AUTO_COLLAPSE breakpoint is consumed by AppFrame, which decides the
 * effective sidebar preference before solving; the solver itself stays
 * breakpoint-free.
 */

/** Resolved widths for one frame; center may drop below CENTER_MIN only at the final fallback. */
export interface Columns { sidebar: number; center: number; details: number; preview: number }

// Contract-frozen geometry: the four-column concession chain's fixed points.
/** Center column floor; only the final fallback may go below it. */
export const CENTER_MIN = 640
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Details drag clamp floor. */
export const DETAILS_MIN = 300
/** Details drag clamp ceiling. */
export const DETAILS_MAX = 520
/** Details width before any user drag. */
export const DETAILS_DEFAULT = 360
/** Preview drag clamp floor — a visible reading pane, never a zero-width track while open. */
export const PREVIEW_MIN = 280
/** Preview drag clamp ceiling. */
export const PREVIEW_MAX = 640
/** Preview width before any user drag. */
export const PREVIEW_DEFAULT = 420

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the four column widths for one viewport frame. Pure: no hysteresis —
 * the output is a function of (viewport, preferences) only, so recovery on
 * re-widening is automatic. Preferences re-clamp here because they cross the
 * store boundary and callers may still supply stale ranges.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @param preview - preview width preference in px (0 = closed; independent of details).
 * @returns resolved widths; details/preview 0 means visually closed (never unmounted), while a closed sidebar keeps its compact rail.
 */
export function computeColumns(viewport: number, sidebar: number, details: number, preview: number): Columns {
  // The sidebar is fixed at its preference (or the rail) — it never concedes.
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)
  const p0 = preview === 0 ? 0 : clampWidth(preview, PREVIEW_MIN, PREVIEW_MAX)

  // Step 1: everything fits at preferred widths.
  if (s + d0 + p0 + CENTER_MIN <= viewport)
    return { sidebar: s, center: viewport - s - d0 - p0, details: d0, preview: p0 }

  // Step 2: shrink preview toward its minimum (only while open).
  let p = p0
  if (p0 > 0) {
    p = Math.max(PREVIEW_MIN, viewport - s - d0 - CENTER_MIN)
    if (s + d0 + p + CENTER_MIN <= viewport)
      return { sidebar: s, center: CENTER_MIN, details: d0, preview: p }
  }

  // Step 3: shrink details toward its minimum.
  let d = d0
  if (d0 > 0) {
    d = Math.max(DETAILS_MIN, viewport - s - p - CENTER_MIN)
    if (s + d + p + CENTER_MIN <= viewport)
      return { sidebar: s, center: CENTER_MIN, details: d, preview: p }
  }

  // Step 4: both side columns pinned to their (possibly-zero) minima; center
  // absorbs the remaining deficit. A closed side column stays zero.
  const dKeep = d0 > 0 ? DETAILS_MIN : 0
  const pKeep = p0 > 0 ? PREVIEW_MIN : 0
  return { sidebar: s, center: Math.max(0, viewport - s - dKeep - pKeep), details: dKeep, preview: pKeep }
}
