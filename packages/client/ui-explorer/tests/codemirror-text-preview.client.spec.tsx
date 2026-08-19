// @vitest-environment jsdom
/**
 * CodeMirror adapter: mounts a read-only EditorView and destroys it on unmount.
 * View/state are mocked so jsdom never needs a real CM6 DOM layout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const {
  destroy,
  dispatch,
  create,
  ofReadOnly,
  ofEditable,
  contentAttributes,
  theme,
} = vi.hoisted(() => ({
  destroy: vi.fn(),
  dispatch: vi.fn(),
  create: vi.fn(),
  ofReadOnly: vi.fn((value: boolean) => ({ readOnly: value })),
  ofEditable: vi.fn((value: boolean) => ({ editable: value })),
  contentAttributes: vi.fn((attrs: Record<string, string>) => ({ contentAttributes: attrs })),
  theme: vi.fn(() => ({ theme: true })),
}))

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: (...args: unknown[]) => {
      create(...args)
      return { doc: { toString: () => 'initial', length: 7 } }
    },
    readOnly: { of: ofReadOnly },
  },
  Compartment: class {
    of(ext: unknown) {
      return ext
    }
    reconfigure(ext: unknown) {
      return { reconfigure: ext }
    }
  },
}))

vi.mock('@codemirror/view', () => ({
  EditorView: Object.assign(
    class {
      state = { doc: { toString: () => 'initial', length: 7 } }
      dispatch = dispatch
      destroy = destroy
      constructor(config: { parent: HTMLElement }) {
        config.parent.setAttribute('data-view-mounted', 'true')
      }
    },
    {
      editable: { of: ofEditable },
      contentAttributes: { of: contentAttributes },
      theme,
      updateListener: { of: () => ({ updateListener: true }) },
    },
  ),
  keymap: { of: (keys: unknown) => keys },
  lineNumbers: () => 'lineNumbers',
  highlightActiveLine: () => 'highlightActiveLine',
  highlightActiveLineGutter: () => 'highlightActiveLineGutter',
  drawSelection: () => 'drawSelection',
}))

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => 'history',
  historyKeymap: [],
}))

vi.mock('@codemirror/search', () => ({
  searchKeymap: [],
  highlightSelectionMatches: () => 'highlightSelectionMatches',
  search: () => 'search',
}))

vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: () => 'syntaxHighlighting',
  defaultHighlightStyle: {},
  HighlightStyle: { define: () => ({}) },
  StreamLanguage: { define: (mode: unknown) => ({ stream: mode }) },
  bracketMatching: () => 'bracketMatching',
  foldGutter: () => 'foldGutter',
  foldKeymap: [],
}))

vi.mock('@lezer/highlight', () => {
  const tag = new Proxy(() => ({}), {
    get: () => tag,
    apply: () => ({}),
  })
  return { tags: new Proxy({}, { get: () => tag }) }
})
vi.mock('@codemirror/lang-javascript', () => ({ javascript: () => 'javascript' }))
vi.mock('@codemirror/lang-json', () => ({ json: () => 'json' }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => 'markdown' }))
vi.mock('@codemirror/lang-html', () => ({ html: () => 'html' }))
vi.mock('@codemirror/lang-css', () => ({ css: () => 'css' }))
vi.mock('@codemirror/lang-python', () => ({ python: () => 'python' }))
vi.mock('@codemirror/lang-cpp', () => ({ cpp: () => 'cpp' }))
vi.mock('@codemirror/lang-java', () => ({ java: () => 'java' }))
vi.mock('@codemirror/lang-xml', () => ({ xml: () => 'xml' }))
vi.mock('@codemirror/lang-sql', () => ({ sql: () => 'sql' }))
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => 'yaml' }))
vi.mock('@codemirror/legacy-modes/mode/clike', () => ({ csharp: 'csharp' }))
vi.mock('@codemirror/legacy-modes/mode/go', () => ({ go: 'go' }))
vi.mock('@codemirror/legacy-modes/mode/rust', () => ({ rust: 'rust' }))
vi.mock('@codemirror/legacy-modes/mode/shell', () => ({ shell: 'shell' }))
vi.mock('@codemirror/legacy-modes/mode/toml', () => ({ toml: 'toml' }))

import { CodeMirrorTextPreview } from '../src/client/CodeMirrorTextPreview.tsx'

afterEach(() => {
  cleanup()
  destroy.mockClear()
  dispatch.mockClear()
  create.mockClear()
  ofReadOnly.mockClear()
  ofEditable.mockClear()
})

describe('CodeMirrorTextPreview', () => {
  it('creates an editable EditorView and destroys it on unmount', () => {
    const { unmount, container } = render(
      <CodeMirrorTextPreview
        path="/ws/Foo.cs"
        text="class Foo {}"
        language="csharp"
        readOnly={false}
      />,
    )
    expect(container.querySelector('[data-view-mounted="true"]')).toBeTruthy()
    expect(ofReadOnly).toHaveBeenCalledWith(false)
    expect(ofEditable).toHaveBeenCalledWith(true)
    expect(create).toHaveBeenCalled()
    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('dispatches a full-document replace when text changes', () => {
    const { rerender } = render(
      <CodeMirrorTextPreview path="/ws/a.ts" text="one" language="typescript" readOnly={false} />,
    )
    act(() => {
      rerender(
        <CodeMirrorTextPreview path="/ws/a.ts" text="two" language="typescript" readOnly={false} />,
      )
    })
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 7, insert: 'two' },
    })
  })

  it('covers language extension branches used by the preview map', () => {
    const languages = [
      'javascript', 'typescript', 'json', 'markdown', 'html', 'css', 'python',
      'cpp', 'java', 'xml', 'sql', 'yaml', 'csharp', 'go', 'rust', 'shell', 'toml', 'plain',
    ] as const
    for (const language of languages) {
      const { unmount } = render(
        <CodeMirrorTextPreview path={`/ws/f.${language}`} text="x" language={language} readOnly={false} />,
      )
      unmount()
    }
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(languages.length)
  })

  it('reconfigures the line-number Compartment when showLineNumbers flips', () => {
    const { rerender, container } = render(
      <CodeMirrorTextPreview
        path="/ws/a.ts"
        text="one"
        language="typescript"
        readOnly={false}
        showLineNumbers
      />,
    )
    expect(container.querySelector('[data-line-numbers="true"]')).toBeTruthy()
    dispatch.mockClear()
    act(() => {
      rerender(
        <CodeMirrorTextPreview
          path="/ws/a.ts"
          text="one"
          language="typescript"
          readOnly={false}
          showLineNumbers={false}
        />,
      )
    })
    expect(container.querySelector('[data-line-numbers="false"]')).toBeTruthy()
    const effects = dispatch.mock.calls.map(call => call[0] as { effects?: { reconfigure?: unknown } })
    expect(effects.some(arg => arg.effects !== undefined && 'reconfigure' in arg.effects)).toBe(true)
  })

  it('binds Mod-l with preventDefault and reports selection or whole-file', () => {
    const onAddToChat = vi.fn()
    render(
      <CodeMirrorTextPreview
        path="/ws/a.ts"
        text="line1\nline2\nline3"
        language="typescript"
        readOnly={false}
        onAddToChat={onAddToChat}
      />,
    )
    expect(create).toHaveBeenCalled()
    const config = create.mock.calls[0]![0] as { extensions: unknown[] }
    const flat = config.extensions.flat(Infinity) as Array<{
      key?: string
      preventDefault?: boolean
      run?: (view: {
        state: {
          selection: { main: { from: number; to: number } }
          doc: { lineAt: (pos: number) => { number: number } }
        }
      }) => boolean
    }>
    const modL = flat.find(entry => entry !== null && typeof entry === 'object' && entry.key === 'Mod-l')
    expect(modL).toBeDefined()
    expect(modL!.preventDefault).toBe(true)

    const doc = {
      lineAt: (pos: number) => {
        if (pos < 6) return { number: 1 }
        if (pos < 12) return { number: 2 }
        return { number: 3 }
      },
    }
    const withSelection = {
      state: { selection: { main: { from: 0, to: 11 } }, doc },
    }
    expect(modL!.run!(withSelection)).toBe(true)
    expect(onAddToChat).toHaveBeenCalledWith({ startLine: 1, endLine: 2 })

    onAddToChat.mockClear()
    const caretOnly = {
      state: { selection: { main: { from: 3, to: 3 } }, doc },
    }
    expect(modL!.run!(caretOnly)).toBe(true)
    expect(onAddToChat).toHaveBeenCalledWith(null)
  })

  it('Mod-l no-ops safely when onAddToChat is absent', () => {
    render(
      <CodeMirrorTextPreview path="/ws/a.ts" text="x" language="typescript" readOnly={false} />,
    )
    const config = create.mock.calls.at(-1)![0] as { extensions: unknown[] }
    const flat = config.extensions.flat(Infinity) as Array<{
      key?: string
      run?: (view: {
        state: {
          selection: { main: { from: number; to: number } }
          doc: { lineAt: (pos: number) => { number: number } }
        }
      }) => boolean
    }>
    const modL = flat.find(entry => entry !== null && typeof entry === 'object' && entry.key === 'Mod-l')
    expect(modL!.run!({
      state: {
        selection: { main: { from: 0, to: 1 } },
        doc: { lineAt: () => ({ number: 1 }) },
      },
    })).toBe(false)
  })
})
