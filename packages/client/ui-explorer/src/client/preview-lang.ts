/**
 * Preview-column language routing for the text-preview engine.
 * Kept inside ui-explorer (not tool-fs) per client layering.
 */
import type { TextPreviewLanguage } from './text-preview-engine.ts'

/**
 * Extension → language id. Unknown extensions fall back to `plain`.
 * Own-property lookup only (no Object.prototype keys).
 */
export const PREVIEW_LANG_BY_EXT: Readonly<Record<string, TextPreviewLanguage>> = {
  cs: 'csharp',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cxx: 'cpp',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  shader: 'cpp',
  hlsl: 'cpp',
  cginc: 'cpp',
  compute: 'cpp',
  shadergraph: 'cpp',
  css: 'css',
  scss: 'css',
  html: 'html',
  htm: 'html',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
}

/** Lowercased extension after the last dot; empty when the basename has none. */
export function extensionOfPath(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Whether `path` is in the rich text-preview set (code / markdown / data / shader / scripts).
 * Plain `.txt` / unknown extensions still mount the engine as `plain`.
 * @param path - absolute or workspace-relative file path.
 * @returns true when a dedicated grammar is preferred over plain.
 */
export function isRichPreviewPath(path: string): boolean {
  const ext = extensionOfPath(path)
  return ext !== '' && Object.hasOwn(PREVIEW_LANG_BY_EXT, ext)
}

/**
 * Map a preview path to a {@link TextPreviewLanguage} for the text-preview engine.
 * @param path - absolute or workspace-relative file path.
 * @returns language id, or `plain` when the extension is unknown / absent.
 */
export function langFromPreviewPath(path: string): TextPreviewLanguage {
  const ext = extensionOfPath(path)
  if (ext === '') return 'plain'
  return PREVIEW_LANG_BY_EXT[ext] ?? 'plain'
}
