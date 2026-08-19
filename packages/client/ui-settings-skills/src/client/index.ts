/** Skills Settings page registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SkillsSection, type SkillsSectionInjected } from './SkillsSection.tsx'
import { en, zh, type SkillsSettingsLocaleKey } from './locales.ts'

export type { SkillsSectionInjected, SkillsSectionProps } from './SkillsSection.tsx'
export type { SkillsSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills Settings page copy. */
    'settings.skills': SkillsSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skills'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.skillInventory', 'workspaces']

/** Contribute the Skills section once `settings.section` is declared. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skills: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: SkillsSectionInjected['list'] = async (cwd) => {
    const result = await ctx.remote.skillInventory.list(cwd)
    if (!result.ok) {
      throw new Error(`skillInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const setModelInvocable: SkillsSectionInjected['setModelInvocable'] = async (path, modelInvocable, cwd) => {
    const result = await ctx.remote.skillInventory.setModelInvocable(path, modelInvocable, cwd)
    if (!result.ok) {
      throw new Error(`skillInventory.setModelInvocable failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const openPath: SkillsSectionInjected['openPath'] = async (path) => {
    await ctx.workspaces.openPath(path)
  }
  const injected = (): SkillsSectionInjected => ({ list, setModelInvocable, openPath })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 15,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillsSection))
}
