import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import McpInventoryGateway, { MCP_CLIENT_MODULE } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const activePlugin: Plugin.Function = () => {}

async function harness(): Promise<{
  ctx: Context
  inventory: McpInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.internal = {
    import: async (name: string) => {
      if (name === MCP_CLIENT_MODULE || name === 'cordis:active') return activePlugin
      throw new Error(`unexpected import ${name}`)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.plugin(McpInventoryGateway)
  const inventory = ctx.get('mcpInventory') as McpInventoryGateway
  return { ctx, inventory }
}

describe('McpInventoryGateway', () => {
  it('publishes list and setEnabled under the mcpInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'mcpInventory',
      namespace: 'mcpInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'setEnabled', invocation: { kind: 'direct' } },
    ])
  })

  it('lists only mcp-client entries and toggles disabled with write-back', async () => {
    const { ctx, inventory } = await harness()
    await ctx.loader.create({ name: 'cordis:active' })
    const mcpId = await ctx.loader.create({
      name: MCP_CLIENT_MODULE,
      config: { serverName: 'codedb', transport: 'stdio', command: 'echo' },
    })
    const disabledId = await ctx.loader.create({
      name: MCP_CLIENT_MODULE,
      disabled: true,
      config: { serverName: 'deepwiki', transport: 'stdio', command: 'echo' },
    })

    expect(inventory.list().entries).toEqual([
      {
        entryId: mcpId,
        serverName: 'codedb',
        transport: 'stdio',
        enabled: true,
        status: 'connected',
        toolCount: 0,
      },
      {
        entryId: disabledId,
        serverName: 'deepwiki',
        transport: 'stdio',
        enabled: false,
        status: 'disabled',
        toolCount: 0,
      },
    ])

    const afterDisable = await inventory.setEnabled(mcpId as never, false)
    expect(afterDisable.entries.find(entry => entry.entryId === mcpId)).toMatchObject({
      enabled: false,
      status: 'disabled',
    })

    const afterEnable = await inventory.setEnabled(disabledId as never, true)
    expect(afterEnable.entries.find(entry => entry.entryId === disabledId)).toMatchObject({
      enabled: true,
      status: 'connected',
    })
  })

  it('rejects setEnabled for unknown or non-mcp entries', async () => {
    const { ctx, inventory } = await harness()
    const otherId = await ctx.loader.create({ name: 'cordis:active' })
    await expect(inventory.setEnabled('missing' as never, false))
      .rejects.toThrow(/unknown entry/)
    await expect(inventory.setEnabled(otherId as never, false))
      .rejects.toThrow(/is not/)
  })
})
