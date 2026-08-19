// @vitest-environment jsdom
/**
 * Preview column behavior over a real store instance (the test-sanctioned
 * engine path): the tab strip opens, switches, and closes files, and the body
 * follows the active tab's loading / ready / error state. CodeMirror is mocked
 * so jsdom asserts engine selection, dirty, and save without mounting EditorView.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TextPreviewEngineProps } from '../src/client/text-preview-engine.ts'
import { TEXT_PREVIEW_MAX_BYTES } from '../src/client/text-preview-engine.ts'
import { activeTab, createFilePreviewStore, tabOf, type FilePreviewState } from '../src/client/stores.ts'
import { zh } from '../src/client/locales.ts'

vi.mock('../src/client/CodeMirrorTextPreview.tsx', () => ({
  CodeMirrorTextPreview: ({
    path, text, language, readOnly, onChange, onAddToChat, addToChatApiRef, className,
  }: TextPreviewEngineProps) => {
    if (addToChatApiRef !== undefined) {
      addToChatApiRef.current = {
        invoke: () => { onAddToChat?.(null) },
      }
    }
    return (
      <div
        className={className}
        data-preview-engine="codemirror"
        data-language={language}
        data-readonly={readOnly ? 'true' : 'false'}
        data-path={path}
      >
        <textarea
          aria-label={`mock-editor-${path}`}
          value={text}
          readOnly={readOnly}
          onChange={(event) => { onChange?.(event.target.value) }}
        />
        <button
          type="button"
          aria-label={`mock-add-range-${path}`}
          onClick={() => { onAddToChat?.({ startLine: 120, endLine: 146 }) }}
        >
          mock-range
        </button>
      </div>
    )
  },
}))

import { FilePreviewPanel } from '../src/client/FilePreviewPanel.tsx'

afterEach(cleanup)

const t = makeTranslate(zh)
const A = '/ws/a.ts'
const B = '/ws/b.txt'
const CS = '/ws/Game.cs'

type PreviewInstance = ReturnType<ReturnType<typeof createFilePreviewStore>['create']>

/** Test-local selector hook over the store instance (no framework renderer here). */
function hookOf(instance: PreviewInstance) {
  return function useSelector<S>(select: (state: FilePreviewState) => S): S {
    return select(useSyncExternalStore(
      listener => instance.subscribe(listener),
      () => instance.getSnapshot(),
    ))
  }
}

function mount(
  writeText = vi.fn(async () => {}),
  insertWorkspaceReference = vi.fn(() => true),
) {
  const store = createFilePreviewStore().create()
  const closePreview = vi.fn()
  const persistPreviewTabs = vi.fn()
  const showLineNumbers = {
    getSnapshot: () => true,
    subscribe: () => () => {},
  }
  const sessions = {
    ids: ['session'],
    byId: {
      session: {
        id: 'session', cwd: '/ws', displayTitle: 's', blank: false, running: false, updatedAt: 0,
      },
    },
    current: 'session',
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
  const view = render(
    <FilePreviewPanel
      sessionId={'session' as never}
      useSessions={select => select(sessions as never)}
      useStore={hookOf(store)}
      actions={store.actions}
      closePreview={closePreview}
      writeText={writeText}
      persistPreviewTabs={persistPreviewTabs}
      insertWorkspaceReference={insertWorkspaceReference}
      useShowLineNumbers={select => select(showLineNumbers.getSnapshot())}
      useRevealRequest={select => select(undefined)}
      t={t}
    />,
  )
  return { store, view, closePreview, writeText, persistPreviewTabs, insertWorkspaceReference }
}

describe('preview tabs store', () => {
  it('opens, activates, closes, and falls back to a neighbour tab', () => {
    const store = createFilePreviewStore().create()
    store.actions.showLoading(A)
    store.actions.showText(A, 'body-a')
    store.actions.showLoading(B)
    expect(store.getSnapshot().tabs.map(tab => tab.path)).toEqual([A, B])
    expect(store.getSnapshot().activePath).toBe(B)
    expect(tabOf(store.getSnapshot(), A)?.content).toBe('body-a')

    store.actions.activate(A)
    expect(activeTab(store.getSnapshot())?.path).toBe(A)
    store.actions.activate('/ws/never-opened')
    expect(store.getSnapshot().activePath).toBe(A)

    store.actions.showLoading(A)
    expect(activeTab(store.getSnapshot())?.status).toBe('loading')
    store.actions.showError(A, 'boom')
    expect(activeTab(store.getSnapshot())?.message).toBe('boom')

    store.actions.close(A)
    expect(store.getSnapshot().tabs.map(tab => tab.path)).toEqual([B])
    expect(store.getSnapshot().activePath).toBe(B)
    store.actions.close('/ws/never-opened')
    expect(store.getSnapshot().tabs).toHaveLength(1)
    store.actions.close(B)
    expect(store.getSnapshot()).toMatchObject({ tabs: [], activePath: '' })
  })

  it('tracks dirty drafts and clears them on markSaved', () => {
    const store = createFilePreviewStore().create()
    store.actions.showLoading(A)
    store.actions.showText(A, 'body-a')
    expect(tabOf(store.getSnapshot(), A)).toMatchObject({ draft: 'body-a', dirty: false })
    store.actions.setDraft(A, 'edited')
    expect(tabOf(store.getSnapshot(), A)).toMatchObject({ draft: 'edited', dirty: true })
    store.actions.markSaved(A)
    expect(tabOf(store.getSnapshot(), A)).toMatchObject({ content: 'edited', draft: 'edited', dirty: false })
    store.actions.setDraft('/ws/missing', 'x')
    store.actions.markSaved('/ws/missing')
  })

  it('keeps the active tab when another tab closes, and drops writes for closed tabs', () => {
    const store = createFilePreviewStore().create()
    store.actions.showLoading(A)
    store.actions.showLoading(B)
    store.actions.activate(A)
    store.actions.close(B)
    expect(store.getSnapshot().activePath).toBe(A)

    store.actions.clear()
    store.actions.showText(A, 'late')
    store.actions.showError(B, 'late-error')
    expect(store.getSnapshot()).toMatchObject({ tabs: [], activePath: '' })
    expect(activeTab(store.getSnapshot())).toBeUndefined()
  })
})

describe('FilePreviewPanel', () => {
  it('shows the empty copy with no tab strip until a file opens', () => {
    const { store } = mount()
    expect(screen.getByText(zh['preview.empty'])).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    act(() => { store.actions.showLoading(A) })
    expect(screen.getByText(zh['preview.loading'])).toBeTruthy()
    expect(screen.getByRole('tablist', { name: zh['preview.tabs.aria'] })).toBeTruthy()
  })

  it('mounts the editable text engine with language from the path', async () => {
    const { store } = mount()
    act(() => {
      store.actions.showLoading(CS)
      store.actions.showText(CS, 'class Foo {}')
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('class Foo {}')).toBeTruthy()
    })
    const engine = screen.getByDisplayValue('class Foo {}').closest('[data-preview-engine]')!
    expect(engine.getAttribute('data-preview-engine')).toBe('codemirror')
    expect(engine.getAttribute('data-language')).toBe('csharp')
    expect(engine.getAttribute('data-readonly')).toBe('false')
  })

  it('marks dirty tabs and saves through writeText', async () => {
    const writeText = vi.fn(async () => {})
    const { store } = mount(writeText)
    act(() => {
      store.actions.showLoading(A)
      store.actions.showText(A, 'body-a')
    })
    await waitFor(() => { expect(screen.getByLabelText(`mock-editor-${A}`)).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(`mock-editor-${A}`), { target: { value: 'body-edited' } })
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('•')
    expect(tabOf(store.getSnapshot(), A)?.dirty).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: zh['preview.save'] }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(A, 'body-edited')
    })
    expect(tabOf(store.getSnapshot(), A)?.dirty).toBe(false)
  })

  it('surfaces save failures without clearing dirty', async () => {
    const writeText = vi.fn(async () => { throw new Error('write-denied') })
    const { store } = mount(writeText)
    act(() => {
      store.actions.showLoading(A)
      store.actions.showText(A, 'body-a')
    })
    await waitFor(() => { expect(screen.getByLabelText(`mock-editor-${A}`)).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(`mock-editor-${A}`), { target: { value: 'body-edited' } })
    fireEvent.click(screen.getByRole('button', { name: zh['preview.save'] }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('write-denied')
    })
    expect(tabOf(store.getSnapshot(), A)?.dirty).toBe(true)
  })

  it('switches by click and keyboard between two open files', async () => {
    const { store } = mount()
    act(() => {
      store.actions.showLoading(A)
      store.actions.showText(A, 'body-a')
      store.actions.showLoading(B)
      store.actions.showText(B, 'body-b')
    })
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['a.ts×', 'b.txt×'])
    await waitFor(() => { expect(screen.getByDisplayValue('body-b')).toBeTruthy() })

    fireEvent.click(screen.getByRole('tab', { selected: false }))
    await waitFor(() => { expect(screen.getByDisplayValue('body-a')).toBeTruthy() })
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('a.ts×')

    fireEvent.keyDown(screen.getByRole('tab', { selected: false }), { key: 'Enter' })
    await waitFor(() => { expect(screen.getByDisplayValue('body-b')).toBeTruthy() })
    fireEvent.keyDown(screen.getByRole('tab', { selected: false }), { key: ' ' })
    await waitFor(() => { expect(screen.getByDisplayValue('body-a')).toBeTruthy() })
    fireEvent.keyDown(screen.getByRole('tab', { selected: false }), { key: 'x' })
    expect(screen.getByDisplayValue('body-a')).toBeTruthy()
  })

  it('closes a tab through its button and shows the read failure of the active tab', () => {
    const { store, closePreview } = mount()
    act(() => {
      store.actions.showLoading(A)
      store.actions.showError(A, 'fs-failed')
      store.actions.showLoading(B)
      store.actions.showText(B, 'body-b')
    })
    fireEvent.click(screen.getByRole('button', { name: '关闭 b.txt' }))
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('fs-failed')
    expect(closePreview).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '关闭 a.ts' }))
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText(zh['preview.empty'])).toBeTruthy()
    expect(closePreview).toHaveBeenCalledTimes(1)
  })

  it('falls back when the ready body exceeds the preview size ceiling', async () => {
    const { store } = mount()
    const huge = 'x'.repeat(TEXT_PREVIEW_MAX_BYTES + 1)
    act(() => {
      store.actions.showLoading(A)
      store.actions.showText(A, huge)
    })
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(zh['preview.tooLarge'])
    })
    expect(screen.getByRole('status').getAttribute('data-preview-engine')).toBe('oversized')
    expect(screen.queryByDisplayValue(huge.slice(0, 32))).toBeNull()
  })

  it('toolbar Add to chat inserts the whole file when the engine reports no selection', async () => {
    const insertWorkspaceReference = vi.fn(() => true)
    const { store } = mount(vi.fn(async () => {}), insertWorkspaceReference)
    act(() => {
      store.actions.showLoading(A)
      store.actions.showText(A, 'body-a')
    })
    await waitFor(() => { expect(screen.getByLabelText(`mock-editor-${A}`)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['preview.addToChat'] }))
    expect(insertWorkspaceReference).toHaveBeenCalledWith('session', A, null)
  })

  it('selection callback inserts a line-range reference and surfaces insert failure', async () => {
    const insertWorkspaceReference = vi.fn(() => false)
    const { store } = mount(vi.fn(async () => {}), insertWorkspaceReference)
    act(() => {
      store.actions.showLoading(CS)
      store.actions.showText(CS, 'class Foo {}')
    })
    await waitFor(() => { expect(screen.getByLabelText(`mock-add-range-${CS}`)).toBeTruthy() })
    fireEvent.click(screen.getByLabelText(`mock-add-range-${CS}`))
    expect(insertWorkspaceReference).toHaveBeenCalledWith(
      'session',
      CS,
      { startLine: 120, endLine: 146 },
    )
    expect(screen.getByRole('status').textContent).toBe(zh['menu.addToChat.failed'])
  })
})
