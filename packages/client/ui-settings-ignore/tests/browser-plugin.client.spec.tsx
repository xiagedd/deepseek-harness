// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { IgnoreSection } from '../src/client/IgnoreSection.tsx'
import type { IgnoreSectionInjected } from '../src/client/IgnoreSection.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const readText = vi.fn(async () => ({
    result: { ok: false as const, error: { message: 'missing' } },
  }))
  const writeText = vi.fn(async () => ({
    result: { ok: true as const, value: { path: '/ws/.dshignore' } },
  }))
  ctx.provide('connection', {
    api: { host: { readText, writeText } },
  })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, readText, writeText }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-ignore browser plugin', () => {
  it('declares only the services used by the Settings Host contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers a localized Ignore section without reading Host eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(IgnoreSection)
    expect(entry.options).toMatchObject({ id: 'ignore', order: 19 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('忽略规则')
    expect(b.readText).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => IgnoreSectionInjected)()
    await expect(injected.load('/ws')).resolves.toMatchObject({
      path: '/ws/.dshignore',
      exists: false,
      cursorFallback: false,
    })
    expect(b.readText).toHaveBeenCalled()
    await expect(injected.save('/ws/.dshignore', 'Library/\n')).resolves.toBeUndefined()
    expect(b.writeText).toHaveBeenCalledWith({ path: '/ws/.dshignore', content: 'Library/\n' })
    await b.ctx.fiber.dispose()
  })
})
