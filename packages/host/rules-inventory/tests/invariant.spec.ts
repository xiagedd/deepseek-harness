import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InvariantRegistry } from '@deepseek-ai/dsh-invariants'
import * as RulesInventoryInvariant from '../src/invariant.ts'

describe('rules-inventory invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(RulesInventoryInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(RulesInventoryInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
