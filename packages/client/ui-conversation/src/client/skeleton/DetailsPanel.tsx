import type { DetailsSlotProps } from '../contract/slots.ts'
import css from './DetailsPanel.module.css'

/** Right-side resident workspace Explorer outlet. */
export function DetailsPanel({ sessionId, useSessions, renderSlot, closeDetails }: DetailsSlotProps) {
  return <div className={css.root}>
    <div className={css.header}>
      <div className={css.title}>资源管理器</div>
      <button type="button" className={css.close} aria-label="关闭" onClick={closeDetails}>×</button>
    </div>
    <div className={css.body}>
      {renderSlot('conversation.details.explorer', { sessionId, useSessions }, {
        fallback: <div className={css.empty}>资源管理器加载中</div>,
      })}
    </div>
  </div>
}
