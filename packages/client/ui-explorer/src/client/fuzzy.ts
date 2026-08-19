/** Ordered-subsequence fuzzy score for explorer and workspace search. */

/** Extra weight for separators, word starts, and CamelCase boundaries. */
function boundaryBonus(name: string, index: number): number {
  const prev = name.charAt(index - 1)
  if (index === 0 || prev === '-' || prev === '_' || prev === '/' || prev === '\\' || prev === '.') return 8
  return /[a-z]/.test(prev) && /[A-Z]/.test(name.charAt(index)) ? 7 : 0
}

/**
 * Score the strongest ordered-subsequence alignment in O(name × query).
 * @param name - candidate spelling (usually lowercase).
 * @param query - non-empty lowercase query.
 * @returns the score, or undefined when no subsequence match exists.
 */
export function fuzzyScore(name: string, query: string): number | undefined {
  if (query === '') return 0
  if (query.length > name.length) return undefined
  const foldedName = name.toLowerCase()
  const foldedQuery = query.toLowerCase()
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array<number>(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index++) {
    if (foldedName.charAt(index) === foldedQuery.charAt(0))
      previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let q = 1; q < query.length; q++) {
    const next = Array<number>(name.length).fill(noMatch)
    let best = noMatch
    for (let index = 0; index < name.length; index++) {
      const prior = previous[index] ?? noMatch
      if (prior !== noMatch) best = Math.max(best, prior)
      if (foldedName.charAt(index) === foldedQuery.charAt(q) && best !== noMatch) {
        const adjacent = index > 0 && foldedName.charAt(index - 1) === foldedQuery.charAt(q - 1) ? 10 : 0
        next[index] = best + 1 + boundaryBonus(name, index) + adjacent
      }
    }
    previous = next
  }
  let best = noMatch
  for (let index = 0; index < name.length; index++) {
    const score = previous[index] ?? noMatch
    if (score !== noMatch) best = Math.max(best, score)
  }
  return best === noMatch ? undefined : best
}

/**
 * Rank explorer rows by fuzzy query against the basename and the relative path.
 * @param relative - workspace-relative POSIX path, or empty at the workspace root.
 * @param name - row basename.
 * @param query - trimmed search query.
 * @returns the strongest score, or undefined without a subsequence match.
 */
export function fuzzyRowScore(relative: string, name: string, query: string): number | undefined {
  const pathKey = relative === '' ? name : `${relative}/${name}`.replace(/\/+/g, '/')
  const pathScore = fuzzyScore(pathKey, query)
  const basenameScore = fuzzyScore(name, query)
  if (pathScore === undefined && basenameScore === undefined) return undefined
  return Math.max(pathScore ?? Number.NEGATIVE_INFINITY, (basenameScore ?? Number.NEGATIVE_INFINITY) * 1.75)
}

/**
 * Find character indexes for a stable leftmost subsequence highlight.
 * @param name - candidate spelling.
 * @param query - search query.
 * @returns matched indexes, or an empty list when no subsequence exists.
 */
export function fuzzyMatchIndexes(name: string, query: string): readonly number[] {
  const foldedName = name.toLowerCase()
  const foldedQuery = query.trim().toLowerCase()
  const indexes: number[] = []
  let from = 0
  for (let q = 0; q < foldedQuery.length; q++) {
    const index = foldedName.indexOf(foldedQuery.charAt(q), from)
    if (index < 0) return []
    indexes.push(index)
    from = index + 1
  }
  return indexes
}
