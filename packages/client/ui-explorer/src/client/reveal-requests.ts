/**
 * Reveal requests reaching the tree and preview from outside their own
 * gestures — today the composer's reference chips, through the
 * `workspaceReveal` service. The publisher lives in the plugin body (ctx
 * world) and each panel binds the bare observable through its hooks
 * compartment, so no component ever sees ctx.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { LineRange } from './workspace-reference.ts'

/** One request to show (and optionally scroll to a line range in) a path. */
export interface RevealRequest {
  /** Absolute path to expand to, highlight, and open in the preview column. */
  readonly path: string
  /**
   * Inclusive 1-based line range to scroll to and select in the preview editor
   * (a Ctrl+L chip's `:120-148` suffix); undefined for a whole-file reference,
   * which only reveals and opens the tab without moving the editor.
   */
  readonly lines?: LineRange
  /**
   * Monotonic request count. Asking for the path (and line range) already
   * revealed produces a new snapshot, which is what lets a second click scroll
   * the row back into view and re-scroll the editor to the range instead of
   * resolving to no state change at all.
   */
  readonly seq: number
}

/** The publish side plus the source each panel binds. */
export interface RevealRequests {
  /** Latest request; undefined until the first one arrives. */
  readonly source: HostObservable<RevealRequest | undefined>
  /**
   * Publish one reveal request to the live panels.
   * @param path - absolute path to reveal and open.
   * @param lines - inclusive 1-based line range to scroll to, or omit for none.
   */
  request(path: string, lines?: LineRange): void
}

/**
 * Create the reveal-request channel for one plugin fiber.
 * @returns the observable source and its publisher.
 */
export function createRevealRequests(): RevealRequests {
  let current: RevealRequest | undefined
  let seq = 0
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: () => current,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    request: (path, lines) => {
      seq += 1
      current = lines === undefined ? { path, seq } : { path, lines, seq }
      for (const listener of [...listeners]) listener()
    },
  }
}
