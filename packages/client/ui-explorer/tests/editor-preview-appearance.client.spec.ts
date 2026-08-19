/** EditorPreviewAppearance: Host settings round-trip and token publishing. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { EditorPreviewSettings } from '../src/preview-settings.ts'
import {
  EDITOR_TOKEN_SOURCE, EditorPreviewAppearance,
} from '../src/client/editor-preview-appearance.ts'

function make() {
  const ctx = new Context()
  const host = stubSettingsScope<EditorPreviewSettings>()
  const overrideTokens = vi.fn(() => () => {})
  ctx.provide('theme', { overrideTokens })
  const appearance = new EditorPreviewAppearance(ctx, host.scope)
  return { ctx, host, appearance, overrideTokens }
}

describe('EditorPreviewAppearance', () => {
  it('publishes default tokens on construct and adopts Host sections', () => {
    const { appearance, host, overrideTokens } = make()
    expect(overrideTokens).toHaveBeenCalled()
    expect(overrideTokens.mock.calls[0]![0]).toBe(EDITOR_TOKEN_SOURCE)
    expect(appearance.showLineNumbers.getSnapshot()).toBe(true)

    host.publish({
      status: 'ready',
      value: { presetId: 'vs-light', overrides: { showLineNumbers: false } },
      revision: 1,
      writable: true,
    })
    expect(appearance.settings.getSnapshot().presetId).toBe('vs-light')
    expect(appearance.showLineNumbers.getSnapshot()).toBe(false)
  })

  it('setPreset / patchOverrides write Host fields and re-publish tokens', () => {
    const { appearance, host, overrideTokens } = make()
    const before = overrideTokens.mock.calls.length
    appearance.setPreset('one-dark')
    expect(host.set).toHaveBeenCalledWith('presetId', 'one-dark')
    expect(appearance.settings.getSnapshot().presetId).toBe('one-dark')
    expect(overrideTokens.mock.calls.length).toBeGreaterThan(before)

    appearance.patchOverrides({ tokenKeyword: '#abcdef', showLineNumbers: false })
    expect(host.set).toHaveBeenCalledWith('overrides', expect.objectContaining({
      tokenKeyword: '#abcdef',
      showLineNumbers: false,
    }))
    expect(appearance.showLineNumbers.getSnapshot()).toBe(false)
  })

  it('restoreDefaults clears overrides via unset and resets the preset', () => {
    const { appearance, host } = make()
    appearance.setPreset('vs-dark')
    appearance.patchOverrides({ bg: '#111111' })
    appearance.restoreDefaults()
    expect(appearance.settings.getSnapshot()).toEqual({
      presetId: 'default',
      overrides: {},
    })
    expect(host.set).toHaveBeenCalledWith('presetId', 'default')
    expect(host.unset).toHaveBeenCalledWith('overrides')
    expect(appearance.showLineNumbers.getSnapshot()).toBe(true)
  })
})
