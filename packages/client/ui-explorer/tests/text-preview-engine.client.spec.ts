/**
 * Language routing and oversized-preview helpers for the text-preview engine.
 */
import { describe, expect, it } from 'vitest'
import { langFromPreviewPath } from '../src/client/preview-lang.ts'
import {
  isOversizedTextPreview,
  TEXT_PREVIEW_MAX_BYTES,
  utf8ByteLength,
} from '../src/client/text-preview-engine.ts'

describe('langFromPreviewPath', () => {
  it('maps csharp and common text extensions', () => {
    expect(langFromPreviewPath('/ws/Foo.cs')).toBe('csharp')
    expect(langFromPreviewPath('/ws/a.ts')).toBe('typescript')
    expect(langFromPreviewPath('/ws/a.tsx')).toBe('typescript')
    expect(langFromPreviewPath('/ws/a.js')).toBe('javascript')
    expect(langFromPreviewPath('/ws/a.json')).toBe('json')
    expect(langFromPreviewPath('/ws/a.md')).toBe('markdown')
    expect(langFromPreviewPath('/ws/a.yaml')).toBe('yaml')
    expect(langFromPreviewPath('/ws/a.yml')).toBe('yaml')
    expect(langFromPreviewPath('/ws/a.shader')).toBe('cpp')
    expect(langFromPreviewPath('/ws/a.py')).toBe('python')
    expect(langFromPreviewPath('/ws/a.go')).toBe('go')
    expect(langFromPreviewPath('/ws/a.rs')).toBe('rust')
    expect(langFromPreviewPath('/ws/a.sh')).toBe('shell')
    expect(langFromPreviewPath('/ws/a.toml')).toBe('toml')
  })

  it('falls back to plain for unknown or extensionless names', () => {
    expect(langFromPreviewPath('/ws/README')).toBe('plain')
    expect(langFromPreviewPath('/ws/.gitignore')).toBe('plain')
    expect(langFromPreviewPath('/ws/a.unknownext')).toBe('plain')
    expect(langFromPreviewPath('/ws/a.txt')).toBe('plain')
  })

  it('is case-insensitive on the extension and accepts Windows separators', () => {
    expect(langFromPreviewPath('C:\\ws\\Foo.CS')).toBe('csharp')
  })
})

describe('oversized text preview', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    expect(utf8ByteLength('a')).toBe(1)
    expect(utf8ByteLength('你好')).toBe(6)
  })

  it('rejects bodies over the 1 MiB ceiling', () => {
    const under = 'x'.repeat(TEXT_PREVIEW_MAX_BYTES)
    expect(isOversizedTextPreview(under)).toBe(false)
    expect(isOversizedTextPreview(`${under}y`)).toBe(true)
  })
})
