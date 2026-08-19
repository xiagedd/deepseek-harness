/** Explorer preview editor appearance stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the explorer preview appearance surface. */
export const EDITOR_PREVIEW_SETTINGS_NAMESPACE = 'ui-explorer-preview'

/** Field carrying the selected built-in editor preset. */
export const EDITOR_PRESET_FIELD = 'presetId'

/** Field carrying user chrome / token / typography overrides. */
export const EDITOR_OVERRIDES_FIELD = 'overrides'

/** Built-in editor presets accepted at settings boundaries. */
export const EDITOR_PRESET_IDS = ['default', 'vs-dark', 'vs-light', 'one-dark'] as const

/** Persistable editor preset id. */
export type EditorPresetId = typeof EDITOR_PRESET_IDS[number]

/** Default preset follows the application light/dark chrome. */
export const DEFAULT_EDITOR_PRESET: EditorPresetId = 'default'

/** Optional chrome / syntax / typography overrides over the active preset. */
export interface EditorPreviewOverrides {
  bg?: string
  fg?: string
  gutterBg?: string
  gutterFg?: string
  activeLine?: string
  selection?: string
  caret?: string
  border?: string
  tokenKeyword?: string
  tokenComment?: string
  tokenString?: string
  tokenNumber?: string
  tokenFunction?: string
  tokenParameter?: string
  tokenPunctuation?: string
  tokenConstant?: string
  tokenLink?: string
  fontSize?: string
  lineHeight?: string
  showLineNumbers?: boolean
}

/** Durable explorer-preview section shared by Host schema and browser scope. */
export interface EditorPreviewSettings {
  /** Selected built-in preset. */
  presetId: EditorPresetId
  /** Partial overrides stacked on the preset; empty means preset-only. */
  overrides: EditorPreviewOverrides
}

/** Empty overrides object used as the schema default and restore target. */
export const DEFAULT_EDITOR_OVERRIDES: EditorPreviewOverrides = {}

/** Default section when the user-settings document has no override. */
export const DEFAULT_EDITOR_PREVIEW_SETTINGS: EditorPreviewSettings = {
  presetId: DEFAULT_EDITOR_PRESET,
  overrides: DEFAULT_EDITOR_OVERRIDES,
}

/**
 * Durable schema; also the wire envelope the browser scope validates against.
 * Overrides use `z.any()` because schemastery object defaults require every
 * nested key; runtime still stores a plain partial override map.
 */
export const EditorPreviewSettingsSchema = z.object({
  [EDITOR_PRESET_FIELD]: z.union([...EDITOR_PRESET_IDS]).default(DEFAULT_EDITOR_PRESET),
  [EDITOR_OVERRIDES_FIELD]: z.any().default({}),
}) as z<EditorPreviewSettings>

/**
 * Narrow one wire or registry value to a persistable preset id.
 * @param value - value crossing the settings boundary.
 * @returns whether the value is a built-in preset.
 */
export function isEditorPresetId(value: unknown): value is EditorPresetId {
  return EDITOR_PRESET_IDS.some(id => id === value)
}

/** Resolved CSS custom-property map consumed by CodeMirror (`--dsh-editor-*`). */
export interface ResolvedEditorCssVars {
  '--dsh-editor-bg': string
  '--dsh-editor-fg': string
  '--dsh-editor-gutter-bg': string
  '--dsh-editor-gutter-fg': string
  '--dsh-editor-active-line': string
  '--dsh-editor-selection': string
  '--dsh-editor-selection-match': string
  '--dsh-editor-caret': string
  '--dsh-editor-border': string
  '--dsh-editor-font-size': string
  '--dsh-editor-line-height': string
  '--dsh-editor-token-keyword': string
  '--dsh-editor-token-comment': string
  '--dsh-editor-token-string': string
  '--dsh-editor-token-number': string
  '--dsh-editor-token-function': string
  '--dsh-editor-token-parameter': string
  '--dsh-editor-token-punctuation': string
  '--dsh-editor-token-constant': string
  '--dsh-editor-token-link': string
}

/** Fully resolved editor appearance for one color scheme. */
export interface ResolvedEditorAppearance {
  /** CSS custom properties to publish through theme.overrideTokens. */
  cssVars: ResolvedEditorCssVars
  /** Whether CodeMirror mounts the lineNumbers extension. */
  showLineNumbers: boolean
}

/** One complete palette before user overrides. */
interface EditorPalette {
  bg: string
  fg: string
  gutterBg: string
  gutterFg: string
  activeLine: string
  selection: string
  selectionMatch: string
  caret: string
  border: string
  tokenKeyword: string
  tokenComment: string
  tokenString: string
  tokenNumber: string
  tokenFunction: string
  tokenParameter: string
  tokenPunctuation: string
  tokenConstant: string
  tokenLink: string
  fontSize: string
  lineHeight: string
  showLineNumbers: boolean
}

/**
 * Default palette tracks product chrome / shiki tokens via CSS var references
 * so light↔dark flips with the application theme without republishing hex.
 */
const DEFAULT_PALETTE: EditorPalette = {
  bg: 'var(--dsw-alias-bg-base)',
  fg: 'var(--dsw-alias-label-primary)',
  gutterBg: 'var(--dsw-alias-bg-base)',
  gutterFg: 'var(--dsw-alias-label-tertiary)',
  activeLine: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent)',
  selection: 'var(--dsw-alias-bg-overlay)',
  selectionMatch: 'var(--dsw-alias-bg-multi-select)',
  caret: 'var(--dsw-alias-label-primary)',
  border: 'var(--dsw-alias-border-l2)',
  tokenKeyword: 'var(--shiki-token-keyword)',
  tokenComment: 'var(--shiki-token-comment)',
  tokenString: 'var(--shiki-token-string)',
  tokenNumber: 'var(--shiki-token-constant)',
  tokenFunction: 'var(--shiki-token-function)',
  tokenParameter: 'var(--shiki-token-parameter)',
  tokenPunctuation: 'var(--shiki-token-punctuation)',
  tokenConstant: 'var(--shiki-token-constant)',
  tokenLink: 'var(--shiki-token-link)',
  fontSize: '13px',
  lineHeight: '22px',
  showLineNumbers: true,
}

/** VS Code Dark+–inspired absolute palette (same in light and dark app modes). */
const VS_DARK: EditorPalette = {
  bg: '#1e1e1e',
  fg: '#d4d4d4',
  gutterBg: '#1e1e1e',
  gutterFg: '#858585',
  activeLine: 'color-mix(in srgb, #2a2a2a 55%, transparent)',
  selection: '#264f78',
  selectionMatch: '#3a3d41',
  caret: '#aeafad',
  border: '#404040',
  tokenKeyword: '#569cd6',
  tokenComment: '#6a9955',
  tokenString: '#ce9178',
  tokenNumber: '#b5cea8',
  tokenFunction: '#dcdcaa',
  tokenParameter: '#9cdcfe',
  tokenPunctuation: '#d4d4d4',
  tokenConstant: '#4fc1ff',
  tokenLink: '#3794ff',
  fontSize: '13px',
  lineHeight: '22px',
  showLineNumbers: true,
}

/** VS Code Light+–inspired absolute palette. */
const VS_LIGHT: EditorPalette = {
  bg: '#ffffff',
  fg: '#000000',
  gutterBg: '#ffffff',
  gutterFg: '#237893',
  activeLine: 'color-mix(in srgb, #f0f0f0 55%, transparent)',
  selection: '#add6ff',
  selectionMatch: '#e5ebf1',
  caret: '#000000',
  border: '#e5e5e5',
  tokenKeyword: '#0000ff',
  tokenComment: '#008000',
  tokenString: '#a31515',
  tokenNumber: '#098658',
  tokenFunction: '#795e26',
  tokenParameter: '#001080',
  tokenPunctuation: '#000000',
  tokenConstant: '#0070c1',
  tokenLink: '#0000ff',
  fontSize: '13px',
  lineHeight: '22px',
  showLineNumbers: true,
}

/** Atom One Dark–inspired absolute palette. */
const ONE_DARK: EditorPalette = {
  bg: '#282c34',
  fg: '#abb2bf',
  gutterBg: '#282c34',
  gutterFg: '#636d83',
  activeLine: 'color-mix(in srgb, #2c313c 55%, transparent)',
  selection: '#3e4451',
  selectionMatch: '#3e4451',
  caret: '#528bff',
  border: '#181a1f',
  tokenKeyword: '#c678dd',
  tokenComment: '#5c6370',
  tokenString: '#98c379',
  tokenNumber: '#d19a66',
  tokenFunction: '#61afef',
  tokenParameter: '#e06c75',
  tokenPunctuation: '#abb2bf',
  tokenConstant: '#d19a66',
  tokenLink: '#61afef',
  fontSize: '13px',
  lineHeight: '22px',
  showLineNumbers: true,
}

/**
 * Pick the base palette for one preset.
 * @param presetId - built-in preset.
 * @returns palette before user overrides.
 */
export function paletteForPreset(presetId: EditorPresetId): EditorPalette {
  switch (presetId) {
    case 'default':
      return DEFAULT_PALETTE
    case 'vs-dark':
      return VS_DARK
    case 'vs-light':
      return VS_LIGHT
    case 'one-dark':
      return ONE_DARK
    default: {
      const _exhaustive: never = presetId
      return _exhaustive
    }
  }
}

/**
 * Resolve preset + overrides into CSS vars and the line-number flag.
 * @param settings - durable section (or defaults).
 * @returns appearance for ThemePresenter / CodeMirror consumption.
 */
export function resolveEditorAppearance(
  settings: EditorPreviewSettings = DEFAULT_EDITOR_PREVIEW_SETTINGS,
): ResolvedEditorAppearance {
  const base = paletteForPreset(settings.presetId)
  const o = settings.overrides
  const showLineNumbers = o.showLineNumbers ?? base.showLineNumbers
  return {
    showLineNumbers,
    cssVars: {
      '--dsh-editor-bg': o.bg ?? base.bg,
      '--dsh-editor-fg': o.fg ?? base.fg,
      '--dsh-editor-gutter-bg': o.gutterBg ?? base.gutterBg,
      '--dsh-editor-gutter-fg': o.gutterFg ?? base.gutterFg,
      '--dsh-editor-active-line': o.activeLine ?? base.activeLine,
      '--dsh-editor-selection': o.selection ?? base.selection,
      '--dsh-editor-selection-match': base.selectionMatch,
      '--dsh-editor-caret': o.caret ?? base.caret,
      '--dsh-editor-border': o.border ?? base.border,
      '--dsh-editor-font-size': o.fontSize ?? base.fontSize,
      '--dsh-editor-line-height': o.lineHeight ?? base.lineHeight,
      '--dsh-editor-token-keyword': o.tokenKeyword ?? base.tokenKeyword,
      '--dsh-editor-token-comment': o.tokenComment ?? base.tokenComment,
      '--dsh-editor-token-string': o.tokenString ?? base.tokenString,
      '--dsh-editor-token-number': o.tokenNumber ?? base.tokenNumber,
      '--dsh-editor-token-function': o.tokenFunction ?? base.tokenFunction,
      '--dsh-editor-token-parameter': o.tokenParameter ?? base.tokenParameter,
      '--dsh-editor-token-punctuation': o.tokenPunctuation ?? base.tokenPunctuation,
      '--dsh-editor-token-constant': o.tokenConstant ?? base.tokenConstant,
      '--dsh-editor-token-link': o.tokenLink ?? base.tokenLink,
    },
  }
}

/**
 * Wrap resolved CSS vars as `{ light, dark }` pairs for theme.overrideTokens.
 * Absolute presets and overrides already bake scheme; both modes get the same values.
 * @param cssVars - resolved `--dsh-editor-*` map.
 * @returns override layer accepted by ThemeRuntime.overrideTokens.
 */
export function editorCssVarsToTokenOverrides(
  cssVars: ResolvedEditorCssVars,
): Record<string, { light: string; dark: string }> {
  const out: Record<string, { light: string; dark: string }> = {}
  for (const name of Object.keys(cssVars) as (keyof ResolvedEditorCssVars)[]) {
    const value = cssVars[name]
    out[name] = { light: value, dark: value }
  }
  return out
}
