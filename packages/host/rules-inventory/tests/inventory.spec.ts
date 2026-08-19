import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import RulesInventoryGateway from '../src/index.ts'

const contexts: Context[] = []
const previousHome = process.env.DSH_HOME

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

async function harness(): Promise<RulesInventoryGateway> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(RulesInventoryGateway)
  return ctx.get('rulesInventory') as RulesInventoryGateway
}

describe('RulesInventoryGateway', () => {
  it('publishes list and create under rulesInventory', async () => {
    const inventory = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'rulesInventory',
      namespace: 'rulesInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'create', invocation: { kind: 'direct' } },
    ])
  })

  it('lists project AGENTS.md and creates a missing project-root file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rules-inv-home-'))
    process.env.DSH_HOME = home
    const project = await mkdtemp(join(tmpdir(), 'rules-inv-proj-'))
    await mkdir(join(project, '.git'))
    await writeFile(join(project, 'AGENTS.md'), 'root rules\n', 'utf8')

    const inventory = await harness()
    const listed = await inventory.list(project)
    expect(listed.entries.some(entry => entry.displayPath === 'AGENTS.md' && entry.present)).toBe(true)
    expect(listed.canCreateProjectRoot).toBe(false)

    const nested = join(project, 'pkg')
    await mkdir(nested)
    await writeFile(join(nested, 'AGENTS.md'), 'nested\n', 'utf8')
    const nestedList = await inventory.list(nested)
    expect(nestedList.entries.length).toBeGreaterThanOrEqual(2)
    expect(nestedList.entries.every(entry => entry.present)).toBe(true)
  })

  it('creates user-global AGENTS.md when missing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rules-inv-user-'))
    process.env.DSH_HOME = home
    const inventory = await harness()
    const before = await inventory.list()
    expect(before.canCreateUserGlobal).toBe(true)
    const after = await inventory.create('user-global')
    expect(after.canCreateUserGlobal).toBe(false)
    expect(after.entries.some(entry => entry.scope === 'user-global' && entry.present)).toBe(true)
  })
})
