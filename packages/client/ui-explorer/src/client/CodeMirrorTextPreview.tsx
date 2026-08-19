/**
 * CodeMirror 6 adapter for the explorer text-preview engine seam.
 * Only this module may import `@codemirror/*`. Swap to Monaco by replacing
 * this file (and the lazy import in TextPreviewBody) while keeping
 * {@link TextPreviewEngineProps} unchanged.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { EditorState, EditorSelection, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { csharp } from '@codemirror/legacy-modes/mode/clike'
import { go } from '@codemirror/legacy-modes/mode/go'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import type { Extension } from '@codemirror/state'
import type { TextPreviewEngineProps, TextPreviewLanguage } from './text-preview-engine.ts'
import { clampLineRange, lineRangeFromSelection } from './workspace-reference.ts'

/**
 * Token colors read `--dsh-editor-*` (Host settings → theme.overrideTokens),
 * falling back to the existing `--shiki-*` product palette.
 */
const dswHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--dsh-editor-token-keyword, var(--shiki-token-keyword))' },
  { tag: tags.comment, color: 'var(--dsh-editor-token-comment, var(--shiki-token-comment))' },
  { tag: tags.string, color: 'var(--dsh-editor-token-string, var(--shiki-token-string))' },
  { tag: tags.number, color: 'var(--dsh-editor-token-number, var(--shiki-token-constant))' },
  { tag: tags.bool, color: 'var(--dsh-editor-token-constant, var(--shiki-token-constant))' },
  { tag: tags.null, color: 'var(--dsh-editor-token-constant, var(--shiki-token-constant))' },
  { tag: tags.operator, color: 'var(--dsh-editor-token-punctuation, var(--shiki-token-punctuation))' },
  { tag: tags.punctuation, color: 'var(--dsh-editor-token-punctuation, var(--shiki-token-punctuation))' },
  { tag: tags.function(tags.variableName), color: 'var(--dsh-editor-token-function, var(--shiki-token-function))' },
  { tag: tags.definition(tags.variableName), color: 'var(--dsh-editor-token-parameter, var(--shiki-token-parameter))' },
  { tag: tags.typeName, color: 'var(--dsh-editor-token-constant, var(--shiki-token-constant))' },
  { tag: tags.className, color: 'var(--dsh-editor-token-constant, var(--shiki-token-constant))' },
  { tag: tags.propertyName, color: 'var(--dsh-editor-token-parameter, var(--shiki-token-parameter))' },
  { tag: tags.link, color: 'var(--dsh-editor-token-link, var(--shiki-token-link))' },
  { tag: tags.meta, color: 'var(--dsh-editor-token-comment, var(--shiki-token-comment))' },
])

/**
 * Editor chrome reads `--dsh-editor-*` with `--dsw-*` fallbacks.
 * Selection stays on an overlay token; active-line is semi-transparent so the
 * selection layer remains visible on the caret's own line.
 */
const dswTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--dsh-editor-font-size, 13px)',
    backgroundColor: 'var(--dsh-editor-bg, var(--dsw-alias-bg-base))',
    color: 'var(--dsh-editor-fg, var(--dsw-alias-label-primary))',
    fontFamily: 'var(--ds-font-family-code)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--ds-font-family-code)',
    lineHeight: 'var(--dsh-editor-line-height, 22px)',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'var(--dsh-editor-caret, var(--dsw-alias-label-primary))',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--dsh-editor-gutter-bg, var(--dsw-alias-bg-base))',
    color: 'var(--dsh-editor-gutter-fg, var(--dsw-alias-label-tertiary))',
    border: 'none',
    borderRight: '1px solid var(--dsh-editor-border, var(--dsw-alias-border-l2))',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--dsh-editor-active-line, var(--dsw-alias-bg-layer-1))',
  },
  // The selection layer paints beneath .cm-content, so an opaque active-line
  // background would hide the selection on the caret's own line.
  '.cm-activeLine': {
    backgroundColor: 'var(--dsh-editor-active-line, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent))',
  },
  '.cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--dsh-editor-selection, var(--dsw-alias-bg-overlay))',
  },
  '&.cm-focused .cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--dsh-editor-selection, var(--dsw-alias-bg-overlay))',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--dsh-editor-selection-match, var(--dsw-alias-bg-multi-select))',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--dsh-editor-caret, var(--dsw-alias-label-primary))',
  },
  '.cm-panels': {
    backgroundColor: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--dsh-editor-selection-match, var(--dsw-alias-bg-multi-select))',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--dsh-editor-selection, var(--dsw-alias-bg-overlay))',
  },
})

/**
 * Build a CodeMirror language extension for a preview language id.
 * @param language - resolved preview language.
 * @returns a language extension, or undefined for plain text.
 */
function languageExtension(language: TextPreviewLanguage): Extension | undefined {
  switch (language) {
    case 'javascript':
      return javascript()
    case 'typescript':
      return javascript({ typescript: true })
    case 'json':
      return json()
    case 'markdown':
      return markdown()
    case 'html':
      return html()
    case 'css':
      return css()
    case 'python':
      return python()
    case 'cpp':
      return cpp()
    case 'java':
      return java()
    case 'xml':
      return xml()
    case 'sql':
      return sql()
    case 'yaml':
      return yaml()
    case 'csharp':
      return StreamLanguage.define(csharp)
    case 'go':
      return StreamLanguage.define(go)
    case 'rust':
      return StreamLanguage.define(rust)
    case 'shell':
      return StreamLanguage.define(shell)
    case 'toml':
      return StreamLanguage.define(toml)
    case 'plain':
      return undefined
    default: {
      const _exhaustive: never = language
      return _exhaustive
    }
  }
}

/** Line-number gutter extensions (or none) for the Compartment. */
function lineNumberExtensions(show: boolean): Extension {
  return show ? [lineNumbers(), highlightActiveLineGutter()] : []
}

/**
 * Mount a CodeMirror 6 view for one preview tab body (editable by default).
 * @param props - engine props from {@link TextPreviewEngineProps}.
 * @returns a host div the EditorView attaches to.
 */
export function CodeMirrorTextPreview({
  path,
  text,
  language,
  readOnly,
  showLineNumbers = true,
  revealTarget,
  onChange,
  onSave,
  onAddToChat,
  addToChatApiRef,
  className,
}: TextPreviewEngineProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  const lineNumberCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onAddToChatRef = useRef(onAddToChat)
  onAddToChatRef.current = onAddToChat
  const addToChatApiRefHeld = useRef(addToChatApiRef)
  addToChatApiRefHeld.current = addToChatApiRef

  useEffect(() => {
    const host = hostRef.current
    /* v8 ignore next -- host is mounted before effects in production React */
    if (host === null) return

    const runAddToChat = (view: EditorView): boolean => {
      const handler = onAddToChatRef.current
      if (handler === undefined) return false
      const { from, to } = view.state.selection.main
      handler(lineRangeFromSelection(view.state.doc, from, to))
      return true
    }

    const lang = languageExtension(language)
    const state = EditorState.create({
      doc: text,
      extensions: [
        lineNumberCompartment.current.of(lineNumberExtensions(showLineNumbers)),
        highlightActiveLine(),
        drawSelection(),
        foldGutter(),
        bracketMatching(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current?.()
              return true
            },
          },
          {
            // Cursor-like "add selection to chat"; preventDefault so browsers
            // do not steal Ctrl/Cmd+L for the address bar while the editor is focused.
            key: 'Mod-l',
            preventDefault: true,
            run: runAddToChat,
          },
        ]),
        editableCompartment.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        dswTheme,
        syntaxHighlighting(dswHighlight, { fallback: true }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langCompartment.current.of(lang === undefined ? [] : lang),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          onChangeRef.current?.(update.state.doc.toString())
        }),
        EditorView.contentAttributes.of({
          'aria-label': path,
          'data-preview-engine': 'codemirror',
          'data-language': language,
          'data-readonly': readOnly ? 'true' : 'false',
          'data-line-numbers': showLineNumbers ? 'true' : 'false',
        }),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    const apiSlot = addToChatApiRefHeld.current
    if (apiSlot !== undefined) {
      apiSlot.current = {
        invoke: () => { runAddToChat(view) },
      }
    }
    return () => {
      if (apiSlot !== undefined && apiSlot.current !== null) apiSlot.current = null
      view.destroy()
      viewRef.current = null
    }
  }, [path, language])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const current = view.state.doc.toString()
    if (current === text) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    })
  }, [text])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    })
  }, [readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({
      effects: lineNumberCompartment.current.reconfigure(lineNumberExtensions(showLineNumbers)),
    })
  }, [showLineNumbers])

  // Scroll to and select a referenced line range. Keyed on the request seq, so
  // clicking the same chip again re-scrolls a tab that is already current, and
  // last among these effects so the mount case runs against the settled doc.
  // Out-of-range lines clamp — a chip can outlive the edit that shortened its
  // file, and landing on the last line beats not moving at all.
  useEffect(() => {
    const view = viewRef.current
    if (view === null || revealTarget === undefined) return
    const { startLine, endLine } = clampLineRange(revealTarget, view.state.doc.lines)
    const from = view.state.doc.line(startLine).from
    const to = view.state.doc.line(endLine).to
    view.dispatch({
      selection: EditorSelection.range(from, to),
      // Center the range's first line: a target pinned to the viewport top
      // hides the context above it, and 'nearest' would leave a range that is
      // already barely visible where it is.
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
  }, [revealTarget?.seq])

  return (
    <div
      ref={hostRef}
      className={className}
      data-preview-engine="codemirror"
      data-language={language}
      data-readonly={readOnly ? 'true' : 'false'}
      data-line-numbers={showLineNumbers ? 'true' : 'false'}
    />
  )
}
