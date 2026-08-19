import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import SkillInventoryGateway, { rewriteModelInvocable } from '../src/index.ts'

const contexts: Context[] = []
const previousDshHome = process.env.DSH_HOME
const previousAgentsHome = process.env.DSH_AGENTS_HOME

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  if (previousAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
  else process.env.DSH_AGENTS_HOME = previousAgentsHome
})

async function harness(): Promise<SkillInventoryGateway> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SkillInventoryGateway)
  return ctx.get('skillInventory') as SkillInventoryGateway
}

async function writeBundle(root: string, name: string, body: string): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'SKILL.md')
  await writeFile(path, body, 'utf8')
  return path
}

describe('SkillInventoryGateway', () => {
  it('publishes list and setModelInvocable under skillInventory', async () => {
    const inventory = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'skillInventory',
      namespace: 'skillInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'setModelInvocable', invocation: { kind: 'direct' } },
    ])
  })

  it('lists project skills and rewrites disable-model-invocation', async () => {
    const isolatedHome = await mkdtemp(join(tmpdir(), 'skill-inv-home-'))
    const isolatedAgents = await mkdtemp(join(tmpdir(), 'skill-inv-agents-'))
    process.env.DSH_HOME = isolatedHome
    process.env.DSH_AGENTS_HOME = isolatedAgents

    const project = await mkdtemp(join(tmpdir(), 'skill-inv-proj-'))
    await mkdir(join(project, '.git'))
    const skillsRoot = join(project, '.dsh', 'skills')
    const path = await writeBundle(
      skillsRoot,
      'demo-skill',
      '---\nname: demo-skill\ndescription: Demo\n---\nBody.\n',
    )
    const inventory = await harness()
    const listed = await inventory.list(project)
    expect(listed.entries).toEqual([
      {
        name: 'demo-skill',
        description: 'Demo',
        source: 'project-dsh',
        path,
        modelInvocable: true,
        userInvocable: true,
      },
    ])

    const after = await inventory.setModelInvocable(path, false, project)
    expect(after.entries[0]).toMatchObject({ name: 'demo-skill', modelInvocable: false })
  })

  it('rejects setModelInvocable for unknown paths', async () => {
    const isolatedHome = await mkdtemp(join(tmpdir(), 'skill-inv-empty-'))
    const isolatedAgents = await mkdtemp(join(tmpdir(), 'skill-inv-empty-agents-'))
    process.env.DSH_HOME = isolatedHome
    process.env.DSH_AGENTS_HOME = isolatedAgents
    const inventory = await harness()
    await expect(inventory.setModelInvocable('/missing/SKILL.md', false))
      .rejects.toThrow(/unknown skill path/)
  })
})

describe('rewriteModelInvocable', () => {
  it('adds and removes disable-model-invocation', () => {
    const raw = '---\nname: x\ndescription: y\n---\nBody\n'
    const disabled = rewriteModelInvocable(raw, false)
    expect(disabled).toContain('disable-model-invocation: true')
    const enabled = rewriteModelInvocable(disabled, true)
    expect(enabled).not.toContain('disable-model-invocation')
  })
})
