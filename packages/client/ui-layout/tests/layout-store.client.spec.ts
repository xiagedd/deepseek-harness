// @vitest-environment jsdom
/**
 * createLayoutStore unit account: init shape, the action write set (clamp
 * inside actions), independent details/preview open+close, and the column-width
 * persistence contract (widths survive a reload, the viewport pair does not).
 * Uses the test-sanctioned path: factory self-call + .create() gives the real
 * engine instance (same create path as production).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutStore, LAYOUT_PANELS_PERSIST_KEY } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import {
  DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  PREVIEW_DEFAULT, PREVIEW_MAX, PREVIEW_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

const PERSIST_KEY = LAYOUT_PANELS_PERSIST_KEY

beforeEach(() => { localStorage.clear() })

describe('createLayoutStore', () => {
  it('initializes the sidebar at its default width, both side columns closed, wide viewport assumed', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({ sidebar: SIDEBAR_DEFAULT, details: 0, preview: 0, narrow: false, narrowExpanded: false })
  })

  it('each create() is an independent instance (factory is not a singleton)', () => {
    const a = createLayoutStore().create()
    const b = createLayoutStore().create()
    a.actions.setSidebar(400)
    expect(b.store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('setSidebar/setDetails/setPreview clamp into the contract ranges', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MIN)
    actions.setSidebar(9999)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    actions.setDetails(1)
    expect(store.getSnapshot().details).toBe(DETAILS_MIN)
    actions.setDetails(9999)
    expect(store.getSnapshot().details).toBe(DETAILS_MAX)
    actions.setPreview(1)
    expect(store.getSnapshot().preview).toBe(PREVIEW_MIN)
    actions.setPreview(9999)
    expect(store.getSnapshot().preview).toBe(PREVIEW_MAX)
  })

  it('toggleSidebar flips closed <-> contract default (drag width forgotten)', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('narrow toggleSidebar flips only the re-expand override; the width preference survives', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot()).toEqual({ sidebar: 400, details: 0, preview: 0, narrow: true, narrowExpanded: true })
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(false)
    expect(store.getSnapshot().sidebar).toBe(400)
  })

  it('crossing the breakpoint drops the override; a same-value setNarrow keeps it', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(false)
    expect(store.getSnapshot()).toMatchObject({ narrow: false, narrowExpanded: false })
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(false)
  })

  it('openDetails uses the contract default, preserves an open width, and closeDetails zeroes — never touching preview', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openPreview()
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    expect(store.getSnapshot().preview).toBe(PREVIEW_DEFAULT)
    actions.setDetails(500)
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(500)
    actions.closeDetails()
    expect(store.getSnapshot().details).toBe(0)
    // The preview panel is untouched by any details transition.
    expect(store.getSnapshot().preview).toBe(PREVIEW_DEFAULT)
  })

  it('openPreview/closePreview are independent of details', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    actions.openPreview()
    expect(store.getSnapshot().preview).toBe(PREVIEW_DEFAULT)
    actions.setPreview(560)
    actions.openPreview()
    expect(store.getSnapshot().preview).toBe(560)
    actions.closePreview()
    expect(store.getSnapshot().preview).toBe(0)
    // The details tree is untouched by any preview transition.
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
  })

  it('persists the three column widths and rehydrates them into a fresh instance', () => {
    const first = createLayoutStore().create()
    first.actions.setSidebar(400)
    first.actions.openDetails()
    first.actions.setDetails(500)
    first.actions.openPreview()
    first.actions.setPreview(560)
    expect(JSON.parse(localStorage.getItem(PERSIST_KEY) ?? 'null')).toEqual({
      sidebar: 400,
      details: 500,
      preview: 560,
    })

    // A reload constructs a fresh instance against the same storage key.
    const second = createLayoutStore().create()
    expect(second.store.getSnapshot()).toEqual({
      sidebar: 400,
      details: 500,
      preview: 560,
      narrow: false,
      narrowExpanded: false,
    })
  })

  it('never persists the viewport-derived narrow pair', () => {
    const { actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    const stored = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? 'null') as Record<string, unknown> | null
    expect(stored).not.toBeNull()
    expect(stored).not.toHaveProperty('narrow')
    expect(stored).not.toHaveProperty('narrowExpanded')

    // A reload starts the viewport pair fresh regardless of the last session.
    const reloaded = createLayoutStore().create()
    expect(reloaded.store.getSnapshot().narrow).toBe(false)
    expect(reloaded.store.getSnapshot().narrowExpanded).toBe(false)
  })

  it('persists a user close, so reload restores the last-shown (closed) column', () => {
    const first = createLayoutStore().create()
    first.actions.openDetails()
    first.actions.openPreview()
    first.actions.closeDetails()
    first.actions.closePreview()

    const second = createLayoutStore().create()
    expect(second.store.getSnapshot().details).toBe(0)
    expect(second.store.getSnapshot().preview).toBe(0)
  })

  it('re-clamps a stale persisted width and ignores a malformed entry', () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ sidebar: 9999, details: 'nope', preview: 0 }))
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    expect(store.getSnapshot().details).toBe(0)
    expect(store.getSnapshot().preview).toBe(0)
  })

  it('clearPersisted drops the stored widths', () => {
    const instance = createLayoutStore().create()
    instance.actions.openDetails()
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull()
    instance.clearPersisted()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })
})
