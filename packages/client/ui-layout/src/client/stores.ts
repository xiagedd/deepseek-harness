/**
 * The root entry's layout store: panel geometry as plain widths in px
 * (0 = closed). Only the three column widths persist to localStorage under
 * {@link LAYOUT_PANELS_PERSIST_KEY}; the viewport-derived narrow pair stays
 * transient (AppFrame re-derives `narrow` from the live viewport on mount, so
 * persisting it would restore a stale breakpoint). Module level exports the
 * factory only — a module-level handle would pin the store's identity in the
 * module cache (a de-facto singleton surviving plugin reloads). register()
 * receives the factory (exclusive use: the framework instantiates per entry),
 * AppFrame derives its PropsStore share from the return type, and the service
 * face receives the bound actions through the registration's inject hook.
 */
import {
  defineStore, type EngineStoreHandle, type EngineStoreInstance, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  PREVIEW_DEFAULT, PREVIEW_MAX, PREVIEW_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** localStorage key for the root layout panel widths (bump on breaking shape changes). */
export const LAYOUT_PANELS_PERSIST_KEY = 'dsh.layout.panels.v1'

/**
 * Layout store state: panel width preferences in px (0 = closed), plus the
 * narrow-viewport pair — `narrow` mirrors AppFrame's breakpoint reading
 * (viewport < SIDEBAR_AUTO_COLLAPSE) so toggleSidebar can pick semantics, and
 * `narrowExpanded` is the manual override that re-expands the auto-collapsed
 * sidebar over the squeezed center without rewriting the width preference.
 */
type LayoutState = { sidebar: number; details: number; preview: number; narrow: boolean; narrowExpanded: boolean }

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  setPreview: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
  openPreview: (draft: LayoutState) => void
  closePreview: (draft: LayoutState) => void
}

/** The persisted subset of {@link LayoutState}: column widths only (0 = closed). */
type PersistedGeometry = Pick<LayoutState, 'sidebar' | 'details' | 'preview'>

/**
 * Revive one persisted width from untrusted localStorage JSON. `0` (a closed
 * column) survives verbatim; any other value re-clamps into its contract range
 * so a stale bound written by an older build cannot escape it. A non-finite or
 * non-number entry yields undefined — the caller keeps the contract default.
 * @param value - the raw parsed field.
 * @param min - contract lower bound.
 * @param max - contract upper bound.
 * @returns the revived width, or undefined to keep the default.
 */
function reviveWidth(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value === 0 ? 0 : clampWidth(value, min, max)
}

/**
 * Rehydrate the persisted column widths into a fresh store instance, then
 * mirror every later geometry change back to localStorage. Only the three
 * widths cross the boundary; the narrow pair is viewport-derived and stays in
 * memory. Storage failures (quota, private mode, absent localStorage) disable
 * persistence without breaking the store — the same non-fatal contract as the
 * engine's own persist path. The projection is deduplicated so viewport-only
 * changes (setNarrow) do not rewrite an unchanged geometry entry.
 * @param store - the fresh engine store to seed and observe.
 */
function attachGeometryPersistence(store: SnapshotStore<LayoutState>): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(LAYOUT_PANELS_PERSIST_KEY)
    if (raw !== null) {
      const saved = JSON.parse(raw) as Partial<Record<keyof PersistedGeometry, unknown>>
      store.update((d) => {
        const sidebar = reviveWidth(saved.sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
        if (sidebar !== undefined) d.sidebar = sidebar
        const details = reviveWidth(saved.details, DETAILS_MIN, DETAILS_MAX)
        if (details !== undefined) d.details = details
        const preview = reviveWidth(saved.preview, PREVIEW_MIN, PREVIEW_MAX)
        if (preview !== undefined) d.preview = preview
      })
    }
  } catch (error) {
    console.error(`layout store '${LAYOUT_PANELS_PERSIST_KEY}' rehydration failed:`, error)
  }
  let last = ''
  store.subscribe(() => {
    const { sidebar, details, preview } = store.getSnapshot()
    const next = JSON.stringify({ sidebar, details, preview } satisfies PersistedGeometry)
    if (next === last) return
    last = next
    try {
      localStorage.setItem(LAYOUT_PANELS_PERSIST_KEY, next)
    } catch (error) {
      console.error(`layout store '${LAYOUT_PANELS_PERSIST_KEY}' persistence failed:`, error)
    }
  })
}

/**
 * Create the layout panel store handle. The preference IS the width, so
 * closing a panel forgets its drag width — reopening restores the contract
 * default. Actions are the complete write set: drag writes clamp
 * into the panel's contract range and never cross the open/closed line;
 * open/close transitions write 0 / the default explicitly. The file tree
 * (details) and the file preview are independent panels: each opens and
 * closes on its own action and neither transition touches the other's width.
 * Below the auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar
 * toggle flips the narrowExpanded override instead of the preference.
 *
 * The three column widths persist across a reload (the last-shown layout is
 * restored, including a panel the user closed); the viewport pair does not.
 * Session / workspace switches leave open columns open. A bare `defineStore`
 * persist would write the whole state, so this factory wraps the engine
 * instance with a geometry-only projection.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({ sidebar: SIDEBAR_DEFAULT, details: 0, preview: 0, narrow: false, narrowExpanded: false }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      setPreview: (d, px: number) => { d.preview = clampWidth(px, PREVIEW_MIN, PREVIEW_MAX) },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      openDetails: (d) => {
        if (d.details === 0) d.details = DETAILS_DEFAULT
      },
      closeDetails: (d) => {
        d.details = 0
      },
      openPreview: (d) => {
        if (d.preview === 0) d.preview = PREVIEW_DEFAULT
      },
      closePreview: (d) => {
        d.preview = 0
      },
    },
  })
  return {
    spec: handle.spec,
    create(scopeKey?: string): EngineStoreInstance<LayoutState, LayoutActions> {
      const instance = handle.create(scopeKey)
      attachGeometryPersistence(instance.store)
      return {
        ...instance,
        clearPersisted: () => {
          instance.clearPersisted()
          if (typeof localStorage === 'undefined') return
          try {
            localStorage.removeItem(LAYOUT_PANELS_PERSIST_KEY)
          } catch {
            // Storage teardown races (private mode, quota) only skip cleanup —
            // the same non-fatal contract as attachGeometryPersistence.
          }
        },
      }
    },
  }
}
