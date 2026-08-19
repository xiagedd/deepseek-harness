// @vitest-environment jsdom
/**
 * Explorer browse persistence: root-scoped localStorage key, cwd buckets,
 * hydrate helpers, stale-path drops, and the guarantee that preview drafts
 * never enter the persisted payload.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  hydratedExpandedPaths, hydratedPreviewTabs,
} from '../src/client/ExplorerPanel.tsx'
import {
  createExplorerTreeStore,
  createFilePreviewStore,
  emptyExplorerBucket,
  explorerBucketOf,
  EXPLORER_TREE_PERSIST_KEY,
} from '../src/client/stores.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('createExplorerTreeStore', () => {
  it(`persists under ${EXPLORER_TREE_PERSIST_KEY} with cwd buckets (no session suffix)`, () => {
    const store = createExplorerTreeStore().create()
    store.actions.setExpanded('/ws-a', ['/ws-a', '/ws-a/src'])
    store.actions.setPreviewTabs('/ws-a', ['/ws-a/a.ts'], '/ws-a/a.ts')
    store.actions.setExpanded('/ws-b', ['/ws-b'])

    const raw = localStorage.getItem(EXPLORER_TREE_PERSIST_KEY)
    expect(raw).not.toBeNull()
    expect(localStorage.getItem(`${EXPLORER_TREE_PERSIST_KEY}.session`)).toBeNull()
    const parsed = JSON.parse(raw!) as ReturnType<typeof store.getSnapshot>
    expect(parsed.byWorkspace['/ws-a']).toEqual({
      expanded: ['/ws-a', '/ws-a/src'],
      previewPaths: ['/ws-a/a.ts'],
      activePath: '/ws-a/a.ts',
    })
    expect(parsed.byWorkspace['/ws-b']?.expanded).toEqual(['/ws-b'])

    const revived = createExplorerTreeStore().create()
    expect(explorerBucketOf(revived.getSnapshot(), '/ws-a').expanded).toEqual(['/ws-a', '/ws-a/src'])
    expect(explorerBucketOf(revived.getSnapshot(), '/ws-b').expanded).toEqual(['/ws-b'])
  })

  it('keeps workspaces isolated and prunes unknown keys', () => {
    const store = createExplorerTreeStore().create()
    store.actions.setExpanded('/ws-a', ['/ws-a'])
    store.actions.setExpanded('/ws-b', ['/ws-b'])
    store.actions.setExpanded('/gone', ['/gone'])
    store.actions.retainAccountKeys(['/ws-a', '/ws-b'])
    expect(Object.keys(store.getSnapshot().byWorkspace).sort()).toEqual(['/ws-a', '/ws-b'])
    expect(explorerBucketOf(store.getSnapshot(), '/gone')).toEqual(emptyExplorerBucket())
  })

  it('persists preview paths without drafts, dirty flags, or file bodies', () => {
    const tree = createExplorerTreeStore().create()
    const preview = createFilePreviewStore().create()
    preview.actions.showLoading('/ws/a.ts')
    preview.actions.showText('/ws/a.ts', 'disk-body')
    preview.actions.setDraft('/ws/a.ts', 'unsaved-draft')
    expect(preview.getSnapshot().tabs[0]).toMatchObject({
      draft: 'unsaved-draft', dirty: true, content: 'disk-body',
    })

    tree.actions.setPreviewTabs('/ws', ['/ws/a.ts'], '/ws/a.ts')
    const raw = localStorage.getItem(EXPLORER_TREE_PERSIST_KEY)!
    expect(raw).not.toContain('unsaved-draft')
    expect(raw).not.toContain('disk-body')
    expect(raw).not.toContain('"dirty"')
    const parsed = JSON.parse(raw) as {
      byWorkspace: Record<string, { expanded: string[]; previewPaths: string[]; activePath: string }>
    }
    expect(parsed.byWorkspace['/ws']).toEqual({
      expanded: [],
      previewPaths: ['/ws/a.ts'],
      activePath: '/ws/a.ts',
    })
  })
})

describe('hydrate helpers', () => {
  it('restores expanded paths under cwd and always includes the root', () => {
    expect(hydratedExpandedPaths('/ws', emptyExplorerBucket())).toEqual(['/ws'])
    expect(hydratedExpandedPaths('/ws', {
      expanded: ['/ws/src', '/other/x'],
      previewPaths: [],
      activePath: '',
    })).toEqual(['/ws', '/ws/src'])
  })

  it('drops preview paths outside cwd and repairs a stale activePath', () => {
    expect(hydratedPreviewTabs('/ws', {
      expanded: [],
      previewPaths: ['/ws/a.ts', '/other/b.ts'],
      activePath: '/other/b.ts',
    })).toEqual({ paths: ['/ws/a.ts'], activePath: '/ws/a.ts' })
  })
})
