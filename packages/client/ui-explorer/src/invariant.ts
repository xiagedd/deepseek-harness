/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-explorer`.
 * @module @deepseek-ai/dsh-client-ui-explorer/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-explorer'

/** Cordis companion plugin name. */
export const name = 'client-ui-explorer-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: listing and openPath are Host RPC effects whose
 * declaration, registration, and teardown are exercised by this package.
 * Occupying `details` itself is the conflict this companion exists to keep
 * out of production — the browser apply only fills the explorer child seat.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
