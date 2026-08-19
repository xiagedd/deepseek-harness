/**
 * Session-header control that opens the details column so the explorer tree
 * is visible without first inspecting a tool call.
 */
import { IconFolderClose16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './FilesOpenAction.module.css'

/** Injected face of the header files opener. */
export interface FilesOpenActionInjected {
  /** Open the details column (layout geometry stays with ctx.layout). */
  openDetails: () => void
}

/** Full header-action props: runtime kit, injected opener, locale seat. */
export type FilesOpenActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & InjectFace<FilesOpenActionInjected>
  & PropsLocale<'explorer'>

/**
 * Header "Files" control: opens the details panel onto the explorer tree.
 * @param props - header-action runtime share plus the layout opener.
 * @returns the header button.
 */
export function FilesOpenAction({ openDetails, t }: FilesOpenActionProps) {
  return (
    <button
      type="button"
      className={css.trigger}
      aria-label={t('header.aria')}
      onClick={() => { openDetails() }}
    >
      <IconFolderClose16 size={16} />
      {t('header.label')}
    </button>
  )
}
