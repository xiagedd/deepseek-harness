/**
 * Applies Host explorer-preview settings to theme.overrideTokens and publishes
 * the line-numbers flag for the CodeMirror Compartment.
 */
import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { Context } from '@deepseek-ai/cordis'
import {
  DEFAULT_EDITOR_OVERRIDES, DEFAULT_EDITOR_PRESET, DEFAULT_EDITOR_PREVIEW_SETTINGS,
  EDITOR_OVERRIDES_FIELD, EDITOR_PRESET_FIELD, EDITOR_PREVIEW_SETTINGS_NAMESPACE,
  editorCssVarsToTokenOverrides, resolveEditorAppearance,
  type EditorPresetId, type EditorPreviewOverrides, type EditorPreviewSettings,
} from '../preview-settings.ts'

/** Override layer identity for ThemeRuntime.overrideTokens. */
export const EDITOR_TOKEN_SOURCE = '@deepseek-ai/dsh-client-ui-explorer/preview'

/**
 * Owns durable editor-preview preference adoption, CSS-var publishing, and the
 * reactive showLineNumbers source consumed by the preview column.
 */
export class EditorPreviewAppearance {
  /** Settings section mirror for the General Settings row. */
  readonly settings: SnapshotStore<EditorPreviewSettings> = createSnapshotStore(
    DEFAULT_EDITOR_PREVIEW_SETTINGS,
  )
  /** Line-number flag for CodeMirror Compartment reconfigure. */
  readonly showLineNumbers: SnapshotStore<boolean> = createSnapshotStore(true)
  private readonly ctx: Context
  private readonly host: SettingsScope<EditorPreviewSettings> | undefined
  private disposeTokens: (() => void) | undefined

  /**
   * @param ctx - client context carrying the theme service.
   * @param host - durable preference scope; absent compositions stay process-local.
   */
  constructor(ctx: Context, host?: SettingsScope<EditorPreviewSettings>) {
    this.ctx = ctx
    this.host = host
    if (host !== undefined) {
      host.subscribe(() => {
        this.adopt(host)
        this.publish()
      })
      this.adopt(host)
    }
    // Default preset values are CSS var references (`--dsw-*` / `--shiki-*`),
    // so light↔dark flips with ThemePresenter without re-publishing this layer.
    // Absolute presets ignore the app scheme. Do not subscribe to theme/change:
    // overrideTokens itself emits theme/change and would recurse.
    ctx.effect(() => {
      this.publish()
      return () => {
        this.disposeTokens?.()
        this.disposeTokens = undefined
      }
    }, 'ui-explorer: editor preview token layer')
  }

  /**
   * Switch the built-in preset and persist it.
   * @param presetId - built-in preset id.
   */
  setPreset(presetId: EditorPresetId): void {
    const current = this.settings.getSnapshot()
    if (current.presetId === presetId) return
    this.settings.set({ ...current, presetId })
    this.publish()
    void this.host?.set(EDITOR_PRESET_FIELD, presetId)
  }

  /**
   * Merge one override patch and persist the overrides field.
   * @param patch - partial override fields to merge.
   */
  patchOverrides(patch: EditorPreviewOverrides): void {
    const current = this.settings.getSnapshot()
    const overrides = { ...current.overrides, ...patch }
    this.settings.set({ ...current, overrides })
    this.publish()
    void this.host?.set(EDITOR_OVERRIDES_FIELD, overrides)
  }

  /**
   * Clear overrides and reset the preset to default (Host unset + preset write).
   */
  restoreDefaults(): void {
    this.settings.set({
      presetId: DEFAULT_EDITOR_PRESET,
      overrides: DEFAULT_EDITOR_OVERRIDES,
    })
    this.publish()
    void this.host?.set(EDITOR_PRESET_FIELD, DEFAULT_EDITOR_PRESET)
    void this.host?.unset(EDITOR_OVERRIDES_FIELD)
  }

  /**
   * Adopt the scope's accepted durable section without writing it back.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  private adopt(host: SettingsScope<EditorPreviewSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined) return
    const current = this.settings.getSnapshot()
    const nextOverrides = section.overrides
    if (current.presetId === section.presetId && overridesEqual(current.overrides, nextOverrides)) {
      return
    }
    this.settings.set({
      presetId: section.presetId,
      overrides: nextOverrides,
    })
  }

  /** Resolve the live section into theme tokens and the line-numbers store. */
  private publish(): void {
    const resolved = resolveEditorAppearance(this.settings.getSnapshot())
    if (this.showLineNumbers.getSnapshot() !== resolved.showLineNumbers) {
      this.showLineNumbers.set(resolved.showLineNumbers)
    }
    const theme = this.ctx.get('theme') as {
      overrideTokens: (
        source: string,
        tokens: Record<string, { light: string; dark: string }>,
      ) => () => void
    } | undefined
    /* v8 ignore next -- theme is injected in production compositions */
    if (theme === undefined) return
    this.disposeTokens?.()
    this.disposeTokens = theme.overrideTokens(
      EDITOR_TOKEN_SOURCE,
      editorCssVarsToTokenOverrides(resolved.cssVars),
    )
  }
}

/**
 * Bind the Host settings scope for the explorer-preview namespace.
 * @param ctx - client context with settingsScope.
 * @returns the bound scope.
 */
export function bindEditorPreviewSettings(
  ctx: { settingsScope: { bind: <T>(spec: { namespace: string }) => SettingsScope<T> } },
): SettingsScope<EditorPreviewSettings> {
  return ctx.settingsScope.bind<EditorPreviewSettings>({
    namespace: EDITOR_PREVIEW_SETTINGS_NAMESPACE,
  })
}

/** Shallow equality for override maps (key set + values). */
function overridesEqual(a: EditorPreviewOverrides, b: EditorPreviewOverrides): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof EditorPreviewOverrides>
  for (const key of keys) {
    if (a[key] !== b[key]) return false
  }
  return true
}
