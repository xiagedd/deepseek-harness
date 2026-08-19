// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { FsEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  ExplorerPanel, allUnderWorkspace, canMoveInto, decodeExplorerDrag, dirsToReveal, encodeExplorerDrag,
  explorerIconKind, explorerTreeData, EXPLORER_DRAG_MIME, fileExtension, folderLabel, hasExplorerDrag,
  hasExplorerMatch, isDirectoryPath, isMetaFile, isSegmentName, isSelfOrDescendant, joinChild, latestMentionPath,
  parentOf, pasteTargetDir, pathSeparator, pruneNested, rangePaths, readExplorerDrag, revealOsMenuKey,
  visibleEntries, visibleTreeOrder, workspaceSolution,
  type DirState, type ExplorerPanelProps,
} from '../src/client/ExplorerPanel.tsx'
import { parseIgnore, DEFAULT_DSHIGNORE } from '../src/client/ignore.ts'
import { activeTab, createFilePreviewStore, tabOf, type FilePreviewState } from '../src/client/stores.ts'
import { zh } from '../src/client/locales.ts'

/** The preview column store this tree writes into (the panel itself renders no preview). */
let preview: ReturnType<ReturnType<typeof createFilePreviewStore>['create']>

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  preview = createFilePreviewStore().create()
  vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false }) as Window)
})

/** Current preview-store snapshot (the assertion surface for file clicks). */
function previewState(): FilePreviewState {
  return preview.getSnapshot()
}

const SESSION = 'session' as SessionId
const ROOT = '/ws'
const SRC = `${ROOT}/src`
const README = `${ROOT}/README.md`
const t: ExplorerPanelProps['t'] = makeTranslate(zh)

function entry(over: Partial<FsEntry> & Pick<FsEntry, 'name' | 'path' | 'type'>): FsEntry {
  return { hidden: false, ...over }
}

function listState(cwd: string | undefined): SessionListState {
  return {
    ids: [SESSION],
    byId: cwd === undefined
      ? {}
      : { [SESSION]: { id: SESSION, cwd, displayTitle: 's', blank: false, running: false, updatedAt: 0 } },
    current: SESSION,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as unknown as SessionListState
}

function emptyInput(over: { occurrences?: readonly { occurrenceId: number; clipboardText: string; invalid?: boolean }[] } = {}) {
  return {
    draft: '',
    imageIds: [],
    draftRev: 0,
    phase: 'plain' as const,
    occurrences: over.occurrences ?? [],
    queue: [],
  }
}

function props(over: Partial<ExplorerPanelProps> & {
  cwd?: string | undefined
  canOpen?: boolean
  entriesByPath?: Record<string, readonly FsEntry[]>
  mentions?: readonly { occurrenceId: number; clipboardText: string; invalid?: boolean }[]
}): ExplorerPanelProps {
  const cwd = 'cwd' in over ? over.cwd : ROOT
  const canOpen = over.canOpen ?? true
  const entriesByPath = over.entriesByPath ?? {}
  const listEntries = over.listEntries ?? vi.fn(async (path: string) => entriesByPath[path] ?? [])
  const searchEntries = over.searchEntries ?? vi.fn(async () => ({ entries: [], truncated: false }))
  const openPath = over.openPath ?? vi.fn(async () => {})
  const revealOsPath = over.revealOsPath ?? vi.fn(async () => {})
  const readText = over.readText ?? vi.fn(async (path: string) => {
    const base = path.replace(/\\/g, '/').split('/').pop()
    if (base === '.dshignore' || base === '.cursorignore' || base === '.gitignore') throw new Error('missing ignore')
    return 'preview body'
  })
  const writeText = over.writeText ?? vi.fn(async () => {})
  const mkdir = over.mkdir ?? vi.fn(async () => {})
  const rename = over.rename ?? vi.fn(async () => {})
  const copy = over.copy ?? vi.fn(async () => {})
  const deletePath = over.delete ?? vi.fn(async () => {})
  const mentions = over.mentions
  const state = listState(cwd)
  const treeBuckets = new Map<string, { expanded: string[]; previewPaths: string[]; activePath: string }>()
  return {
    sessionId: SESSION,
    useSessions: (select: (snapshot: SessionListState) => unknown) => select(state),
    useWorkspaces: (select: (snapshot: { items: { path: string }[]; phase: string }) => unknown) => select({
      items: cwd !== undefined ? [{ path: cwd }] : [],
      phase: 'ready',
    }),
    useInput: over.useInput ?? ((select: (snapshot: ReturnType<typeof emptyInput>) => unknown) => (
      select(emptyInput({ occurrences: mentions }))
    )),
    listEntries,
    searchEntries,
    openPath,
    revealOsPath,
    readText,
    writeText,
    mkdir,
    rename,
    copy,
    delete: deletePath,
    insertWorkspaceReference: over.insertWorkspaceReference ?? vi.fn(() => true),
    openPreview: over.openPreview ?? vi.fn(),
    treeBucket: over.treeBucket ?? ((key: string) => treeBuckets.get(key) ?? {
      expanded: [], previewPaths: [], activePath: '',
    }),
    persistExpanded: over.persistExpanded ?? ((key: string, expanded: readonly string[]) => {
      const prev = treeBuckets.get(key) ?? { expanded: [], previewPaths: [], activePath: '' }
      treeBuckets.set(key, { ...prev, expanded: [...expanded] })
    }),
    persistPreviewTabs: over.persistPreviewTabs ?? ((key: string, paths: readonly string[], activePath: string) => {
      const prev = treeBuckets.get(key) ?? { expanded: [], previewPaths: [], activePath: '' }
      treeBuckets.set(key, { ...prev, previewPaths: [...paths], activePath })
    }),
    retainExplorerKeys: over.retainExplorerKeys ?? vi.fn(),
    useCanOpenPath: (select: (open: boolean) => unknown) => select(canOpen),
    useRevealRequest: over.useRevealRequest ?? ((select: (request: undefined) => unknown) => select(undefined)),
    useStore: (select: (state: FilePreviewState) => unknown) => select(preview.getSnapshot()),
    actions: preview.actions,
    t,
    ...over,
  } as unknown as ExplorerPanelProps
}

describe('folderLabel / visibleEntries', () => {
  it('takes the basename across separators and keeps a root path', () => {
    expect(folderLabel('/ws/app')).toBe('app')
    expect(folderLabel('/ws/app/')).toBe('app')
    expect(folderLabel('C:\\ws\\app')).toBe('app')
    expect(folderLabel('/')).toBe('/')
  })

  it('joins, splits, and validates host path segments', () => {
    expect(pathSeparator('/ws/app')).toBe('/')
    expect(pathSeparator('C:\\ws\\app')).toBe('\\')
    expect(joinChild('/ws', 'lib')).toBe('/ws/lib')
    expect(joinChild('/ws/', 'lib')).toBe('/ws/lib')
    expect(joinChild('C:\\ws', 'lib')).toBe('C:\\ws\\lib')
    expect(joinChild('C:\\', 'lib')).toBe('C:\\lib')
    expect(parentOf('/ws/app')).toBe('/ws')
    expect(parentOf('/ws')).toBe('/')
    expect(parentOf('/')).toBe('/')
    expect(parentOf('/ws/app/')).toBe('/ws')
    expect(parentOf('C:\\ws\\app')).toBe('C:\\ws')
    expect(parentOf('C:\\ws')).toBe('C:\\')
    expect(parentOf('C:\\')).toBe('C:\\')
    expect(parentOf('relative')).toBe('relative')
    expect(isSelfOrDescendant('/ws/src', '/ws')).toBe(true)
    expect(isSelfOrDescendant('/ws', '/ws')).toBe(true)
    expect(isSelfOrDescendant('/ws-extra', '/ws')).toBe(false)
    expect(isSelfOrDescendant('C:\\ws\\src', 'C:\\ws\\')).toBe(true)
    expect(isSegmentName('lib')).toBe(true)
    expect(isSegmentName('  ')).toBe(false)
    expect(isSegmentName('.')).toBe(false)
    expect(isSegmentName('..')).toBe(false)
    expect(isSegmentName('a/b')).toBe(false)
    expect(isSegmentName('a\\b')).toBe(false)
    expect(dirsToReveal('/ws', '/ws/src/lib/a.ts')).toEqual(['/ws', '/ws/src', '/ws/src/lib'])
    expect(dirsToReveal('/ws', '/ws')).toEqual(['/ws'])
    expect(dirsToReveal('/ws', '/other/a.ts')).toEqual([])
    expect(dirsToReveal('/ws/', '/ws/a')).toEqual(['/ws'])
    expect(dirsToReveal('C:\\ws', 'C:\\ws\\src\\a.ts')).toEqual(['C:\\ws', 'C:\\ws\\src'])
    expect(latestMentionPath('/ws', [
      { occurrenceId: 1, clipboardText: '/skill' },
      { occurrenceId: 4, clipboardText: '' },
      { occurrenceId: 2, clipboardText: '/ws/src/a.ts' },
      { occurrenceId: 1, clipboardText: '/ws/older.ts' },
      { occurrenceId: 3, clipboardText: '/ws/README.md', invalid: true },
    ])).toBe('/ws/src/a.ts')
    expect(latestMentionPath(undefined, [{ occurrenceId: 1, clipboardText: '/ws/a.ts' }])).toBeUndefined()
    expect(latestMentionPath('/ws', [])).toBeUndefined()
    const listed: DirState = {
      status: 'ready',
      entries: [
        entry({ name: 'src', path: '/ws/src', type: 'directory' }),
        entry({ name: 'a.ts', path: '/ws/a.ts', type: 'file' }),
      ],
    }
    const nested: DirState = {
      status: 'ready',
      entries: [entry({ name: 'b.ts', path: '/ws/src/b.ts', type: 'file' })],
    }
    expect(visibleTreeOrder('/ws', { '/ws': listed, '/ws/src': nested }, new Set(['/ws', '/ws/src'])))
      .toEqual(['/ws', '/ws/src', '/ws/src/b.ts', '/ws/a.ts'])
    expect(visibleTreeOrder('/ws', { '/ws': { status: 'loading' } }, new Set(['/ws']))).toEqual(['/ws'])
    expect(visibleTreeOrder('/ws', { '/ws': { status: 'error', message: 'x' } }, new Set(['/ws']))).toEqual(['/ws'])
    expect(visibleTreeOrder('/ws', {}, new Set(['/ws']))).toEqual(['/ws'])
    expect(visibleTreeOrder('/ws', { '/ws': listed }, new Set())).toEqual(['/ws'])
    expect(rangePaths(['/a', '/b', '/c'], '/a', '/c')).toEqual(['/a', '/b', '/c'])
    expect(rangePaths(['/a', '/b', '/c'], '/c', '/a')).toEqual(['/a', '/b', '/c'])
    expect(rangePaths(['/a', '/b'], '/missing', '/b')).toEqual(['/b'])
    expect(rangePaths(['/a', '/b'], '/a', '/missing')).toEqual(['/missing'])
    expect(pruneNested(['/ws/src/a.ts', '/ws/src', '/ws/b.ts'])).toEqual(['/ws/src', '/ws/b.ts'])
    expect(pruneNested(['/ws/a.ts'])).toEqual(['/ws/a.ts'])
    expect(isDirectoryPath('/ws', '/ws', {})).toBe(true)
    expect(isDirectoryPath('/ws/src', '/ws', { '/ws': listed })).toBe(true)
    expect(isDirectoryPath('/ws/a.ts', '/ws', { '/ws': listed })).toBe(false)
    expect(isDirectoryPath('/ws/missing', '/ws', { '/ws': listed })).toBe(false)
    expect(isDirectoryPath('/ws/src', '/ws', { '/ws': { status: 'loading' } })).toBe(false)
    expect(isDirectoryPath('/ws/src', '/ws', {})).toBe(false)
    expect(pasteTargetDir('/ws', '/ws/src', { '/ws': listed })).toBe('/ws/src')
    expect(pasteTargetDir('/ws', '/ws/a.ts', { '/ws': listed })).toBe('/ws')
    expect(pasteTargetDir('/ws', undefined, { '/ws': listed })).toBe('/ws')
    expect(EXPLORER_DRAG_MIME).toBe('application/x-dsh-explorer-paths')
    expect(hasExplorerDrag(undefined)).toBe(false)
    expect(hasExplorerDrag(null)).toBe(false)
    expect(hasExplorerDrag(['Files'])).toBe(false)
    expect(hasExplorerDrag([EXPLORER_DRAG_MIME])).toBe(true)
    expect(hasExplorerDrag({ contains: (type: string) => type === EXPLORER_DRAG_MIME })).toBe(true)
    expect(hasExplorerDrag({ contains: () => false })).toBe(false)
    expect(decodeExplorerDrag('')).toBeNull()
    expect(decodeExplorerDrag('{')).toBeNull()
    expect(decodeExplorerDrag('[]')).toBeNull()
    expect(decodeExplorerDrag('null')).toBeNull()
    expect(decodeExplorerDrag('[{"path":1,"name":"a"}]')).toBeNull()
    expect(decodeExplorerDrag('[{"path":"","name":"a"}]')).toBeNull()
    expect(decodeExplorerDrag('[{"path":"/ws/a.ts"}]')).toBeNull()
    expect(decodeExplorerDrag('[null]')).toBeNull()
    expect(encodeExplorerDrag([{ path: '/ws/src/a.ts', name: 'a.ts' }, { path: '/ws/src', name: 'src' }]))
      .toBe(JSON.stringify([{ path: '/ws/src/a.ts', name: 'a.ts' }, { path: '/ws/src', name: 'src' }]))
    expect(decodeExplorerDrag(JSON.stringify([
      { path: '/ws/src/a.ts', name: 'a.ts' },
      { path: '/ws/src', name: 'src' },
    ]))).toEqual([{ path: '/ws/src', name: 'src' }])
    expect(canMoveInto('/ws/src', [{ path: '/ws/README.md' }])).toBe(true)
    expect(canMoveInto('/ws/src', [{ path: '/ws/src' }])).toBe(false)
    expect(canMoveInto('/ws/src/inner', [{ path: '/ws/src' }])).toBe(false)
    expect(canMoveInto('/ws/src', [])).toBe(false)
    expect(allUnderWorkspace('/ws', ['/ws', '/ws/src'])).toBe(true)
    expect(allUnderWorkspace('/ws', ['/ws/src', '/tmp/a.ts'])).toBe(false)
    expect(readExplorerDrag(null)).toBeNull()
    expect(readExplorerDrag({
      types: ['Files'],
      getData: () => '',
    } as unknown as DataTransfer)).toBeNull()
    expect(readExplorerDrag({
      types: [EXPLORER_DRAG_MIME],
      getData: () => { throw new Error('no html5') },
    } as unknown as DataTransfer)).toBeNull()
  })

  it('hides hidden rows and .meta files, keeps .meta directories, directories first, then name', () => {
    expect(isMetaFile(entry({ name: 'Foo.cs.meta', path: '/Foo.cs.meta', type: 'file' }))).toBe(true)
    expect(isMetaFile(entry({ name: 'Foo.META', path: '/Foo.META', type: 'other' }))).toBe(true)
    expect(isMetaFile(entry({ name: 'Foo.meta', path: '/Foo.meta', type: 'directory' }))).toBe(false)
    expect(visibleEntries([
      entry({ name: 'z.ts', path: '/z.ts', type: 'file' }),
      entry({ name: '.git', path: '/.git', type: 'directory', hidden: true }),
      entry({ name: 'b', path: '/b', type: 'directory' }),
      entry({ name: 'a', path: '/a', type: 'directory' }),
      entry({ name: 'readme', path: '/readme', type: 'other' }),
      entry({ name: 'Foo.cs.meta', path: '/Foo.cs.meta', type: 'file' }),
      entry({ name: 'Empty.meta', path: '/Empty.meta', type: 'directory' }),
    ]).map(item => item.name)).toEqual(['a', 'b', 'Empty.meta', 'readme', 'z.ts'])
  })

  it('maps explorer glyphs by folder emptiness and file extension', () => {
    expect(fileExtension('Foo.cs')).toBe('cs')
    expect(fileExtension('.env')).toBe('')
    expect(fileExtension('file.')).toBe('')
    expect(fileExtension('notes')).toBe('')
    expect(fileExtension('a.b.c')).toBe('c')
    expect(explorerIconKind('directory', 'src')).toBe('folder')
    expect(explorerIconKind('directory', 'empty', true)).toBe('folderEmpty')
    expect(explorerIconKind('file', 'Npc.cs')).toBe('code')
    expect(explorerIconKind('file', 'notes.txt')).toBe('text')
    expect(explorerIconKind('file', 'README.md')).toBe('text')
    expect(explorerIconKind('file', 'shot.png')).toBe('image')
    expect(explorerIconKind('file', 'albedo.tga')).toBe('image')
    expect(explorerIconKind('file', 'cfg.json')).toBe('data')
    expect(explorerIconKind('file', 'scene.yaml')).toBe('data')
    expect(explorerIconKind('file', 'Hero.prefab')).toBe('prefab')
    expect(explorerIconKind('file', 'body.fbx')).toBe('mesh')
    expect(explorerIconKind('file', 'skin.mat')).toBe('material')
    expect(explorerIconKind('file', 'lit.shader')).toBe('shader')
    expect(explorerIconKind('file', 'Main.unity')).toBe('scene')
    expect(explorerIconKind('file', 'idle.anim')).toBe('anim')
    expect(explorerIconKind('file', 'README')).toBe('text')
    expect(explorerIconKind('file', 'empty.cs', false, 0)).toBe('file')
    expect(explorerIconKind('file', 'notes')).toBe('file')
  })

  it('builds arborist rows for loading, error, empty, and listed folders', () => {
    const loading = explorerTreeData('/ws', {}, new Set(['/ws']), t)
    expect(loading[0]).toMatchObject({ id: '/ws', kind: 'directory' })
    expect(loading[0]!.children).toEqual([{ id: '/ws::__loading', name: zh.loading, kind: 'status' }])
    expect(explorerTreeData('/ws', { '/ws': { status: 'error', message: '' } }, new Set(['/ws']), t)[0]!.children)
      .toEqual([{ id: '/ws::__error', name: zh.error, kind: 'status' }])
    expect(explorerTreeData('/ws', { '/ws': { status: 'ready', entries: [] } }, new Set(['/ws']), t)[0])
      .toMatchObject({ empty: true })
    expect(explorerTreeData('/ws', { '/ws': { status: 'ready', entries: [] } }, new Set(['/ws']), t)[0]!.children)
      .toBeUndefined()
    expect(explorerTreeData('/ws', {
      '/ws': {
        status: 'ready',
        entries: [entry({ name: 'Foo.cs.meta', path: '/ws/Foo.cs.meta', type: 'file' })],
      },
    }, new Set(['/ws']), t)[0]).toMatchObject({ empty: true })
    const listed = explorerTreeData('/ws', {
      '/ws': {
        status: 'ready',
        entries: [
          entry({ name: 'src', path: '/ws/src', type: 'directory' }),
          entry({ name: 'a.ts', path: '/ws/a.ts', type: 'file' }),
        ],
      },
    }, new Set(['/ws']), t)
    expect(listed[0]!.children?.map(row => row.id)).toEqual(['/ws/src', '/ws/a.ts'])
    expect(listed[0]!.children?.[0]).toMatchObject({ kind: 'directory', children: [] })
    expect(hasExplorerMatch('/ws', {
      '/ws': { status: 'ready', entries: [entry({ name: 'a.ts', path: '/ws/a.ts', type: 'file' })] },
    }, new Set(['/ws']), 'a.ts', 'code')).toBe(true)
    expect(hasExplorerMatch('/ws', {
      '/ws': { status: 'ready', entries: [entry({ name: 'a.ts', path: '/ws/a.ts', type: 'file' })] },
    }, new Set(['/ws']), 'zzz', 'all')).toBe(false)
    const ignored = parseIgnore(DEFAULT_DSHIGNORE)
    expect(visibleEntries([
      entry({ name: 'Library', path: '/ws/Library', type: 'directory' }),
      entry({ name: 'a.ts', path: '/ws/a.ts', type: 'file' }),
    ], { root: '/ws', ignore: ignored }).map(item => item.name)).toEqual(['a.ts'])
  })

  it('picks the root solution named after the workspace, else the first by name', () => {
    const listed = (entries: readonly FsEntry[]): Record<string, DirState> => ({
      [ROOT]: { status: 'ready', entries },
    })
    expect(workspaceSolution(ROOT, listed([
      entry({ name: 'Tools.sln', path: `${ROOT}/Tools.sln`, type: 'file' }),
      entry({ name: 'ws.sln', path: `${ROOT}/ws.sln`, type: 'file' }),
      entry({ name: 'Foo.cs', path: `${ROOT}/Foo.cs`, type: 'file' }),
    ]))).toBe(`${ROOT}/ws.sln`)
    expect(workspaceSolution(ROOT, listed([
      entry({ name: 'Zed.sln', path: `${ROOT}/Zed.sln`, type: 'file' }),
      entry({ name: 'Alt.sln', path: `${ROOT}/Alt.sln`, type: 'file' }),
      entry({ name: 'Nested.sln', path: `${ROOT}/Nested.sln`, type: 'directory' }),
    ]))).toBe(`${ROOT}/Alt.sln`)
    expect(workspaceSolution(ROOT, listed([entry({ name: 'Foo.cs', path: `${ROOT}/Foo.cs`, type: 'file' })])))
      .toBeUndefined()
    expect(workspaceSolution(undefined, listed([]))).toBeUndefined()
    expect(workspaceSolution(ROOT, {})).toBeUndefined()
    expect(workspaceSolution(ROOT, { [ROOT]: { status: 'loading' } })).toBeUndefined()
  })
})

describe('ExplorerPanel', () => {
  it('shows an empty workspace state when the session has no cwd', () => {
    render(<ExplorerPanel {...props({ cwd: undefined })} />)
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()
    expect(screen.queryByLabelText(zh['preview.aria'])).toBeNull()
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['refresh.aria'] })).toBeNull()
    expect(screen.queryByRole('treeitem', { current: true })).toBeNull()
  })

  it('hydrates expanded folders from the browse bucket and re-lists each path', async () => {
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [entry({ name: 'src', path: SRC, type: 'directory' })]
      }
      if (path === SRC) {
        return [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })]
      }
      return []
    })
    const persistExpanded = vi.fn()
    render(<ExplorerPanel {...props({
      listEntries,
      treeBucket: () => ({
        expanded: [ROOT, SRC],
        previewPaths: [],
        activePath: '',
      }),
      persistExpanded,
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    expect(listEntries).toHaveBeenCalledWith(ROOT, expect.any(AbortSignal))
    expect(listEntries).toHaveBeenCalledWith(SRC, expect.any(AbortSignal))
    expect(screen.getByRole('treeitem', { name: '折叠 src' })).toBeTruthy()
  })

  it('silently drops a stale expanded path and a missing preview tab on hydrate', async () => {
    const gone = `${ROOT}/gone`
    const missingFile = `${ROOT}/missing.ts`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [entry({ name: 'README.md', path: README, type: 'file' })]
      }
      if (path === gone) throw new Error('ENOENT')
      return []
    })
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      if (path === missingFile) throw new Error('ENOENT')
      return 'ok'
    })
    const persistExpanded = vi.fn()
    const openPreview = vi.fn()
    render(<ExplorerPanel {...props({
      listEntries,
      readText,
      openPreview,
      treeBucket: () => ({
        expanded: [ROOT, gone],
        previewPaths: [missingFile, README],
        activePath: README,
      }),
      persistExpanded,
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    expect(screen.queryByRole('treeitem', { name: /gone/ })).toBeNull()
    await waitFor(() => {
      expect(previewState().tabs.map(tab => tab.path)).toEqual([README])
      expect(previewState().activePath).toBe(README)
    })
    expect(openPreview).toHaveBeenCalled()
    expect(tabOf(previewState(), README)?.content).toBe('ok')
  })

  it('lists the workspace root, hides hidden and .meta files, and writes the click into the preview store', async () => {
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      return '# readme'
    })
    const opened = vi.spyOn(window, 'open')
    render(<ExplorerPanel {...props({
      readText,
      entriesByPath: {
        [ROOT]: [
          entry({ name: '.env', path: `${ROOT}/.env`, type: 'file', hidden: true }),
          entry({ name: 'README.md', path: `${ROOT}/README.md`, type: 'file' }),
          entry({ name: 'Foo.cs.meta', path: `${ROOT}/Foo.cs.meta`, type: 'file' }),
          entry({ name: 'src', path: `${ROOT}/src`, type: 'directory' }),
        ],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    expect(screen.getByRole('treeitem', { name: '折叠 ws' })).toBeTruthy()
    expect(screen.getByText(zh['search.scope'])).toBeTruthy()
    expect(screen.queryByText('.env')).toBeNull()
    expect(screen.queryByText('Foo.cs.meta')).toBeNull()
    expect(screen.getByRole('treeitem', { name: '打开 README.md' }).getAttribute('data-icon')).toBe('text')
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
    await waitFor(() => { expect(activeTab(previewState())?.content).toBe('# readme') })
    expect(readText).toHaveBeenCalledWith(`${ROOT}/README.md`)
    expect(previewState().activePath).toBe(`${ROOT}/README.md`)
    // The tree column keeps no preview of its own — the layout preview seat renders it.
    expect(screen.queryByLabelText(zh['preview.aria'])).toBeNull()
    expect(screen.queryByText('# readme')).toBeNull()
    expect(opened).not.toHaveBeenCalled()
  })

  it('uses distinct glyphs for code, text, image, data, and other files', async () => {
    render(<ExplorerPanel {...props({
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'Npc.cs', path: `${ROOT}/Npc.cs`, type: 'file' }),
          entry({ name: 'notes.txt', path: `${ROOT}/notes.txt`, type: 'file' }),
          entry({ name: 'shot.png', path: `${ROOT}/shot.png`, type: 'file' }),
          entry({ name: 'cfg.json', path: `${ROOT}/cfg.json`, type: 'file' }),
          entry({ name: 'misc.bin', path: `${ROOT}/misc.bin`, type: 'file' }),
          entry({ name: 'Hero.prefab', path: `${ROOT}/Hero.prefab`, type: 'file' }),
          entry({ name: 'body.fbx', path: `${ROOT}/body.fbx`, type: 'file' }),
          entry({ name: 'skin.mat', path: `${ROOT}/skin.mat`, type: 'file' }),
          entry({ name: 'src', path: SRC, type: 'directory' }),
        ],
        [SRC]: [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 Npc.cs' })).toBeTruthy() })
    expect(screen.getByRole('treeitem', { name: '打开 Npc.cs' }).getAttribute('data-icon')).toBe('code')
    expect(screen.getByRole('treeitem', { name: '打开 notes.txt' }).getAttribute('data-icon')).toBe('text')
    expect(screen.getByRole('treeitem', { name: '打开 shot.png' }).getAttribute('data-icon')).toBe('image')
    expect(screen.getByRole('treeitem', { name: '打开 cfg.json' }).getAttribute('data-icon')).toBe('data')
    expect(screen.getByRole('treeitem', { name: '打开 misc.bin' }).getAttribute('data-icon')).toBe('file')
    expect(screen.getByRole('treeitem', { name: '打开 Hero.prefab' }).getAttribute('data-icon')).toBe('prefab')
    expect(screen.getByRole('treeitem', { name: '打开 body.fbx' }).getAttribute('data-icon')).toBe('mesh')
    expect(screen.getByRole('treeitem', { name: '打开 skin.mat' }).getAttribute('data-icon')).toBe('material')
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    expect(src.getAttribute('data-icon')).toBe('folder')
    fireEvent.click(src)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    expect(screen.getByRole('treeitem', { name: '折叠 src' }).getAttribute('data-icon')).toBe('folder')
  })

  it('keeps a tab per file and activates the later click while both reads are in flight', async () => {
    let resolveFirst: ((value: string) => void) | undefined
    let resolveSecond: ((value: string) => void) | undefined
    const readText = vi.fn((path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) return Promise.reject(new Error('missing ignore'))
      return new Promise<string>((resolve) => {
        if (path.endsWith('a.txt')) resolveFirst = resolve
        else resolveSecond = resolve
      })
    })
    const opened = vi.spyOn(window, 'open')
    render(<ExplorerPanel {...props({
      readText,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'a.txt', path: `${ROOT}/a.txt`, type: 'file' }),
          entry({ name: 'b.txt', path: `${ROOT}/b.txt`, type: 'file' }),
        ],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.txt' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.txt' }))
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 b.txt' }))
    expect(previewState().tabs.map(tab => tab.path)).toEqual([`${ROOT}/a.txt`, `${ROOT}/b.txt`])
    expect(previewState().activePath).toBe(`${ROOT}/b.txt`)
    await act(async () => { resolveFirst?.('background-a') })
    expect(tabOf(previewState(), `${ROOT}/a.txt`)?.content).toBe('background-a')
    expect(previewState().activePath).toBe(`${ROOT}/b.txt`)
    await act(async () => { resolveSecond?.('fresh-b') })
    await waitFor(() => { expect(activeTab(previewState())?.content).toBe('fresh-b') })
    expect(opened).not.toHaveBeenCalled()
  })

  it('drops a stale preview after the workspace changes', async () => {
    let resolveRead: ((value: string) => void) | undefined
    let rejectRead: ((reason: unknown) => void) | undefined
    const readText = vi.fn((path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) return Promise.reject(new Error('missing ignore'))
      return new Promise<string>((resolve, reject) => {
        resolveRead = resolve
        rejectRead = reject
      })
    })
    const opened = vi.fn(() => ({ closed: false }) as Window)
    vi.spyOn(window, 'open').mockImplementation(opened)
    const { rerender } = render(<ExplorerPanel {...props({
      readText,
      entriesByPath: { [ROOT]: [entry({ name: 'a.txt', path: `${ROOT}/a.txt`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.txt' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.txt' }))
    expect(previewState().tabs).toHaveLength(1)
    rerender(<ExplorerPanel {...props({ cwd: undefined, readText })} />)
    expect(previewState()).toMatchObject({ tabs: [], activePath: '' })
    await act(async () => { resolveRead?.('late-preview') })
    expect(previewState().tabs).toHaveLength(0)
    expect(opened).not.toHaveBeenCalled()
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()

    cleanup()
    const second = render(<ExplorerPanel {...props({
      readText,
      entriesByPath: { [ROOT]: [entry({ name: 'a.txt', path: `${ROOT}/a.txt`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.txt' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.txt' }))
    second.rerender(<ExplorerPanel {...props({ cwd: undefined, readText })} />)
    await act(async () => { rejectRead?.(new Error('late-error')) })
    expect(previewState()).toMatchObject({ tabs: [], activePath: '' })
  })

  it('probes an unexpanded folder for its empty glyph, then marks it a leaf on expand', async () => {
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'empty', path: `${ROOT}/empty`, type: 'directory' })]
      return []
    })
    render(<ExplorerPanel {...props({ listEntries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 empty' })).toBeTruthy() })
    // The background probe lists the collapsed child once so its glyph reads
    // empty before the user opens it, while it stays a normal expandable row.
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: '展开 empty' }).getAttribute('data-icon')).toBe('folderEmpty')
    })
    expect(listEntries).toHaveBeenCalledWith(`${ROOT}/empty`, expect.anything())
    const probedRow = screen.getByRole('treeitem', { name: '展开 empty' })
    expect(probedRow.getAttribute('data-empty')).toBeNull()
    expect(probedRow.getAttribute('aria-expanded')).toBe('false')
    // Expanding lists the level for real and marks the structural empty leaf.
    fireEvent.click(probedRow)
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const emptyRow = screen.getByRole('treeitem', { name: '展开 empty' })
    expect(emptyRow.getAttribute('data-empty')).toBe('')
    expect(emptyRow.getAttribute('data-icon')).toBe('folderEmpty')
    expect(emptyRow.getAttribute('aria-expanded')).toBeNull()
    expect(emptyRow.querySelector('[data-icon="folderEmpty"]')).toBeTruthy()
    expect(emptyRow.textContent).toBe('empty')
    expect(emptyRow.querySelector('svg')).toBeTruthy()
    expect(emptyRow.querySelectorAll('svg')).toHaveLength(1)
    const settled = listEntries.mock.calls.length
    fireEvent.click(emptyRow)
    expect(listEntries.mock.calls.length).toBe(settled)
    expect(document.querySelector('[data-empty]')).toBeTruthy()
  })

  it('keeps the expanded folder in view instead of scrolling back to a stale reveal', async () => {
    // jsdom implements no scrollIntoView, so the reveal target only becomes observable once one is installed.
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      render(<ExplorerPanel {...props({
        entriesByPath: {
          [ROOT]: [
            entry({ name: 'README.md', path: README, type: 'file' }),
            entry({ name: 'src', path: SRC, type: 'directory' }),
          ],
          [SRC]: [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })],
        },
      })} />)
      await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
      fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
      await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md', current: true })).toBeTruthy() })
      await waitFor(() => { expect(scrollIntoView).toHaveBeenCalled() })
      const revealScrolls = scrollIntoView.mock.calls.length
      // Expanding an unrelated folder rebuilds the row list; the resolved reveal
      // must stay locked so the viewport is not yanked back to README.
      fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
      await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
      expect(scrollIntoView.mock.calls.length).toBe(revealScrolls)
      expect(screen.getByRole('treeitem', { name: '打开 README.md', current: true })).toBeTruthy()
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    }
  })

  it('shows filled, outline, and open folder glyphs across the three states', async () => {
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [
          entry({ name: 'full', path: `${ROOT}/full`, type: 'directory' }),
          entry({ name: 'hollow', path: `${ROOT}/hollow`, type: 'directory' }),
        ]
      }
      if (path === `${ROOT}/full`) return [entry({ name: 'a.ts', path: `${ROOT}/full/a.ts`, type: 'file' })]
      return []
    })
    render(<ExplorerPanel {...props({ listEntries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 full' })).toBeTruthy() })
    // Probing resolves emptiness before expansion: filled for content, outline for empty.
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: '展开 hollow' }).getAttribute('data-icon')).toBe('folderEmpty')
    })
    const full = screen.getByRole('treeitem', { name: '展开 full' })
    expect(full.getAttribute('data-icon')).toBe('folder')
    expect(full.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('treeitem', { name: '展开 hollow' }).getAttribute('data-empty')).toBeNull()
    fireEvent.click(full)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    const opened = screen.getByRole('treeitem', { name: '折叠 full' })
    expect(opened.getAttribute('data-icon')).toBe('folder')
    expect(opened.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps a folder filled while its emptiness is still unknown', async () => {
    const listEntries = vi.fn((path: string) => {
      if (path === ROOT) return Promise.resolve([entry({ name: 'pending', path: `${ROOT}/pending`, type: 'directory' })])
      return new Promise<readonly FsEntry[]>(() => {})
    })
    render(<ExplorerPanel {...props({ listEntries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 pending' })).toBeTruthy() })
    expect(screen.getByRole('treeitem', { name: '展开 pending' }).getAttribute('data-icon')).toBe('folder')
  })

  it('shows a listing error and retries on the next expand', async () => {
    // The background probe consumes the collapsed child's first listing, so the
    // child fails on its probe and its first real expand, then succeeds on retry.
    let rootAttempts = 0
    let srcAttempts = 0
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        rootAttempts++
        if (rootAttempts === 1) throw new Error('denied')
        return [entry({ name: 'src', path: `${ROOT}/src`, type: 'directory' })]
      }
      if (path === `${ROOT}/src`) {
        srcAttempts++
        if (srcAttempts <= 2) throw new Error('boom')
        return []
      }
      return []
    })
    render(<ExplorerPanel {...props({ listEntries })} />)
    await waitFor(() => { expect(screen.getByText('denied')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '折叠 ws' }))
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 ws' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByText('boom')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '折叠 src' }))
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
  })

  it('still previews when canOpenPath is false, and surfaces readText failures', async () => {
    const openPath = vi.fn(async () => {})
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      return 'body'
    })
    const opened = vi.fn(() => ({ closed: false }) as Window)
    vi.spyOn(window, 'open').mockImplementation(opened)
    const { rerender } = render(<ExplorerPanel {...props({
      canOpen: false,
      openPath,
      readText,
      entriesByPath: { [ROOT]: [entry({ name: 'a.ts', path: `${ROOT}/a.ts`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    expect(screen.getAllByText(zh['open.unavailable']).length).toBeGreaterThan(0)
    expect(screen.getByRole('treeitem', { name: '打开 a.ts' }).getAttribute('data-icon')).toBe('code')
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.ts' }))
    await waitFor(() => { expect(readText).toHaveBeenCalledWith(`${ROOT}/a.ts`) })
    expect(openPath).not.toHaveBeenCalled()
    await waitFor(() => { expect(activeTab(previewState())?.content).toBe('body') })
    expect(opened).not.toHaveBeenCalled()

    const failing = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      throw new Error('os refused')
    })
    rerender(<ExplorerPanel {...props({
      canOpen: true,
      readText: failing,
      entriesByPath: { [ROOT]: [entry({ name: 'a.ts', path: `${ROOT}/a.ts`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.ts' }))
    await waitFor(() => { expect(activeTab(previewState())?.message).toBe('os refused') })

    const failingString = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      throw 'nope'
    })
    rerender(<ExplorerPanel {...props({
      canOpen: true,
      readText: failingString,
      entriesByPath: { [ROOT]: [entry({ name: 'a.ts', path: `${ROOT}/a.ts`, type: 'other' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.ts' }))
    await waitFor(() => { expect(activeTab(previewState())?.message).toBe('nope') })
  })

  it('ignores aborted listings on unmount and when the workspace disappears', async () => {
    let rejectList: ((reason: unknown) => void) | undefined
    const listEntries = vi.fn((_path: string, signal?: AbortSignal) => new Promise<readonly FsEntry[]>((_resolve, reject) => {
      rejectList = reject
      signal?.addEventListener('abort', () => {
        const error = new DOMException('aborted', 'AbortError')
        reject(error)
      })
    }))
    const view = render(<ExplorerPanel {...props({ listEntries })} />)
    await waitFor(() => { expect(listEntries).toHaveBeenCalled() })
    view.unmount()
    await act(async () => {
      rejectList?.(new Error('late'))
    })
    expect(screen.queryByText(zh.error)).toBeNull()

    const hanging = vi.fn((_path: string, signal?: AbortSignal) => new Promise<readonly FsEntry[]>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    }))
    const { rerender } = render(<ExplorerPanel {...props({ listEntries: hanging })} />)
    await waitFor(() => { expect(hanging).toHaveBeenCalled() })
    rerender(<ExplorerPanel {...props({ cwd: undefined, listEntries: hanging })} />)
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()
  })

  it('drops a listing that settles after abort', async () => {
    let resolveList: ((entries: readonly FsEntry[]) => void) | undefined
    const listEntries = vi.fn(() => new Promise<readonly FsEntry[]>((resolve) => { resolveList = resolve }))
    const view = render(<ExplorerPanel {...props({ listEntries })} />)
    view.unmount()
    await act(async () => {
      resolveList?.([entry({ name: 'late.ts', path: `${ROOT}/late.ts`, type: 'file' })])
    })
    expect(screen.queryByText('late.ts')).toBeNull()
  })

  it('shows loading until the root listing settles', async () => {
    let resolveList: ((entries: readonly FsEntry[]) => void) | undefined
    const listEntries = vi.fn(() => new Promise<readonly FsEntry[]>((resolve) => { resolveList = resolve }))
    render(<ExplorerPanel {...props({ listEntries })} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
    await act(async () => { resolveList?.([]) })
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
  })

  it('ignores AbortError from the listing RPC', async () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    render(<ExplorerPanel {...props({ listEntries: vi.fn(async () => { throw error }) })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '折叠 ws' })).toBeTruthy() })
    expect(screen.queryByText(zh.error)).toBeNull()
  })

  it('refreshes only currently expanded directories and surfaces list errors', async () => {
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      if (path === SRC) return [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })]
      if (path === `${ROOT}/lib`) return []
      return []
    })
    render(<ExplorerPanel {...props({
      listEntries,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'src', path: SRC, type: 'directory' }),
          entry({ name: 'lib', path: `${ROOT}/lib`, type: 'directory' }),
        ],
        [SRC]: [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })],
        [`${ROOT}/lib`]: [],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    const afterExpand = listEntries.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: zh['refresh.aria'] }))
    await waitFor(() => { expect(listEntries.mock.calls.length).toBe(afterExpand + 2) })
    expect(listEntries.mock.calls.slice(afterExpand).map(call => call[0]).sort()).toEqual([ROOT, SRC])

    cleanup()
    // Root fails only on the refresh relist; the collapsed child's probe reads it empty.
    let rootAttempts = 0
    const failing = vi.fn(async (path: string) => {
      if (path === ROOT) {
        rootAttempts++
        if (rootAttempts >= 2) throw new Error('fs-failed')
        return [entry({ name: 'src', path: SRC, type: 'directory' })]
      }
      return []
    })
    render(<ExplorerPanel {...props({ listEntries: failing })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['refresh.aria'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('fs-failed') })
  })

  it('does not highlight without a path fact, then reveals a successful preview', async () => {
    render(<ExplorerPanel {...props({
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    expect(screen.queryByRole('treeitem', { current: true })).toBeNull()
    expect(screen.getByRole('button', { name: zh['refresh.aria'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: '打开 README.md', current: true })).toBeTruthy()
    })
  })

  it('opens a file with the system app from the menu', async () => {
    const openPath = vi.fn(async () => {})
    render(<ExplorerPanel {...props({
      openPath,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
    await waitFor(() => { expect(openPath).not.toHaveBeenCalled() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.openOs'] }))
    await waitFor(() => { expect(openPath).toHaveBeenCalledWith(README) })

    cleanup()
    const failing = vi.fn(async () => { throw new Error('os refused') })
    render(<ExplorerPanel {...props({
      openPath: failing,
      entriesByPath: { [ROOT]: [entry({ name: 'a.ts', path: `${ROOT}/a.ts`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 a.ts' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.openOs'] }))
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('os refused') })
  })

  it('reveals a file in the OS file manager from the menu', async () => {
    const revealOsPath = vi.fn(async () => {})
    render(<ExplorerPanel {...props({
      revealOsPath,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 2, clientY: 2 })
    const revealLabel = zh[revealOsMenuKey()]
    fireEvent.click(screen.getByRole('menuitem', { name: revealLabel }))
    await waitFor(() => { expect(revealOsPath).toHaveBeenCalledWith(README) })

    cleanup()
    const failing = vi.fn(async () => { throw new Error('reveal refused') })
    render(<ExplorerPanel {...props({
      revealOsPath: failing,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'README.md', path: README, type: 'file' }),
          entry({ name: 'src', path: `${ROOT}/src`, type: 'directory' }),
        ],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 2, clientY: 2 })
    await waitFor(() => { expect(screen.getByRole('menuitem', { name: revealLabel })).toBeTruthy() })
    fireEvent.click(screen.getByRole('menuitem', { name: revealLabel }))
    await waitFor(() => {
      expect(failing).toHaveBeenCalledWith(`${ROOT}/src`)
      expect(screen.getByRole('status').textContent).toBe('reveal refused')
    })
  })

  it('hands a double-clicked code file and the root solution to the OS opener', async () => {
    const openPath = vi.fn(async () => {})
    render(<ExplorerPanel {...props({
      openPath,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'ws.sln', path: `${ROOT}/ws.sln`, type: 'file' }),
          entry({ name: 'Foo.cs', path: `${ROOT}/Foo.cs`, type: 'file' }),
          entry({ name: 'notes.txt', path: `${ROOT}/notes.txt`, type: 'file' }),
        ],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 Foo.cs' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Foo.cs' }))
    await waitFor(() => { expect(activeTab(previewState())?.content).toBe('preview body') })
    expect(openPath).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Foo.cs' }), { detail: 2 })
    await waitFor(() => {
      expect(openPath.mock.calls.map(call => call[0])).toEqual([`${ROOT}/Foo.cs`, `${ROOT}/ws.sln`])
    })
    // A second preview read is what the OS handoff replaces.
    expect(previewState().tabs.map(tab => tab.path)).toEqual([`${ROOT}/Foo.cs`])

    fireEvent.click(screen.getByRole('treeitem', { name: '打开 notes.txt' }), { detail: 2 })
    fireEvent.click(screen.getByRole('treeitem', { name: '折叠 ws' }), { detail: 2 })
    await waitFor(() => { expect(openPath).toHaveBeenCalledTimes(2) })
  })

  it('reports a failed handoff and refuses one the Host cannot perform', async () => {
    const entries = { [ROOT]: [entry({ name: 'Foo.cs', path: `${ROOT}/Foo.cs`, type: 'file' })] }
    const solo = vi.fn(async () => {})
    render(<ExplorerPanel {...props({ openPath: solo, entriesByPath: entries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 Foo.cs' })).toBeTruthy() })
    // A workspace with no solution hands over the file alone.
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Foo.cs' }), { detail: 2 })
    await waitFor(() => { expect(solo.mock.calls.map(call => call[0])).toEqual([`${ROOT}/Foo.cs`]) })

    cleanup()
    const failing = vi.fn(async () => { throw new Error('os refused') })
    render(<ExplorerPanel {...props({ openPath: failing, entriesByPath: entries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 Foo.cs' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Foo.cs' }), { detail: 2 })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('os refused') })
    expect(failing).toHaveBeenCalledTimes(1)

    cleanup()
    const blocked = vi.fn(async () => {})
    render(<ExplorerPanel {...props({ canOpen: false, openPath: blocked, entriesByPath: entries })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 Foo.cs' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Foo.cs' }), { detail: 2 })
    await waitFor(() => { expect(screen.getAllByText(zh['open.unavailable'])).toHaveLength(2) })
    expect(blocked).not.toHaveBeenCalled()
  })

  it('does not highlight after a failed readText', async () => {
    const readText = vi.fn(async () => { throw new Error('os refused') })
    render(<ExplorerPanel {...props({
      readText,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
    await waitFor(() => { expect(activeTab(previewState())?.message).toBe('os refused') })
    expect(screen.queryByRole('treeitem', { current: true })).toBeNull()
  })

  it('reveals a composer chip under cwd and expands ancestors without crashing on a miss', async () => {
    const nested = `${SRC}/a.ts`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      if (path === SRC) return [entry({ name: 'a.ts', path: nested, type: 'file' })]
      return []
    })
    const { rerender } = render(<ExplorerPanel {...props({
      listEntries,
      mentions: [{ occurrenceId: 1, clipboardText: nested }],
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts', current: true })).toBeTruthy() })
    expect(listEntries.mock.calls.some(call => call[0] === SRC)).toBe(true)

    rerender(<ExplorerPanel {...props({
      listEntries,
      mentions: [{ occurrenceId: 4, clipboardText: SRC }],
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '折叠 src', current: true })).toBeTruthy() })

    rerender(<ExplorerPanel {...props({
      listEntries,
      mentions: [{ occurrenceId: 2, clipboardText: `${ROOT}/missing.ts` }],
    })} />)
    await waitFor(() => { expect(screen.queryByRole('treeitem', { current: true })).toBeNull() })
    expect(screen.getByRole('tree')).toBeTruthy()

    rerender(<ExplorerPanel {...props({
      listEntries,
      mentions: [{ occurrenceId: 3, clipboardText: '/outside/a.ts' }],
    })} />)
    expect(screen.queryByRole('treeitem', { current: true })).toBeNull()
  })

  it('shows the generic listing copy when the host error message is empty', async () => {
    render(<ExplorerPanel {...props({ listEntries: vi.fn(async () => { throw new Error('') }) })} />)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(zh.error) })
  })

  it('debounces whole-workspace results, highlights them, and opens the selected file tab', async () => {
    const deepFile = entry({ name: 'FooBarService.cs', path: `${ROOT}/deep/FooBarService.cs`, type: 'file' })
    const searchEntries = vi.fn(async () => ({ entries: [deepFile], truncated: true }))
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      return 'deep preview'
    })
    render(<ExplorerPanel {...props({
      searchEntries,
      readText,
      entriesByPath: { [ROOT]: [entry({ name: 'visible.txt', path: `${ROOT}/visible.txt`, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('tree')).toBeTruthy() })
    const input = screen.getByLabelText(zh['search.aria'])
    fireEvent.change(input, { target: { value: 'fbs' } })
    expect(searchEntries).not.toHaveBeenCalled()
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.getByText(zh['search.indexing'])).toBeTruthy()
    await waitFor(() => { expect(searchEntries).toHaveBeenCalledWith(ROOT, 'fbs', expect.any(AbortSignal)) })
    await waitFor(() => { expect(screen.getByText(zh['search.truncated'])).toBeTruthy() })
    expect(screen.getAllByText('F', { selector: 'mark' }).length).toBeGreaterThan(0)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(activeTab(previewState())?.content).toBe('deep preview') })
    expect(previewState().activePath).toBe(deepFile.path)
  })

  it('keeps the browsing tree intact across a search round trip', async () => {
    const nested = `${SRC}/Buff.cs`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      if (path === SRC) return [entry({ name: 'Buff.cs', path: nested, type: 'file' })]
      return []
    })
    const searchEntries = vi.fn(async () => ({
      entries: [entry({ name: 'Buff.cs', path: nested, type: 'file' })],
      truncated: false,
    }))
    const persistedSizes: number[] = []
    const persistExpanded = vi.fn((_key: string, paths: readonly string[]) => {
      persistedSizes.push(paths.length)
    })
    render(<ExplorerPanel {...props({
      listEntries,
      searchEntries,
      persistExpanded,
      treeBucket: () => ({ expanded: [ROOT, SRC], previewPaths: [], activePath: '' }),
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '折叠 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 Buff.cs' }))
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: '打开 Buff.cs' }).getAttribute('aria-selected')).toBe('true')
    })
    persistedSizes.length = 0
    const scroller = scrollerOf(screen.getByRole('tree'))
    scroller.scrollTop = 64
    fireEvent.scroll(scroller)

    const input = screen.getByLabelText(zh['search.aria'])
    fireEvent.change(input, { target: { value: 'buff' } })
    await waitFor(() => { expect(screen.getByRole('list', { name: zh['search.results.aria'] })).toBeTruthy() })
    expect(screen.queryByRole('tree')).toBeNull()
    expect(persistedSizes).not.toContain(0)
    // The browser drops a hidden box's scroll offset; a scroll seen while the
    // overlay is up must not become the remembered browsing position.
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => { expect(screen.getByRole('tree')).toBeTruthy() })
    expect(screen.getByRole('treeitem', { name: '折叠 src' })).toBeTruthy()
    const row = screen.getByRole('treeitem', { name: '打开 Buff.cs' })
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(scroller.scrollTop).toBe(64)
    expect(persistedSizes).not.toContain(0)
  })

  it('supports result arrows, folder reveal, type filtering, and Escape', async () => {
    const folder = entry({ name: 'Features', path: `${ROOT}/Features`, type: 'directory' })
    const file = entry({ name: 'Feature.cs', path: `${ROOT}/Feature.cs`, type: 'file' })
    const searchEntries = vi.fn(async () => ({ entries: [file, folder], truncated: false }))
    render(<ExplorerPanel {...props({
      searchEntries,
      entriesByPath: {
        [ROOT]: [folder],
        [folder.path]: [],
      },
    })} />)
    const input = screen.getByLabelText(zh['search.aria'])
    fireEvent.change(input, { target: { value: 'feature' } })
    await waitFor(() => { expect(screen.getByRole('list', { name: zh['search.results.aria'] })).toBeTruthy() })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByRole('tree')).toBeTruthy() })
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 Features', current: true })).toBeTruthy() })

    fireEvent.change(input, { target: { value: 'feature' } })
    await waitFor(() => { expect(screen.getByRole('list', { name: zh['search.results.aria'] })).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(zh['type.aria']), { target: { value: 'directory' } })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '打开 Feature.cs' })).toBeNull()
      expect(screen.getByRole('button', { name: '展开 Features' })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('tree')).toBeTruthy()
  })
})

// react-window's scroll container inside the arborist tree, carrying the layout
// metrics jsdom never computes so a fired scroll event reports a real offset.
function scrollerOf(tree: HTMLElement): HTMLElement {
  const scroller = tree.firstElementChild as HTMLElement
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 120 })
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 600 })
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 0 })
  return scroller
}

async function listedRoot(over: Parameters<typeof props>[0] = {}): Promise<ReturnType<typeof props>> {
  const next = props({
    entriesByPath: {
      [ROOT]: [
        entry({ name: 'README.md', path: README, type: 'file' }),
        entry({ name: 'src', path: SRC, type: 'directory' }),
        entry({ name: 'notes', path: `${ROOT}/notes`, type: 'other' }),
      ],
      [SRC]: [],
    },
    ...over,
  })
  render(<ExplorerPanel {...next} />)
  await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
  return next
}

describe('ExplorerPanel CRUD', () => {
  it('shows folder create actions, and file actions without writeText/mkdir', async () => {
    await listedRoot()
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 8, clientY: 16 })
    expect(screen.getByRole('menuitem', { name: zh['menu.newFile'] })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: zh['menu.newFolder'] })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: zh['menu.rename'] })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: zh['menu.delete'] })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 8, clientY: 16 })
    expect(screen.queryByRole('menuitem', { name: zh['menu.newFile'] })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: zh['menu.newFolder'] })).toBeNull()
    expect(screen.getByRole('menuitem', { name: zh['menu.openOs'] })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: zh['menu.rename'] })).toBeTruthy()
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 notes' }), { clientX: 8, clientY: 16 })
    expect(screen.queryByRole('menuitem', { name: zh['menu.newFile'] })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: zh['menu.newFolder'] })).toBeNull()
    expect(screen.getByRole('menuitem', { name: zh['menu.delete'] })).toBeTruthy()
  })

  it('creates a file, expands the parent, and relists', async () => {
    const view = await listedRoot()
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 4, clientY: 4 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFile'] }))
    const name = screen.getByLabelText(zh['dialog.fileName'])
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(view.writeText).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'a/b.ts' } })
    expect(screen.getByRole('button', { name: zh['dialog.create'] })).toHaveProperty('disabled', true)
    fireEvent.change(name, { target: { value: 'a.ts' } })
    fireEvent.compositionStart(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(view.writeText).not.toHaveBeenCalled()
    fireEvent.compositionEnd(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    await waitFor(() => { expect(view.writeText).toHaveBeenCalledWith(`${SRC}/a.ts`) })
    await waitFor(() => { expect(view.listEntries).toHaveBeenCalledWith(SRC, expect.anything()) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('surfaces writeText failures and does not close while the RPC is in flight', async () => {
    let rejectWrite: ((reason: unknown) => void) | undefined
    const writeText = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectWrite = reject }))
    await listedRoot({ writeText })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFile'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.fileName']), { target: { value: 'dup.ts' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.create'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    await act(async () => { rejectWrite?.(new Error('fs-failed')) })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('fs-failed') })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates a folder, expands the parent, and relists', async () => {
    const view = await listedRoot()
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 4, clientY: 4 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    const name = screen.getByLabelText(zh['dialog.folderName'])
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(view.mkdir).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'lib/nested' } })
    expect(screen.getByRole('button', { name: zh['dialog.create'] })).toHaveProperty('disabled', true)
    fireEvent.change(name, { target: { value: 'lib' } })
    fireEvent.compositionStart(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(view.mkdir).not.toHaveBeenCalled()
    fireEvent.compositionEnd(name)
    fireEvent.keyDown(name, { key: 'Enter' })
    await waitFor(() => { expect(view.mkdir).toHaveBeenCalledWith(`${SRC}/lib`) })
    await waitFor(() => { expect(view.listEntries).toHaveBeenCalledWith(SRC, expect.anything()) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('surfaces mkdir failures and does not close while the RPC is in flight', async () => {
    let rejectMkdir: ((reason: unknown) => void) | undefined
    const mkdir = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectMkdir = reject }))
    await listedRoot({ mkdir })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.folderName']), { target: { value: 'dup' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.create'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    await act(async () => { rejectMkdir?.(new Error('FS_ALREADY_EXISTS')) })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('FS_ALREADY_EXISTS') })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('drops a mutate that settles after the workspace disappears', async () => {
    let resolveLate: (() => void) | undefined
    const mkdir = vi.fn(() => new Promise<void>((resolve) => { resolveLate = resolve }))
    const { rerender } = render(<ExplorerPanel {...props({
      mkdir,
      entriesByPath: { [ROOT]: [entry({ name: 'src', path: SRC, type: 'directory' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '折叠 ws' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.folderName']), { target: { value: 'gone' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.create'] }))
    rerender(<ExplorerPanel {...props({ cwd: undefined, mkdir })} />)
    await act(async () => { resolveLate?.() })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renames a file, skips a no-op rename, and remaps an expanded folder', async () => {
    let rootEntries: FsEntry[] = [
      entry({ name: 'README.md', path: README, type: 'file' }),
      entry({ name: 'src', path: SRC, type: 'directory' }),
    ]
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return rootEntries
      if (path === SRC || path === `${ROOT}/lib`) return []
      return []
    })
    const rename = vi.fn(async (from: string, to: string) => {
      rootEntries = rootEntries.map(item => item.path === from
        ? { ...item, name: to.split(/[/\\]/).pop() ?? to, path: to }
        : item)
    })
    render(<ExplorerPanel {...props({ listEntries, rename })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    expect(rename).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'a/b' } })
    fireEvent.keyDown(screen.getByLabelText(zh['dialog.name']), { key: 'Enter' })
    expect(rename).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'HI.md' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(README, `${ROOT}/HI.md`) })

    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'lib' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(SRC, `${ROOT}/lib`) })
    await waitFor(() => { expect(listEntries).toHaveBeenCalledWith(`${ROOT}/lib`, expect.anything()) })
  })

  it('renames a collapsed folder without listing the destination', async () => {
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      return []
    })
    const rename = vi.fn(async () => {})
    render(<ExplorerPanel {...props({ listEntries, rename })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 3, clientY: 3 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'lib' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(SRC, `${ROOT}/lib`) })
    expect(listEntries.mock.calls.some(call => call[0] === `${ROOT}/lib`)).toBe(false)
  })

  it('confirms deletion, keeps the tree on cancel, and shows host errors', async () => {
    let rootEntries: FsEntry[] = [
      entry({ name: 'README.md', path: README, type: 'file' }),
      entry({ name: 'src', path: SRC, type: 'directory' }),
    ]
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return rootEntries
      if (path === SRC) return [entry({ name: 'a.ts', path: `${SRC}/a.ts`, type: 'file' })]
      return []
    })
    const deletePath = vi.fn(async (path: string) => {
      rootEntries = rootEntries.filter(item => item.path !== path)
    })
    render(<ExplorerPanel {...props({ listEntries, delete: deletePath })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    expect(screen.getByRole('dialog', { name: zh['dialog.delete'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.cancel'] }))
    expect(deletePath).not.toHaveBeenCalled()

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 src' }), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['menu.delete'] }))
    await waitFor(() => { expect(deletePath).toHaveBeenCalledWith(SRC) })
    await waitFor(() => { expect(screen.queryByRole('treeitem', { name: '折叠 src' })).toBeNull() })

    cleanup()
    const failing = vi.fn(async () => { throw 'fs-failed' })
    const again = props({
      delete: failing,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })
    render(<ExplorerPanel {...again} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['menu.delete'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('fs-failed') })
  })

  it('prunes nested expanded folders on delete and ignores submits while mutating', async () => {
    const inner = `${SRC}/inner`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      if (path === SRC) return [entry({ name: 'inner', path: inner, type: 'directory' })]
      if (path === inner) return []
      return []
    })
    const deletePath = vi.fn(async () => {})
    render(<ExplorerPanel {...props({ listEntries, delete: deletePath })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 inner' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 inner' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 src' }), { clientX: 6, clientY: 6 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['menu.delete'] }))
    await waitFor(() => { expect(deletePath).toHaveBeenCalledWith(SRC) })
  })

  it('drops late rename/delete settlements and rename errors', async () => {
    let resolveRename: (() => void) | undefined
    const rename = vi.fn(() => new Promise<void>((resolve) => { resolveRename = resolve }))
    const { rerender } = render(<ExplorerPanel {...props({
      rename,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'B.md' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    rerender(<ExplorerPanel {...props({ cwd: undefined, rename })} />)
    await act(async () => { resolveRename?.() })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()

    cleanup()
    let resolveDelete: (() => void) | undefined
    const deletePath = vi.fn(() => new Promise<void>((resolve) => { resolveDelete = resolve }))
    const again = render(<ExplorerPanel {...props({
      delete: deletePath,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['menu.delete'] }))
    again.rerender(<ExplorerPanel {...props({ cwd: undefined, delete: deletePath })} />)
    await act(async () => { resolveDelete?.() })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()

    cleanup()
    const failing = vi.fn(async () => { throw new Error('fs-failed') })
    render(<ExplorerPanel {...props({
      rename: failing,
      entriesByPath: { [ROOT]: [entry({ name: 'README.md', path: README, type: 'file' })] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.rename'] }))
    fireEvent.change(screen.getByLabelText(zh['dialog.name']), { target: { value: 'B.md' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('fs-failed') })
  })

  it('rejects a late mkdir failure and ignores Enter while mutating', async () => {
    let rejectMkdir: ((reason: unknown) => void) | undefined
    const mkdir = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectMkdir = reject }))
    const { rerender } = render(<ExplorerPanel {...props({
      mkdir,
      entriesByPath: { [ROOT]: [] },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 ws' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 ws' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    const name = screen.getByLabelText(zh['dialog.folderName'])
    fireEvent.change(name, { target: { value: 'dup' } })
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.create'] }))
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(mkdir).toHaveBeenCalledTimes(1)
    rerender(<ExplorerPanel {...props({ cwd: undefined, mkdir })} />)
    await act(async () => { rejectMkdir?.(new Error('FS_ALREADY_EXISTS')) })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ExplorerPanel multi-select', () => {
  it('Ctrl/Cmd toggles without opening, Shift ranges, and a plain click still opens', async () => {
    const readText = vi.fn(async (path: string) => {
      if (path.endsWith('.dshignore') || path.endsWith('.cursorignore') || path.endsWith('.gitignore')) throw new Error('missing ignore')
      return 'notes'
    })
    await listedRoot({ readText })
    readText.mockClear()
    const readme = screen.getByRole('treeitem', { name: '打开 README.md' })
    const notes = screen.getByRole('treeitem', { name: '打开 notes' })
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    fireEvent.click(readme, { ctrlKey: true })
    expect(readText).not.toHaveBeenCalled()
    expect(readme.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(notes, { metaKey: true })
    expect(readText).not.toHaveBeenCalled()
    expect(notes.getAttribute('aria-selected')).toBe('true')
    expect(readme.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(src, { shiftKey: true })
    expect(src.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('treeitem', { name: '折叠 ws' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(notes)
    await waitFor(() => { expect(readText).toHaveBeenCalledWith(`${ROOT}/notes`) })
    expect(screen.queryByLabelText(zh['preview.aria'])).toBeNull()
    expect(notes.getAttribute('aria-selected')).toBe('true')
    expect(readme.getAttribute('aria-selected')).toBe('false')
  })

  it('Ctrl-click a folder does not expand, and a second Ctrl-click deselects', async () => {
    await listedRoot()
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    fireEvent.click(src, { ctrlKey: true })
    expect(src.getAttribute('aria-selected')).toBe('true')
    expect(src.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(src, { ctrlKey: true })
    expect(src.getAttribute('aria-selected')).toBe('false')
  })

  it('Shift without an anchor selects only the clicked row', async () => {
    await listedRoot()
    const readme = screen.getByRole('treeitem', { name: '打开 README.md' })
    fireEvent.click(readme, { shiftKey: true })
    expect(readme.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('treeitem', { name: '打开 notes' }).getAttribute('aria-selected')).toBe('false')
  })

  it('Shift selects the visible range from the anchor', async () => {
    await listedRoot()
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { shiftKey: true })
    expect(screen.getByRole('treeitem', { name: '展开 src' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('treeitem', { name: '打开 notes' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('treeitem', { name: '打开 README.md' }).getAttribute('aria-selected')).toBe('true')
  })

  it('right-click selects an unselected row and keeps an already selected set', async () => {
    await listedRoot()
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 notes' }), { ctrlKey: true })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 notes' }), { clientX: 2, clientY: 2 })
    expect(screen.getByRole('treeitem', { name: '打开 README.md' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 2, clientY: 2 })
    expect(screen.getByRole('treeitem', { name: '展开 src' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('treeitem', { name: '打开 README.md' }).getAttribute('aria-selected')).toBe('false')
  })
})

describe('ExplorerPanel clipboard', () => {
  it('copies through the menu and pastes into the selected folder', async () => {
    const copy = vi.fn(async () => {})
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [
          entry({ name: 'README.md', path: README, type: 'file' }),
          entry({ name: 'src', path: SRC, type: 'directory' }),
        ]
      }
      if (path === SRC) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, copy })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 3, clientY: 3 })
    expect(screen.queryByRole('menuitem', { name: zh['menu.paste'] })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.copy'] }))
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 3, clientY: 3 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.paste'] }))
    await waitFor(() => { expect(copy).toHaveBeenCalledWith(README, `${SRC}/README.md`) })
    await waitFor(() => {
      expect(listEntries.mock.calls.filter(call => call[0] === SRC).length).toBeGreaterThan(1)
    })
  })

  it('cuts with rename, skips a same-directory no-op, and surfaces copy failures', async () => {
    const rename = vi.fn(async () => {})
    const copy = vi.fn(async () => { throw new Error('fs-failed') })
    await listedRoot({ rename, copy })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'x', ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    await waitFor(() => { expect(rename).not.toHaveBeenCalled() })

    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(README, `${SRC}/README.md`) })

    cleanup()
    await listedRoot({ copy })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'c', metaKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', metaKey: true })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('fs-failed') })
  })

  it('keyboard copy/cut/paste ignore empty selection, other keys, an open dialog, and in-flight paste', async () => {
    let resolveCopy: (() => void) | undefined
    const copy = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve }))
    await listedRoot({ copy })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'c' })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'C', ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'a', ctrlKey: true })
    expect(copy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.newFile'] }))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'c', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 README.md' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.copy'] }))
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.paste'] }))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    expect(copy).toHaveBeenCalledTimes(1)
    await act(async () => { resolveCopy?.() })
    await waitFor(() => { expect(copy).toHaveBeenCalledWith(README, `${SRC}/README.md`) })
  })

  it('drops a late paste after the workspace disappears and remaps an expanded cut folder', async () => {
    let resolveRename: (() => void) | undefined
    const rename = vi.fn(() => new Promise<void>((resolve) => { resolveRename = resolve }))
    const { rerender } = render(<ExplorerPanel {...props({
      rename,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'README.md', path: README, type: 'file' }),
          entry({ name: 'src', path: SRC, type: 'directory' }),
        ],
        [SRC]: [],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'x', ctrlKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    rerender(<ExplorerPanel {...props({ cwd: undefined, rename })} />)
    await act(async () => { resolveRename?.() })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()

    cleanup()
    const move = vi.fn(async () => {})
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' }), entry({ name: 'lib', path: `${ROOT}/lib`, type: 'directory' })]
      if (path === SRC || path === `${ROOT}/lib`) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, rename: move })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 src' }), { clientX: 4, clientY: 4 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.cut'] }))
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 lib' }))
    await waitFor(() => { expect(document.querySelectorAll('[data-empty]').length).toBeGreaterThan(0) })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '展开 lib' }), { clientX: 4, clientY: 4 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.paste'] }))
    await waitFor(() => { expect(move).toHaveBeenCalledWith(SRC, `${ROOT}/lib/src`) })
  })

  it('copies only the ancestor when a folder and its child are selected', async () => {
    const copy = vi.fn(async () => {})
    const nested = `${SRC}/a.ts`
    const lib = `${ROOT}/lib`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [
        entry({ name: 'src', path: SRC, type: 'directory' }),
        entry({ name: 'lib', path: lib, type: 'directory' }),
      ]
      if (path === SRC) return [entry({ name: 'a.ts', path: nested, type: 'file' })]
      if (path === lib) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, copy })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 a.ts' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 a.ts' }), { ctrlKey: true })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'c', ctrlKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 lib' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'v', ctrlKey: true })
    await waitFor(() => { expect(copy).toHaveBeenCalledTimes(1) })
    expect(copy).toHaveBeenCalledWith(SRC, `${lib}/src`)
  })

  it('pastes every selected file into the tree root', async () => {
    const copy = vi.fn(async () => {})
    await listedRoot({ copy })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 notes' }), { ctrlKey: true })
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '打开 notes' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.copy'] }))
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: '折叠 ws' }), { clientX: 2, clientY: 2 })
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.paste'] }))
    await waitFor(() => { expect(copy).toHaveBeenCalledTimes(2) })
    expect(copy).toHaveBeenCalledWith(README, README)
    expect(copy).toHaveBeenCalledWith(`${ROOT}/notes`, `${ROOT}/notes`)
  })
})

function mimeTransfer() {
  const store = new Map<string, string>()
  const types: string[] = []
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    types,
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value)
      if (!types.includes(type)) types.push(type)
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
  }
}

describe('ExplorerPanel drag-move', () => {
  it('drags a file onto a folder through host.rename and refreshes expanded layers', async () => {
    const rename = vi.fn(async () => {})
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [
          entry({ name: 'README.md', path: README, type: 'file' }),
          entry({ name: 'src', path: SRC, type: 'directory' }),
        ]
      }
      if (path === SRC) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, rename })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const afterExpand = listEntries.mock.calls.length
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalledWith(EXPLORER_DRAG_MIME, JSON.stringify([{ path: README, name: 'README.md' }]))
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    expect(fireEvent.dragOver(src, { dataTransfer: dt })).toBe(false)
    expect(dt.dropEffect).toBe('move')
    expect(src.className).toMatch(/dropTarget/)
    fireEvent.drop(src, { dataTransfer: dt })
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(README, `${SRC}/README.md`) })
    await waitFor(() => { expect(listEntries.mock.calls.length).toBe(afterExpand + 2) })
    const reloads = listEntries.mock.calls.slice(afterExpand).map(call => call[0]).sort()
    expect(reloads).toEqual([ROOT, SRC])
  })

  it('does not drag the workspace root, and Files drags pass through the tree', async () => {
    await listedRoot()
    const root = screen.getByRole('treeitem', { name: '折叠 ws' })
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    const readme = screen.getByRole('treeitem', { name: '打开 README.md' })
    expect(root).toHaveProperty('draggable', false)
    expect(src).toHaveProperty('draggable', true)
    expect(readme).toHaveProperty('draggable', true)
    const files = { types: ['Files'], files: [], dropEffect: 'none', effectAllowed: 'copy' }
    expect(fireEvent.dragOver(src, { dataTransfer: files })).toBe(true)
    expect(fireEvent.drop(src, { dataTransfer: files })).toBe(true)
  })

  it('refuses a drop onto itself or a descendant and shows the copy', async () => {
    const rename = vi.fn(async () => {})
    const inner = `${SRC}/inner`
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) return [entry({ name: 'src', path: SRC, type: 'directory' })]
      if (path === SRC) return [entry({ name: 'inner', path: inner, type: 'directory' })]
      if (path === inner) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, rename })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 inner' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 inner' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '折叠 src' }), { dataTransfer: dt })
    const self = screen.getByRole('treeitem', { name: '折叠 src' })
    fireEvent.dragOver(self, { dataTransfer: dt })
    expect(dt.dropEffect).toBe('none')
    fireEvent.drop(self, { dataTransfer: dt })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(zh['drop.intoSelf']) })
    expect(rename).not.toHaveBeenCalled()

    const again = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '折叠 src' }), { dataTransfer: again })
    const child = screen.getByRole('treeitem', { name: '展开 inner' })
    fireEvent.dragOver(child, { dataTransfer: again })
    expect(again.dropEffect).toBe('none')
    fireEvent.drop(child, { dataTransfer: again })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(zh['drop.intoSelf']) })
    expect(rename).not.toHaveBeenCalled()
  })

  it('moves every selected row when the drag starts on a selected item', async () => {
    const rename = vi.fn(async () => {})
    await listedRoot({ rename })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }))
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 notes' }), { ctrlKey: true })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 notes' }), { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: dt })
    await waitFor(() => { expect(rename).toHaveBeenCalledTimes(2) })
    expect(rename).toHaveBeenCalledWith(README, `${SRC}/README.md`)
    expect(rename).toHaveBeenCalledWith(`${ROOT}/notes`, `${SRC}/notes`)
  })

  it('moves only the dragged row when it is not in the selection', async () => {
    const rename = vi.fn(async () => {})
    await listedRoot({ rename })
    fireEvent.click(screen.getByRole('treeitem', { name: '打开 README.md' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 notes' }), { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: dt })
    await waitFor(() => { expect(rename).toHaveBeenCalledTimes(1) })
    expect(rename).toHaveBeenCalledWith(`${ROOT}/notes`, `${SRC}/notes`)
  })

  it('skips a same-directory no-op and surfaces rename failures as the host text', async () => {
    const rename = vi.fn(async () => {})
    await listedRoot({ rename })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('treeitem', { name: '折叠 ws' }), { dataTransfer: dt })
    await waitFor(() => { expect(rename).not.toHaveBeenCalled() })

    cleanup()
    const failing = vi.fn(async () => { throw new Error('fs-failed') })
    await listedRoot({ rename: failing })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const boom = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: boom })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: boom })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('fs-failed') })
  })

  it('rejects a forged payload outside the workspace and ignores a missing HTML5 drop', async () => {
    const rename = vi.fn(async () => {})
    await listedRoot({ rename })
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    fireEvent.drop(src)
    fireEvent.drop(src, { dataTransfer: null })
    const forged = {
      types: [EXPLORER_DRAG_MIME],
      getData: () => JSON.stringify([{ path: '/tmp/a.ts', name: 'a.ts' }]),
      dropEffect: 'none',
    }
    fireEvent.drop(src, { dataTransfer: forged })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe(zh['drop.outsideWorkspace']) })
    expect(rename).not.toHaveBeenCalled()

    const garbage = {
      types: [EXPLORER_DRAG_MIME],
      getData: () => '{',
      dropEffect: 'none',
    }
    fireEvent.drop(src, { dataTransfer: garbage })
    expect(rename).not.toHaveBeenCalled()
  })

  it('does not start a drag when setData throws, and remaps an expanded moved folder', async () => {
    const rename = vi.fn(async () => {})
    const listEntries = vi.fn(async (path: string) => {
      if (path === ROOT) {
        return [
          entry({ name: 'src', path: SRC, type: 'directory' }),
          entry({ name: 'lib', path: `${ROOT}/lib`, type: 'directory' }),
        ]
      }
      if (path === SRC || path === `${ROOT}/lib` || path === `${ROOT}/lib/src`) return []
      return []
    })
    render(<ExplorerPanel {...props({ listEntries, rename })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '展开 src' })).toBeTruthy() })
    const broken = {
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      types: [] as string[],
      setData: () => { throw new Error('no html5') },
      getData: () => '',
    }
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: broken })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 lib' }), { dataTransfer: broken })
    expect(rename).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 lib' }))
    await waitFor(() => { expect(document.querySelectorAll('[data-empty]').length).toBeGreaterThan(0) })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 lib' }), { dataTransfer: dt })
    await waitFor(() => { expect(rename).toHaveBeenCalledWith(SRC, `${ROOT}/lib/src`) })
    await waitFor(() => {
      expect(listEntries.mock.calls.some(call => call[0] === `${ROOT}/lib/src`)).toBe(true)
    })
  })

  it('drops a late drag-move after the workspace disappears and ignores an in-flight second drop', async () => {
    let resolveRename: (() => void) | undefined
    const rename = vi.fn(() => new Promise<void>((resolve) => { resolveRename = resolve }))
    const { rerender } = render(<ExplorerPanel {...props({
      rename,
      entriesByPath: {
        [ROOT]: [
          entry({ name: 'README.md', path: README, type: 'file' }),
          entry({ name: 'notes', path: `${ROOT}/notes`, type: 'other' }),
          entry({ name: 'src', path: SRC, type: 'directory' }),
        ],
        [SRC]: [],
      },
    })} />)
    await waitFor(() => { expect(screen.getByRole('treeitem', { name: '打开 README.md' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('treeitem', { name: '展开 src' }))
    await waitFor(() => { expect(document.querySelector('[data-empty]')).toBeTruthy() })
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: dt })
    const second = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 notes' }), { dataTransfer: second })
    fireEvent.drop(screen.getByRole('treeitem', { name: '展开 src' }), { dataTransfer: second })
    expect(rename).toHaveBeenCalledTimes(1)
    rerender(<ExplorerPanel {...props({ cwd: undefined, rename })} />)
    await act(async () => { resolveRename?.() })
    expect(screen.getByText(zh['empty.workspace'])).toBeTruthy()
  })

  it('clears the drop target when the drag leaves the tree or ends', async () => {
    await listedRoot()
    const dt = mimeTransfer()
    fireEvent.dragStart(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: dt })
    const src = screen.getByRole('treeitem', { name: '展开 src' })
    fireEvent.dragOver(src, { dataTransfer: dt })
    expect(src.className).toMatch(/dropTarget/)
    fireEvent.dragLeave(screen.getByRole('tree'), { relatedTarget: document.body })
    expect(src.className).not.toMatch(/dropTarget/)
    fireEvent.dragOver(src, { dataTransfer: dt })
    fireEvent.dragEnd(screen.getByRole('treeitem', { name: '打开 README.md' }), { dataTransfer: dt })
    expect(src.className).not.toMatch(/dropTarget/)
  })
})

