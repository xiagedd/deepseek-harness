/**
 * Draft decoration pure core (chips render from the occurrence
 * table at placeholder offsets; the claim token renders as a mirror-layer
 * highlight, the claim hint as ghost text). Zero React — the skeleton renders
 * the instructions; tests drive this directly.
 */
import type { InputState } from './contract.ts'

/** The claim-token highlight range (always draft-leading while the watch holds). */
export interface TokenRange {
  readonly start: number
  readonly end: number
}

/** One chip render instruction: the placeholder at `offset` draws as `label`. */
export interface ChipRender {
  /** Stable render key (same-labeled chips stay independent). */
  readonly occurrenceId: number
  /** Placeholder offset in the draft (the chip occupies [offset, offset+1)). */
  readonly offset: number
  readonly label: string
  /** Owner-resolution failure styling bit. */
  readonly invalid: boolean
  /**
   * Workspace path this chip stands for, offered to the optional file-browser
   * reveal face; null for every other reference source (a subagent or skill
   * chip names no file) and for a chip whose owner resolution failed.
   */
  readonly revealRef: string | null
}

/**
 * One plain-text reference range (the plain-text-reference decision;
 * see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md):
 * a `/name` or `@name` token
 * whose name is on the trigger's lexicon. Pure derivation — editing the text
 * out of match shape simply drops the range next scan.
 */
export interface TextRefRange {
  readonly start: number
  readonly end: number
  readonly trigger: '/' | '@'
}

/** Decoration product: claim token range + chip instructions + text-ref ranges + the ghost hint. */
export interface DraftDecorations {
  /** Claim token range while claimed/submitting and the prefix watch holds; null otherwise. */
  readonly token: TokenRange | null
  /** Chip render instructions in draft order (occurrence table is offset-sorted). */
  readonly chips: readonly ChipRender[]
  /** Scan-derived plain-text reference ranges (empty without a lexicon). */
  readonly textRefs: readonly TextRefRange[]
  /** Ghost hint shown while the claim's args are blank; null otherwise. */
  readonly hint: string | null
}

/** Token matcher: a trigger char at line start or after whitespace, then a word-ish name (never crosses \n). */
const TEXT_REF_RE = /(^|\s)([/@])([\w-]+)/g

/**
 * Scan the draft for plain-text reference tokens against the hot lexicons.
 * Word-boundary discipline: the trigger must sit at the draft
 * start or after whitespace ('x/name' never matches); the name must be an
 * exact lexicon member.
 * @param draft - draft text.
 * @param lexicon - per-trigger name lists (a missing trigger scans nothing).
 * @returns matched ranges in draft order.
 */
export function scanTextRefs(
  draft: string, lexicon: ReadonlyMap<'/' | '@', readonly string[]>,
): TextRefRange[] {
  if (lexicon.size === 0 || draft === '') return []
  const out: TextRefRange[] = []
  TEXT_REF_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TEXT_REF_RE.exec(draft)) !== null) {
    const trigger = m[2] as '/' | '@'
    const name = m[3] ?? ''
    if (lexicon.get(trigger)?.includes(name)) {
      const start = m.index + (m[1]?.length ?? 0)
      out.push({ start, end: start + 1 + name.length, trigger })
    }
  }
  return out
}

/** The empty lexicon (default: zero text-ref decorations, old call sites unchanged). */
const EMPTY_LEXICON: ReadonlyMap<'/' | '@', readonly string[]> = new Map()

/**
 * Chip display label: the basename of a reference label. The chip cell is
 * wide enough for a whole file name (see {@link chipCellStep}) but not for a
 * deep workspace-relative path, so the visible chip shows the basename — the
 * recognizable part — while the full label rides the chip `title`. Accepts
 * posix or windows separators; a label without a separator (a subagent or
 * skill token) is returned unchanged.
 * @param label - reference label (workspace-relative path, name, or token).
 * @returns the basename segment shown in the chip cell and its remove control.
 */
export function chipDisplayLabel(label: string): string {
  const cut = Math.max(label.lastIndexOf('/'), label.lastIndexOf('\\'))
  const base = cut === -1 ? label : label.slice(cut + 1)
  return base === '' ? label : base
}

/** Rungs of the cell ladder the composer sheet declares (rung 12 = 26em). */
export const CHIP_CELL_STEPS = 12

/**
 * Cell advance of rung `step`, in em: the ladder starts at the cell font's own
 * 4em glyph advance and climbs in 2em rungs, so the transparent slack left
 * after a pill stays under half a base cell.
 * @param step - rung index in [1, {@link CHIP_CELL_STEPS}].
 * @returns the placeholder advance that rung publishes, in em.
 */
export function chipCellEm(step: number): number {
  return 2 * (step + 1)
}

/** Label inset, the remove control, and its gap, in em of the draft font. */
const CHIP_CHROME_EM = 2.7
/** Advance of one narrow (latin, digit, punctuation) label glyph, in em of the draft font. */
const NARROW_GLYPH_EM = 0.45
/** Advance of one wide (CJK, fullwidth) label glyph — the label font's own em. */
const WIDE_GLYPH_EM = 0.88
/** CJK, Hangul, kana, and fullwidth forms: one label glyph occupies a full em. */
const WIDE_GLYPH_RE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/

/**
 * The cell-ladder rung the whole composer runs at: the narrowest rung whose
 * advance holds the widest chip pill of the draft.
 *
 * One draft has ONE rung because every chip stands on the same character —
 * a U+FFFC placeholder whose advance comes from one font at one size, so the
 * textarea cannot give two placeholders two widths. The rung therefore rides
 * the widest label, and the sheet's rung families widen every placeholder
 * together (textarea, mirror, and backdrop share the family, so the layers
 * stay aligned by construction at every rung).
 *
 * The estimate is deliberately generous: a rung wider than the label leaves
 * transparent slack after the pill, while a rung too narrow ellipsizes a name
 * that had room. It stays a pure character count — no DOM measurement, so the
 * value is identical in tests, during SSR-less first paint, and before webfont
 * load.
 * @param chips - chip render instructions of the current draft.
 * @returns rung in [1, {@link CHIP_CELL_STEPS}]; 1 whenever no chip is present.
 */
export function chipCellStep(chips: readonly ChipRender[]): number {
  let widest = 0
  for (const chip of chips) {
    let em = CHIP_CHROME_EM
    for (const glyph of chipDisplayLabel(chip.label)) {
      em += WIDE_GLYPH_RE.test(glyph) ? WIDE_GLYPH_EM : NARROW_GLYPH_EM
    }
    if (em > widest) widest = em
  }
  if (widest === 0) return 1
  for (let step = 1; step < CHIP_CELL_STEPS; step += 1) {
    if (chipCellEm(step) >= widest) return step
  }
  return CHIP_CELL_STEPS
}

/**
 * Derive the mirror-layer decorations from the input state.
 * @param state - published input state.
 * @param lexicon - optional per-trigger reference lexicons (plain-text-reference scan).
 * @returns token range, chip instructions, text-ref ranges, and the ghost hint.
 */
export function deriveDecorations(
  state: InputState, lexicon: ReadonlyMap<'/' | '@', readonly string[]> = EMPTY_LEXICON,
): DraftDecorations {
  const { draft, claim, phase, occurrences } = state
  const claimActive = (phase === 'claimed' || phase === 'submitting')
    && claim !== undefined && draft.startsWith(claim.token)
  const token: TokenRange | null = claimActive ? { start: 0, end: claim.token.length } : null
  const chips = occurrences.map(o => ({
    occurrenceId: o.occurrenceId,
    offset: o.offset,
    label: o.label,
    invalid: o.invalid === true,
    // Only a workspace-file reference names something a file browser can
    // locate, and only while its owner still resolves it.
    revealRef: o.source === 'workspace-file' && o.ref !== '' && o.invalid !== true ? o.ref : null,
  }))
  const hint = claimActive && claim.hint !== undefined && draft.slice(claim.token.length).trim() === ''
    ? claim.hint
    : null
  return { token, chips, textRefs: scanTextRefs(draft, lexicon), hint }
}
