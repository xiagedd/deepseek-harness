import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DSHIGNORE, isIgnoredEntry, isMetaName, matchesIgnore, parseIgnore, relativePosix,
} from '../src/client/ignore.ts'

describe('parseIgnore / matchesIgnore', () => {
  it('skips comments and blanks while applying negations', () => {
    const rules = parseIgnore('# hi\n\n*.meta\n!keep.meta\n')
    expect(matchesIgnore('drop.meta', false, rules)).toBe(true)
    expect(matchesIgnore('keep.meta', false, rules)).toBe(false)
  })

  it('matches *.ext anywhere, directory trailing slash, and root-relative paths', () => {
    const rules = parseIgnore('*.meta\nLibrary/\n/*.csproj\nAssets/IgnoreMe.txt\n[Tt]emp/\n')
    expect(matchesIgnore('Foo.cs.meta', false, rules)).toBe(true)
    expect(matchesIgnore('nested/Bar.meta', false, rules)).toBe(true)
    expect(matchesIgnore('Library', true, rules)).toBe(true)
    expect(matchesIgnore('Library', false, rules)).toBe(false)
    expect(matchesIgnore('nested/Library', true, rules)).toBe(true)
    expect(matchesIgnore('App.csproj', false, rules)).toBe(true)
    expect(matchesIgnore('sub/App.csproj', false, rules)).toBe(false)
    expect(matchesIgnore('Assets/IgnoreMe.txt', false, rules)).toBe(true)
    expect(matchesIgnore('Temp', true, rules)).toBe(true)
    expect(matchesIgnore('temp', true, rules)).toBe(true)
  })

  it('uses built-in defaults and relative POSIX paths', () => {
    const rules = parseIgnore(DEFAULT_DSHIGNORE)
    expect(isIgnoredEntry('/ws', '/ws/Library', true, rules)).toBe(true)
    expect(isIgnoredEntry('/ws', '/ws/Temp', true, rules)).toBe(true)
    expect(isIgnoredEntry('/ws', '/ws/obj', true, rules)).toBe(true)
    expect(isIgnoredEntry('/ws', '/ws/Foo.cs.meta', false, rules)).toBe(true)
    expect(isIgnoredEntry('/ws', '/ws/Foo.cs', false, rules)).toBe(false)
    expect(relativePosix('/ws', '/ws')).toBe('')
    expect(relativePosix('C:\\ws', 'C:\\ws\\Library')).toBe('Library')
    expect(relativePosix('/ws', '/other/a')).toBe('a')
    expect(isMetaName('Foo.cs.meta')).toBe(true)
    expect(isMetaName('Foo.META')).toBe(true)
    expect(isMetaName('Foo.cs')).toBe(false)
  })

  it('matches recursive double-star patterns', () => {
    const rules = parseIgnore('build/**/generated/\n')
    expect(matchesIgnore('build/win/generated', true, rules)).toBe(true)
    expect(matchesIgnore('build/generated', true, rules)).toBe(true)
    expect(matchesIgnore('src/generated', true, rules)).toBe(false)
  })
})
