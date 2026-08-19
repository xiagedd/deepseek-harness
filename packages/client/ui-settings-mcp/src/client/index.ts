/** MCP Settings page registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { McpSection, type McpSectionInjected } from './McpSection.tsx'
import { en, zh, type McpSettingsLocaleKey } from './locales.ts'

export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx'
export type { McpSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP Settings page copy. */
    'settings.mcp': McpSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpInventory']

/** Contribute the MCP section once `settings.section` is declared. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: McpSectionInjected['list'] = async () => {
    const result = await ctx.remote.mcpInventory.list()
    if (!result.ok) {
      throw new Error(`mcpInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const setEnabled: McpSectionInjected['setEnabled'] = async (entryId, enabled) => {
    const result = await ctx.remote.mcpInventory.setEnabled(entryId as never, enabled)
    if (!result.ok) {
      throw new Error(`mcpInventory.setEnabled failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): McpSectionInjected => ({ list, setEnabled })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 18,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, McpSection))
}
