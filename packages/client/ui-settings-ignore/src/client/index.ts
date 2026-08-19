/** Ignore Settings page registered into Web Settings. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { IgnoreSection, type IgnoreSectionInjected } from './IgnoreSection.tsx'
import { loadIgnoreFileState } from './ignore-io.ts'
import { en, zh, type IgnoreSettingsLocaleKey } from './locales.ts'

export type { IgnoreSectionInjected, IgnoreSectionProps } from './IgnoreSection.tsx'
export type { IgnoreSettingsLocaleKey } from './locales.ts'
export { joinUnderRoot, loadIgnoreFileState, resolveWorkspaceRoot } from './ignore-io.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Ignore Settings page copy. */
    'settings.ignore': IgnoreSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.ignore'

/** Services required by the Settings registration and Host text IO. */
export const inject = ['slots', 'locale', 'connection']

type HostResult<T> = { result: { ok: true; value: T } | { ok: false; error: { message: string } } }
type TextHost = {
  readText?: (payload: { path: string }) => Promise<HostResult<{ content: string }>>
  writeText?: (payload: { path: string; content?: string }) => Promise<HostResult<{ path: string }>>
}

/** Contribute the Ignore section once `settings.section` is declared. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-ignore: dictionaries')

  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle

  const injected = (): IgnoreSectionInjected => ({
    load: async (root) => {
      const host = connection.api.host as unknown as TextHost
      if (host.readText === undefined) throw new Error('当前运行时不支持读取文件')
      return loadIgnoreFileState(root, async (path) => {
        const read = host.readText
        if (read === undefined) throw new Error('当前运行时不支持读取文件')
        const response = await read({ path })
        if (!response.result.ok) throw new Error(response.result.error.message)
        return response.result.value.content
      })
    },
    save: async (path, content) => {
      const host = connection.api.host as unknown as TextHost
      if (host.writeText === undefined) throw new Error('当前运行时不支持写入文件')
      const response = await host.writeText({ path, content })
      if (!response.result.ok) throw new Error(response.result.error.message)
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ignore',
    order: 19,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, IgnoreSection))
}
