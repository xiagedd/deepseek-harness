/** Rules Settings page registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { RulesSection, type RulesSectionInjected } from './RulesSection.tsx'
import { en, zh, type RulesSettingsLocaleKey } from './locales.ts'

export type { RulesSectionInjected, RulesSectionProps } from './RulesSection.tsx'
export type { RulesSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Rules Settings page copy. */
    'settings.rules': RulesSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.rules'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.rulesInventory', 'workspaces']

/** Contribute the Rules section once `settings.section` is declared. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-rules: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: RulesSectionInjected['list'] = async (cwd) => {
    const result = await ctx.remote.rulesInventory.list(cwd)
    if (!result.ok) {
      throw new Error(`rulesInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const create: RulesSectionInjected['create'] = async (target, cwd) => {
    const result = await ctx.remote.rulesInventory.create(target, cwd)
    if (!result.ok) {
      throw new Error(`rulesInventory.create failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const openPath: RulesSectionInjected['openPath'] = async (path) => {
    await ctx.workspaces.openPath(path)
  }
  const injected = (): RulesSectionInjected => ({ list, create, openPath })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'rules',
    order: 16,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, RulesSection))
}
