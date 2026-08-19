/**
 * Pure helpers for workspace-file chat references from the explorer /
 * preview surfaces. Serialization stays path (+ optional line range)
 * literals — never selected body text — matching the `@` workspace-file codec.
 */

/** Inclusive 1-based line range for a non-empty editor selection. */
export interface LineRange {
  /** First selected line (1-based). */
  readonly startLine: number
  /** Last selected line (1-based, inclusive). */
  readonly endLine: number
}

/**
 * Suffix for chip label / ref / clipboard (`:120` or `:120-146`).
 * @param range - inclusive line range, or null/undefined for whole-file.
 * @returns empty string when no range; otherwise a `:`-prefixed suffix.
 */
export function formatLineSuffix(range: LineRange | null | undefined): string {
  if (range === undefined || range === null) return ''
  if (range.startLine === range.endLine) return `:${range.startLine}`
  return `:${range.startLine}-${range.endLine}`
}

/**
 * Absolute path with an optional line-range suffix (model / clipboard form).
 * @param path - host absolute path.
 * @param range - inclusive line range, or null/undefined for whole-file.
 * @returns path, optionally followed by `:N` or `:N-M`.
 */
export function withLineRange(path: string, range: LineRange | null | undefined): string {
  return path + formatLineSuffix(range)
}

/** Trailing `:120` or `:120-146` written by {@link formatLineSuffix}. */
const LINE_SUFFIX_RE = /:(\d+)(?:-(\d+))?$/

/**
 * The path a reference names, i.e. the inverse of {@link withLineRange}. A
 * windows drive prefix survives (`C:\src\a.ts` has no line suffix), because
 * only a digits-only tail after the LAST colon is one.
 * @param ref - reference as inserted into the composer.
 * @returns the path alone, with any line-range suffix removed.
 */
export function referencePath(ref: string): string {
  return ref.replace(LINE_SUFFIX_RE, '')
}

/** A parsed reference: its path and the optional line range it carried. */
export interface ParsedReference {
  /** Path with any `:N`/`:N-M` line suffix stripped. */
  readonly path: string
  /** Inclusive 1-based range from the suffix, or undefined for whole-file. */
  readonly lines?: LineRange
}

/**
 * Split a composer reference into its path and optional line range — the full
 * inverse of {@link withLineRange}. A single `:N` yields the one-line range
 * `{N, N}`; `:N-M` yields `{N, M}`; anything else (a bare path, a windows
 * drive) yields no range.
 * @param ref - reference as inserted into the composer.
 * @returns the path and, when present, its inclusive line range.
 */
export function parseReference(ref: string): ParsedReference {
  const match = LINE_SUFFIX_RE.exec(ref)
  if (match === null) return { path: ref }
  const startLine = Number(match[1])
  const endLine = match[2] === undefined ? startLine : Number(match[2])
  return { path: ref.slice(0, match.index), lines: { startLine, endLine } }
}

/**
 * Clamp an inclusive 1-based line range into a document that may be shorter
 * than the range asked for — a chip outlives the edit that shortened its file,
 * so an out-of-range request scrolls to the closest real lines instead of
 * failing. Reversed input is normalized.
 * @param range - requested inclusive 1-based range.
 * @param lineCount - document line count (always at least 1 in CodeMirror).
 * @returns a range inside [1, lineCount] with startLine <= endLine.
 */
export function clampLineRange(range: LineRange, lineCount: number): LineRange {
  const last = Math.max(1, lineCount)
  const low = Math.min(range.startLine, range.endLine)
  const high = Math.max(range.startLine, range.endLine)
  const startLine = Math.min(Math.max(low, 1), last)
  return { startLine, endLine: Math.min(Math.max(high, startLine), last) }
}

/**
 * Map a CodeMirror-style half-open selection to an inclusive line range.
 * Empty selections (caret only) return null so callers fall back to whole-file.
 * @param doc - document with `lineAt(pos).number` (1-based).
 * @param from - selection anchor/head start (inclusive).
 * @param to - selection end (exclusive when non-empty).
 * @returns inclusive line range, or null when from === to.
 */
export function lineRangeFromSelection(
  doc: { lineAt: (pos: number) => { number: number } },
  from: number,
  to: number,
): LineRange | null {
  if (from === to) return null
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  return {
    startLine: doc.lineAt(start).number,
    endLine: doc.lineAt(end - 1).number,
  }
}
