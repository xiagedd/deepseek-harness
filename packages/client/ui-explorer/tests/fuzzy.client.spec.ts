import { describe, expect, it } from 'vitest'
import { fuzzyMatchIndexes, fuzzyRowScore, fuzzyScore } from '../src/client/fuzzy.ts'

describe('explorer fuzzy matching', () => {
  it('matches ordered subsequences and rewards contiguous text', () => {
    expect(fuzzyScore('FooBarService', 'fbs')).toBeTypeOf('number')
    expect(fuzzyScore('abc', 'ac')).toBeTypeOf('number')
    expect(fuzzyScore('abc', 'ca')).toBeUndefined()
    expect(fuzzyScore('Buff', 'buff')).toBeGreaterThan(fuzzyScore('Bxxuxxff', 'buff')!)
  })

  it('rewards CamelCase boundaries and basename matches', () => {
    expect(fuzzyScore('FooBarService', 'fbs')).toBeGreaterThan(fuzzyScore('fooboringservice', 'fbs')!)
    expect(fuzzyRowScore('deep/path/Buff.cs', 'Buff.cs', 'buff'))
      .toBeGreaterThan(fuzzyRowScore('buff/deep/path/notes.cs', 'notes.cs', 'buff')!)
  })

  it('returns stable case-insensitive highlight indexes', () => {
    expect(fuzzyMatchIndexes('FooBarService', 'fbs')).toEqual([0, 3, 6])
    expect(fuzzyMatchIndexes('notes.txt', 'zzz')).toEqual([])
  })
})
