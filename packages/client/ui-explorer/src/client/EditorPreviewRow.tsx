/**
 * General Settings row for explorer preview editor appearance: preset menu,
 * typography inputs, line-number checkbox, token/chrome color overrides, and
 * restore-defaults.
 */
import { useState, type ChangeEvent } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  EDITOR_PRESET_IDS,
  type EditorPresetId, type EditorPreviewOverrides, type EditorPreviewSettings,
} from '../preview-settings.ts'
import type { ExplorerKey } from './locales.ts'
import css from './EditorPreviewRow.module.css'

/** Registration-side preference face. */
export interface EditorPreviewRowInjected {
  hooks: {
    /** Persisted section mirror bound as useEditorSettings. */
    editorSettings: SnapshotStore<EditorPreviewSettings>
  }
  /** Switch the built-in preset. */
  setPreset: (presetId: EditorPresetId) => void
  /** Merge chrome / token / typography overrides. */
  patchOverrides: (patch: EditorPreviewOverrides) => void
  /** Clear overrides and reset the preset. */
  restoreDefaults: () => void
}

/** Full Settings-row props. */
export type EditorPreviewRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'explorer'>
  & InjectFace<EditorPreviewRowInjected>

const PRESET_LABEL: Record<EditorPresetId, ExplorerKey> = {
  'default': 'settings.editor.preset.default',
  'vs-dark': 'settings.editor.preset.vsDark',
  'vs-light': 'settings.editor.preset.vsLight',
  'one-dark': 'settings.editor.preset.oneDark',
}

const COLOR_FIELDS: readonly {
  key: keyof EditorPreviewOverrides
  label: ExplorerKey
}[] = [
  { key: 'bg', label: 'settings.editor.color.bg' },
  { key: 'selection', label: 'settings.editor.color.selection' },
  { key: 'activeLine', label: 'settings.editor.color.activeLine' },
  { key: 'gutterBg', label: 'settings.editor.color.gutter' },
  { key: 'tokenKeyword', label: 'settings.editor.color.keyword' },
  { key: 'tokenString', label: 'settings.editor.color.string' },
  { key: 'tokenComment', label: 'settings.editor.color.comment' },
  { key: 'tokenFunction', label: 'settings.editor.color.function' },
  { key: 'tokenNumber', label: 'settings.editor.color.number' },
]

/**
 * Render the editor-preview appearance preference row.
 * @param props - composed Settings slot props.
 * @returns the preference group.
 */
export function EditorPreviewRow({
  useEditorSettings, setPreset, patchOverrides, restoreDefaults, t,
}: EditorPreviewRowProps) {
  const settings = useEditorSettings(value => value)
  const [open, setOpen] = useState(false)
  const showLineNumbers = settings.overrides.showLineNumbers !== false
  const fontSize = settings.overrides.fontSize ?? '13px'
  const lineHeight = settings.overrides.lineHeight ?? '22px'

  const onFontSize = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value.trim()
    if (value === '') return
    patchOverrides({ fontSize: value })
  }
  const onLineHeight = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value.trim()
    if (value === '') return
    patchOverrides({ lineHeight: value })
  }

  return (
    <div className={css.group}>
      <div className={css.title}>{t('settings.editor.title')}</div>
      <div className={css.desc}>{t('settings.editor.description')}</div>

      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.label}>{t('settings.editor.preset')}</div>
        </div>
        <Menu
          open={open}
          onClose={() => { setOpen(false) }}
          items={EDITOR_PRESET_IDS.map(id => ({ id, label: t(PRESET_LABEL[id]) }))}
          selectedId={settings.presetId}
          onSelect={(id) => {
            setOpen(false)
            setPreset(id as EditorPresetId)
          }}
          align="end"
          portal
          anchor={(
            <button
              type="button"
              className={css.selector}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => { setOpen(value => !value) }}
            >
              {t(PRESET_LABEL[settings.presetId])}
              <IconChevronDownOutline14 className={css.chevron} />
            </button>
          )}
        />
      </div>

      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.label}>{t('settings.editor.fontSize')}</div>
        </div>
        <Input
          className={css.input ?? ''}
          value={fontSize}
          onChange={onFontSize}
          aria-label={t('settings.editor.fontSize')}
        />
      </div>

      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.label}>{t('settings.editor.lineHeight')}</div>
        </div>
        <Input
          className={css.input ?? ''}
          value={lineHeight}
          onChange={onLineHeight}
          aria-label={t('settings.editor.lineHeight')}
        />
      </div>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={showLineNumbers}
          onChange={(event) => {
            patchOverrides({ showLineNumbers: event.target.checked })
          }}
        />
        <span>{t('settings.editor.lineNumbers')}</span>
      </label>

      <div className={css.colorsTitle}>{t('settings.editor.colors')}</div>
      <div className={css.colorGrid}>
        {COLOR_FIELDS.map(({ key, label }) => {
          const raw = settings.overrides[key]
          const value = typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#808080'
          return (
            <label key={key} className={css.colorItem}>
              <span>{t(label)}</span>
              <input
                type="color"
                value={value}
                aria-label={t(label)}
                onChange={(event) => {
                  patchOverrides({ [key]: event.target.value })
                }}
              />
            </label>
          )
        })}
      </div>

      <button type="button" className={css.reset} onClick={() => { restoreDefaults() }}>
        {t('settings.editor.restore')}
      </button>
    </div>
  )
}
