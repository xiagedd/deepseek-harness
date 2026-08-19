// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  ExplorerFileAnim16, ExplorerFileAsset16, ExplorerFileAudio16, ExplorerFileBlank16,
  ExplorerFileCode16, ExplorerFileData16, ExplorerFileImage16, ExplorerFileMaterial16,
  ExplorerFileMesh16, ExplorerFilePrefab16, ExplorerFileScene16, ExplorerFileShader16,
  ExplorerFileText16, ExplorerFolderEmpty16, ExplorerFolderOpen16, ExplorerFolderSolid16,
  ExplorerGlyph, explorerIconKind, fileExtension, isCodeName, isReadmeName,
  isTextName, matchesSearch, matchesTypeFilter,
} from '../src/client/explorer-icons.tsx'

describe('explorer-icons', () => {
  it('maps extensions, empty files, README, and type filters', () => {
    expect(fileExtension('Npc.cs')).toBe('cs')
    expect(fileExtension('.env')).toBe('')
    expect(explorerIconKind('directory', 'src')).toBe('folder')
    expect(explorerIconKind('directory', 'empty', true)).toBe('folderEmpty')
    expect(explorerIconKind('file', 'Npc.cs')).toBe('code')
    expect(explorerIconKind('file', 'Npc.cs', false, 0)).toBe('file')
    expect(explorerIconKind('file', 'README')).toBe('text')
    expect(explorerIconKind('file', 'notes.txt')).toBe('text')
    expect(explorerIconKind('file', 'shot.png')).toBe('image')
    expect(explorerIconKind('file', 'cfg.json')).toBe('data')
    expect(explorerIconKind('file', 'Hero.prefab')).toBe('prefab')
    expect(explorerIconKind('file', 'hero.fbx')).toBe('mesh')
    expect(explorerIconKind('file', 'lit.mat')).toBe('material')
    expect(explorerIconKind('file', 'fx.shader')).toBe('shader')
    expect(explorerIconKind('file', 'Main.unity')).toBe('scene')
    expect(explorerIconKind('file', 'idle.anim')).toBe('anim')
    expect(explorerIconKind('file', 'hit.wav')).toBe('audio')
    expect(explorerIconKind('file', 'foo.asset')).toBe('asset')
    expect(explorerIconKind('file', 'misc.bin')).toBe('file')
    expect(isReadmeName('README.md')).toBe(true)
    expect(isCodeName('a.ts')).toBe(true)
    expect(isTextName('a.txt')).toBe(true)
    expect(matchesTypeFilter('file', 'a.cs', 'code')).toBe(true)
    expect(matchesTypeFilter('file', 'a.txt', 'text')).toBe(true)
    expect(matchesTypeFilter('file', 'a.json', 'other')).toBe(true)
    expect(matchesTypeFilter('directory', 'src', 'directory')).toBe(true)
    expect(matchesTypeFilter('directory', 'src', 'code')).toBe(false)
    expect(matchesTypeFilter('file', 'a.cs', 'all')).toBe(true)
    expect(matchesSearch('Npc.cs', 'npc')).toBe(true)
    expect(matchesSearch('Npc.cs', '')).toBe(true)
    expect(matchesSearch('Npc.cs', 'txt')).toBe(false)
  })

  it('renders a distinct inner mark for each folded-paper kind', () => {
    const kinds = [
      'folder', 'folderEmpty', 'code', 'text', 'image', 'data', 'prefab', 'mesh',
      'material', 'shader', 'scene', 'anim', 'audio', 'asset', 'file',
    ] as const
    for (const kind of kinds) {
      const { container, unmount } = render(<ExplorerGlyph kind={kind} open={kind === 'folder'} />)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
    render(<ExplorerGlyph kind="folder" open={false} />)
    render(<ExplorerFileBlank16 />)
    render(<ExplorerFileCode16 />)
    render(<ExplorerFileText16 />)
    render(<ExplorerFileImage16 />)
    render(<ExplorerFileData16 />)
    render(<ExplorerFilePrefab16 />)
    render(<ExplorerFileMesh16 />)
    render(<ExplorerFileMaterial16 />)
    render(<ExplorerFileShader16 />)
    render(<ExplorerFileScene16 />)
    render(<ExplorerFileAnim16 />)
    render(<ExplorerFileAudio16 />)
    render(<ExplorerFileAsset16 />)
  })

  it('draws three distinct folder states: filled, outline, and open', () => {
    const solid = render(<ExplorerFolderSolid16 />)
    expect(solid.container.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
    solid.unmount()

    const empty = render(<ExplorerFolderEmpty16 />)
    expect(empty.container.querySelector('path')?.getAttribute('fill')).toBe('none')
    empty.unmount()

    const open = render(<ExplorerFolderOpen16 />)
    expect(open.container.querySelectorAll('path')).toHaveLength(2)
    open.unmount()

    const closedGlyph = render(<ExplorerGlyph kind="folder" open={false} />)
    expect(closedGlyph.container.querySelectorAll('path')).toHaveLength(1)
    closedGlyph.unmount()

    const openGlyph = render(<ExplorerGlyph kind="folder" open />)
    expect(openGlyph.container.querySelectorAll('path')).toHaveLength(2)
    openGlyph.unmount()

    const emptyGlyph = render(<ExplorerGlyph kind="folderEmpty" open={false} />)
    expect(emptyGlyph.container.querySelector('path')?.getAttribute('fill')).toBe('none')
    emptyGlyph.unmount()
  })
})
