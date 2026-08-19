/** Pure resolve / schema coverage for explorer preview editor settings. */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_PREVIEW_SETTINGS, EditorPreviewSettingsSchema,
  editorCssVarsToTokenOverrides, isEditorPresetId, paletteForPreset,
  resolveEditorAppearance,
} from '../src/preview-settings.ts'

describe('preview-settings', () => {
  it('schema defaults to Follow-UI preset with empty overrides', () => {
    expect(EditorPreviewSettingsSchema({} as never)).toEqual(DEFAULT_EDITOR_PREVIEW_SETTINGS)
  })

  it('narrows preset ids and rejects unknowns', () => {
    expect(isEditorPresetId('vs-dark')).toBe(true)
    expect(isEditorPresetId('sepia')).toBe(false)
  })

  it('resolves absolute presets and stacks overrides', () => {
    const base = resolveEditorAppearance({ presetId: 'vs-dark', overrides: {} })
    expect(base.cssVars['--dsh-editor-bg']).toBe(paletteForPreset('vs-dark').bg)
    expect(base.showLineNumbers).toBe(true)

    const overridden = resolveEditorAppearance({
      presetId: 'vs-dark',
      overrides: { bg: '#000000', tokenKeyword: '#ff00ff', showLineNumbers: false, fontSize: '15px' },
    })
    expect(overridden.cssVars['--dsh-editor-bg']).toBe('#000000')
    expect(overridden.cssVars['--dsh-editor-token-keyword']).toBe('#ff00ff')
    expect(overridden.cssVars['--dsh-editor-font-size']).toBe('15px')
    expect(overridden.showLineNumbers).toBe(false)
  })

  it('wraps CSS vars as light/dark pairs for theme.overrideTokens', () => {
    const resolved = resolveEditorAppearance({ presetId: 'one-dark', overrides: {} })
    const tokens = editorCssVarsToTokenOverrides(resolved.cssVars)
    expect(tokens['--dsh-editor-bg']).toEqual({
      light: resolved.cssVars['--dsh-editor-bg'],
      dark: resolved.cssVars['--dsh-editor-bg'],
    })
  })

  it('default preset keeps CSS var references so chrome tracks the UI theme', () => {
    const resolved = resolveEditorAppearance()
    expect(resolved.cssVars['--dsh-editor-bg']).toContain('--dsw-alias-bg-base')
    expect(resolved.cssVars['--dsh-editor-token-keyword']).toContain('--shiki-token-keyword')
    expect(resolved.cssVars['--dsh-editor-active-line']).toContain('color-mix')
  })
})
