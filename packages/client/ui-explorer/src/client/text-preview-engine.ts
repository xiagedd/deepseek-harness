/**
 * Text-preview engine seam for the explorer preview column.
 * FilePreviewPanel / TextPreviewBody depend only on these types and helpers;
 * CodeMirror 6 (v1) and a future Monaco adapter implement the same React props.
 *
 * Roadmap: editable CM6 now → Monaco / VS Code–like later. Do not call engine
 * APIs from panel / store / openFile — only this props contract.
 */

/** Language id resolved from a file path for syntax highlighting. */
export type TextPreviewLanguage =
  | 'csharp'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'python'
  | 'cpp'
  | 'java'
  | 'xml'
  | 'sql'
  | 'yaml'
  | 'go'
  | 'rust'
  | 'shell'
  | 'toml'
  | 'plain'

/**
 * Props every text-preview engine React wrapper must accept.
 * Engines stay swappable: business UI never imports CodeMirror or Monaco APIs.
 */
export interface TextPreviewEngineProps {
  /** Absolute workspace path (for aria / reconfigure keys). */
  path: string
  /** Document text shown in the editor (draft when dirty). */
  text: string
  /** Highlight language; `plain` when the extension has no dedicated grammar. */
  language: TextPreviewLanguage
  /** When true, keystrokes do not mutate the document. */
  readOnly: boolean
  /**
   * When false, the engine omits the line-number gutter (CodeMirror must
   * Compartment-reconfigure; CSS cannot disable `lineNumbers()`).
   * Defaults to true.
   */
  showLineNumbers?: boolean | undefined
  /**
   * Inclusive 1-based line range to scroll to and select (a reference chip's
   * `:120-148` suffix). `seq` keys the scroll so a repeat request with the
   * same range re-scrolls; the engine clamps out-of-range lines to the
   * document. Undefined leaves the viewport and selection untouched.
   */
  revealTarget?: { startLine: number; endLine: number; seq: number } | undefined
  /** Fires on every user edit with the full document (ignored when readOnly). */
  onChange?: ((text: string) => void) | undefined
  /** Invoked for Mod-S when the editor owns focus (Save). */
  onSave?: (() => void) | undefined
  /**
   * Invoked for Mod-L (Add to chat) when the editor owns focus.
   * Passes an inclusive 1-based line range for a non-empty selection, or
   * `null` for a caret-only / empty selection (caller inserts the whole file).
   */
  onAddToChat?: ((
    range: { startLine: number; endLine: number } | null,
  ) => void) | undefined
  /**
   * Optional mutable handle the engine fills so a toolbar button can invoke
   * the same Add-to-chat path as Mod-L (current selection or whole file).
   */
  addToChatApiRef?: { current: { invoke: () => void } | null } | undefined
  /** Optional CSS Modules class on the engine root. */
  className?: string | undefined
}

/** Client-side byte ceiling before mounting a rich text engine (1 MiB). */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024

/**
 * UTF-8 byte length of `text` (JS string length is UTF-16 code units).
 * @param text - file body from the preview store.
 * @returns byte length under UTF-8 encoding.
 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/**
 * Whether `text` exceeds the rich-preview size ceiling.
 * @param text - file body from the preview store.
 * @returns true when the engine must not mount.
 */
export function isOversizedTextPreview(text: string): boolean {
  return utf8ByteLength(text) > TEXT_PREVIEW_MAX_BYTES
}
