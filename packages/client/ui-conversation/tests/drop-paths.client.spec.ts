import { describe, expect, it } from 'vitest'
import {
  acceptWorkspaceDrops, classifyDrop, isImageDrop, lastSegment, localPathOf,
  pathChipLabel, relativeToCwd, workspaceFileInsert,
} from '../src/client/skeleton/drop-paths.ts'

function nativeFile(name: string, type: string, path?: unknown): File {
  const file = new File(['x'], name, { type })
  if (path !== undefined) Object.defineProperty(file, 'path', { value: path })
  return file
}

describe('drop-paths', () => {
  it('reads Electron File.path and ignores empty or non-string values', () => {
    expect(localPathOf(nativeFile('a.ts', 'text/plain', '/ws/a.ts'))).toBe('/ws/a.ts')
    expect(localPathOf(nativeFile('a.ts', 'text/plain', ''))).toBeUndefined()
    expect(localPathOf(nativeFile('a.ts', 'text/plain', 1))).toBeUndefined()
    expect(localPathOf(new File(['x'], 'a.ts', { type: 'text/plain' }))).toBeUndefined()
  })

  it('classifies image MIME onto the rail and everything else by native path', () => {
    const image = nativeFile('a.png', 'image/png', '/ws/a.png')
    const text = nativeFile('a.ts', 'text/plain', '/ws/a.ts')
    const folder = nativeFile('src', '', '/ws/src')
    const browser = nativeFile('note.txt', 'text/plain')
    expect(isImageDrop(image)).toBe(true)
    expect(isImageDrop(text)).toBe(false)
    expect(classifyDrop([image, text, folder, browser])).toEqual({
      images: [image],
      paths: [{ file: text, path: '/ws/a.ts' }, { file: folder, path: '/ws/src' }],
      missingPath: [browser],
    })
    expect(classifyDrop([])).toEqual({ images: [], paths: [], missingPath: [] })
  })

  it('computes workspace-relative labels without touching the disk', () => {
    expect(lastSegment('foo')).toBe('foo')
    expect(lastSegment('a/b')).toBe('b')
    expect(lastSegment('/')).toBe('')
    expect(lastSegment('')).toBe('')
    expect(relativeToCwd('/ws', '/ws/src/a.ts')).toBe('src/a.ts')
    expect(relativeToCwd('/ws/', '/ws/a.ts')).toBe('a.ts')
    expect(relativeToCwd('/ws', '/ws')).toBe('ws')
    expect(relativeToCwd('/', '/etc/passwd')).toBe('etc/passwd')
    expect(relativeToCwd('/', '/')).toBeUndefined()
    expect(relativeToCwd('/ws', '/tmp/a.ts')).toBeUndefined()
    expect(relativeToCwd('', '/ws/a.ts')).toBeUndefined()
    expect(relativeToCwd('///', '/ws/a.ts')).toBeUndefined()
    expect(relativeToCwd('/ws', '')).toBeUndefined()
    expect(relativeToCwd('H:\\Repo', 'h:\\repo\\src\\A.ts')).toBe('src/A.ts')
    expect(relativeToCwd('C:\\ws', 'D:\\ws\\a.ts')).toBeUndefined()
    expect(relativeToCwd('//server/share', '//server/share/a.ts')).toBe('a.ts')
  })

  it('rejects missing cwd and outside-workspace paths instead of inventing a basename', () => {
    expect(pathChipLabel(undefined, '/ws/a.ts')).toBeUndefined()
    expect(pathChipLabel('', '/ws/a.ts')).toBeUndefined()
    expect(pathChipLabel('/ws', '/tmp/a.ts')).toBeUndefined()
    expect(pathChipLabel('/ws', '/ws/a.ts')).toBe('a.ts')
    const inside = { file: nativeFile('a.ts', 'text/plain', '/ws/a.ts'), path: '/ws/a.ts' }
    const outside = { file: nativeFile('b.ts', 'text/plain', '/tmp/b.ts'), path: '/tmp/b.ts' }
    expect(acceptWorkspaceDrops('/ws', [inside, outside])).toEqual({
      chips: [{ path: '/ws/a.ts', label: 'a.ts' }],
      outside: true,
    })
    expect(acceptWorkspaceDrops(undefined, [inside])).toEqual({ chips: [], outside: true })
    expect(acceptWorkspaceDrops('/ws', [])).toEqual({ chips: [], outside: false })
    expect(workspaceFileInsert('/ws/a.ts', 'a.ts')).toEqual({
      source: 'workspace-file',
      ref: '/ws/a.ts',
      label: 'a.ts',
      clipboardText: '/ws/a.ts',
    })
  })
})
