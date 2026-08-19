/**
 * Business-facing text body for the explorer preview column.
 * Chooses oversized fallback vs a lazy-loaded text-preview engine; never
 * imports CodeMirror or Monaco APIs directly.
 */
import { lazy, Suspense, type ReactNode } from 'react'
import { langFromPreviewPath } from './preview-lang.ts'
import { isOversizedTextPreview, type TextPreviewEngineProps } from './text-preview-engine.ts'
import css from './FilePreviewPanel.module.css'

/** Lazy CodeMirror adapter chunk — first file open pays the cost, not first paint. */
const LazyCodeMirrorTextPreview = lazy(async (): Promise<{ default: (props: TextPreviewEngineProps) => ReactNode }> => {
  const mod = await import('./CodeMirrorTextPreview.tsx')
  return { default: mod.CodeMirrorTextPreview }
})

/** Locale keys consumed by the text body (subset of explorer). */
export interface TextPreviewBodyCopy {
  /** Shown while the engine chunk loads. */
  loading: string
  /** Shown when the file exceeds the rich-preview size ceiling. */
  tooLarge: string
}

/**
 * Render ready text: oversized status, or the swappable text-preview engine.
 * @param props.path - active tab path.
 * @param props.text - active tab draft / content.
 * @param props.readOnly - when true, the engine refuses edits.
 * @param props.onChange - draft updates from the engine.
 * @param props.onSave - Mod-S handler from the engine.
 * @param props.className - CSS Modules body class.
 * @param props.copy - Chinese/locale strings for loading and oversized.
 * @returns the preview body node.
 */
export function TextPreviewBody({
  path,
  text,
  readOnly,
  showLineNumbers = true,
  revealTarget,
  onChange,
  onSave,
  onAddToChat,
  addToChatApiRef,
  className,
  copy,
}: {
  path: string
  text: string
  readOnly: boolean
  showLineNumbers?: boolean | undefined
  revealTarget?: { startLine: number; endLine: number; seq: number } | undefined
  onChange?: ((text: string) => void) | undefined
  onSave?: (() => void) | undefined
  onAddToChat?: ((
    range: { startLine: number; endLine: number } | null,
  ) => void) | undefined
  addToChatApiRef?: { current: { invoke: () => void } | null } | undefined
  className: string | undefined
  copy: TextPreviewBodyCopy
}): ReactNode {
  if (isOversizedTextPreview(text)) {
    return (
      <div className={css.empty} role="status" data-preview-engine="oversized">
        {copy.tooLarge}
      </div>
    )
  }

  const language = langFromPreviewPath(path)
  return (
    <Suspense fallback={<div className={css.empty} role="status">{copy.loading}</div>}>
      <LazyCodeMirrorTextPreview
        path={path}
        text={text}
        language={language}
        readOnly={readOnly}
        showLineNumbers={showLineNumbers}
        revealTarget={revealTarget}
        onChange={onChange}
        onSave={onSave}
        onAddToChat={onAddToChat}
        addToChatApiRef={addToChatApiRef}
        className={className}
      />
    </Suspense>
  )
}
