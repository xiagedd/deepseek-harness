/**
 * Workspace file-tree plugin, node half. Registers the durable explorer
 * preview-editor settings namespace when a settings provider is composed;
 * the browser half ships via exports["./client"].
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  EDITOR_PREVIEW_SETTINGS_NAMESPACE, EditorPreviewSettingsSchema,
} from './preview-settings.ts'

export {
  DEFAULT_EDITOR_OVERRIDES, DEFAULT_EDITOR_PRESET, DEFAULT_EDITOR_PREVIEW_SETTINGS,
  EDITOR_OVERRIDES_FIELD, EDITOR_PRESET_FIELD, EDITOR_PRESET_IDS,
  EDITOR_PREVIEW_SETTINGS_NAMESPACE, EditorPreviewSettingsSchema,
  editorCssVarsToTokenOverrides, isEditorPresetId, paletteForPreset,
  resolveEditorAppearance,
  type EditorPresetId, type EditorPreviewOverrides, type EditorPreviewSettings,
  type ResolvedEditorAppearance, type ResolvedEditorCssVars,
} from './preview-settings.ts'

/**
 * Register the durable explorer-preview section when settings exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(EDITOR_PREVIEW_SETTINGS_NAMESPACE),
      EditorPreviewSettingsSchema,
    )
  })
}
