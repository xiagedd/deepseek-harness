/**
 * Host Remote for workspace instruction (Rules) files: list AGENTS.md-compatible
 * candidates and create the default user-global or project-root file when missing.
 */

import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { discoverBaselineInstructionFiles } from '@deepseek-ai/dsh-agent-instructions'
import { dshHomeDisplay, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  RulesCreateTarget,
  RulesInventoryEntry,
  RulesInventorySnapshot,
} from './types.ts'

export type * from './types.ts'

const STARTER = `# AGENTS.md

Workspace instructions for DeepSeek Harness agents. More specific files closer to the working directory take precedence over broader ones.
`

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd)
  for (;;) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/** Build the Settings projection for one workspace cwd. */
export async function collectRules(cwd?: string): Promise<RulesInventorySnapshot> {
  const dshHome = resolveDshHome()
  const userGlobalPath = join(dshHome, 'AGENTS.md')
  const resolvedCwd = cwd !== undefined && cwd.trim().length > 0 ? resolve(cwd.trim()) : undefined
  const projectRoot = resolvedCwd === undefined ? undefined : await findProjectRoot(resolvedCwd)

  const discovered = resolvedCwd === undefined
    ? (await pathExists(userGlobalPath)
      ? [{ absolutePath: userGlobalPath, displayPath: `${dshHomeDisplay(dshHome)}/AGENTS.md` }]
      : [])
    : await discoverBaselineInstructionFiles({ cwd: resolvedCwd })

  const entries: RulesInventoryEntry[] = discovered.map(file => ({
    displayPath: file.displayPath,
    absolutePath: file.absolutePath,
    scope: file.absolutePath === userGlobalPath ? 'user-global' : 'project',
    present: true,
  }))

  const presentPaths = new Set(entries.map(entry => entry.absolutePath))
  const projectAgents = projectRoot === undefined ? undefined : join(projectRoot, 'AGENTS.md')

  return {
    entries,
    cwd: resolvedCwd ?? null,
    canCreateUserGlobal: !presentPaths.has(userGlobalPath) && !(await pathExists(userGlobalPath)),
    canCreateProjectRoot: projectAgents !== undefined
      && !presentPaths.has(projectAgents)
      && !(await pathExists(projectAgents)),
  }
}

/** Remote service exposing workspace instruction files for Settings. */
export class RulesInventoryGateway extends TypertRemoteService {
  static inject = []

  constructor(ctx: Context) {
    super(ctx, 'rulesInventory')
  }

  /**
   * List discovered instruction candidates for the workspace cwd.
   * @param cwd - optional absolute workspace directory.
   * @returns Current rules inventory snapshot.
   */
  @Remote('list')
  async list(cwd?: string): Promise<RulesInventorySnapshot> {
    return collectRules(cwd)
  }

  /**
   * Create a missing default `AGENTS.md` at user-global or project-root scope.
   * @param target - which default file to create.
   * @param cwd - workspace cwd required for `project-root`.
   * @returns Fresh inventory after the write.
   */
  @Remote('create')
  async create(target: RulesCreateTarget, cwd?: string): Promise<RulesInventorySnapshot> {
    const dshHome = resolveDshHome()
    if (target === 'user-global') {
      const path = join(dshHome, 'AGENTS.md')
      if (await pathExists(path)) {
        throw new Error('rulesInventory.create: user-global AGENTS.md already exists')
      }
      await mkdir(dshHome, { recursive: true })
      await writeFile(path, STARTER, 'utf8')
      return collectRules(cwd)
    }

    if (cwd === undefined || cwd.trim().length === 0) {
      throw new Error('rulesInventory.create: project-root requires cwd')
    }
    const projectRoot = await findProjectRoot(resolve(cwd.trim()))
    const path = join(projectRoot, 'AGENTS.md')
    if (await pathExists(path)) {
      throw new Error('rulesInventory.create: project-root AGENTS.md already exists')
    }
    await writeFile(path, STARTER, 'utf8')
    return collectRules(cwd)
  }
}

export default RulesInventoryGateway
