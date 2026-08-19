/**
 * Pure workspace-reference helpers: line-range suffix and CM selection mapping.
 */
import { describe, expect, it } from 'vitest'
import {
  formatLineSuffix,
  lineRangeFromSelection,
  withLineRange,
} from '../src/client/workspace-reference.ts'

describe('workspace-reference helpers', () => {
  it('formats single-line, multi-line, and whole-file suffixes', () => {
    expect(formatLineSuffix(undefined)).toBe('')
    expect(formatLineSuffix(null)).toBe('')
    expect(formatLineSuffix({ startLine: 120, endLine: 120 })).toBe(':120')
    expect(formatLineSuffix({ startLine: 120, endLine: 146 })).toBe(':120-146')
    expect(withLineRange('/ws/Assets/Npc.cs', { startLine: 120, endLine: 146 }))
      .toBe('/ws/Assets/Npc.cs:120-146')
    expect(withLineRange('/ws/Assets/Npc.cs', null)).toBe('/ws/Assets/Npc.cs')
  })

  it('maps a half-open CM selection to inclusive lines; empty is null', () => {
    const doc = {
      lineAt: (pos: number) => {
        if (pos < 10) return { number: 1 }
        if (pos < 20) return { number: 2 }
        return { number: 3 }
      },
    }
    expect(lineRangeFromSelection(doc, 5, 5)).toBeNull()
    expect(lineRangeFromSelection(doc, 0, 15)).toEqual({ startLine: 1, endLine: 2 })
    expect(lineRangeFromSelection(doc, 15, 0)).toEqual({ startLine: 1, endLine: 2 })
    expect(lineRangeFromSelection(doc, 10, 11)).toEqual({ startLine: 2, endLine: 2 })
  })
})
