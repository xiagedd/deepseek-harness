import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InvariantRegistry } from '@deepseek-ai/dsh-invariants'
import * as SkillsInvariant from '../src/invariant.ts'

describe('ui-settings-skills invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(SkillsInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(SkillsInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
