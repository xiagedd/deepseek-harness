/**
 * Host Remote for filesystem skill inventory: list project/user skills and
 * toggle model invocation by rewriting `disable-model-invocation` frontmatter.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import { rewriteModelInvocable, scanSkills } from './scan.ts'
import type { SkillInventorySnapshot } from './types.ts'

export type * from './types.ts'
export { rewriteModelInvocable, scanSkills } from './scan.ts'

/** Remote service exposing filesystem skills for Settings. */
export class SkillInventoryGateway extends TypertRemoteService {
  static inject = []

  constructor(ctx: Context) {
    super(ctx, 'skillInventory')
  }

  /**
   * Scan project and user skill roots for the given workspace cwd.
   * @param cwd - optional absolute workspace directory; omit for user roots only.
   * @returns Current skill inventory snapshot.
   */
  @Remote('list')
  async list(cwd?: string): Promise<SkillInventorySnapshot> {
    const scanned = await scanSkills(cwd)
    return { entries: scanned.entries, cwd: scanned.cwd }
  }

  /**
   * Persist model-facing enablement by rewriting skill frontmatter, then
   * re-scan. Only absolute paths previously returned by `list` are accepted.
   * @param path - absolute skill file path.
   * @param modelInvocable - desired model catalog inclusion.
   * @param cwd - optional workspace cwd used to refresh the snapshot.
   * @returns Fresh inventory after the write.
   */
  @Remote('setModelInvocable')
  async setModelInvocable(
    path: string,
    modelInvocable: boolean,
    cwd?: string,
  ): Promise<SkillInventorySnapshot> {
    const absolute = resolve(path)
    const before = await scanSkills(cwd)
    const known = before.entries.find(entry => entry.path === absolute)
    if (known === undefined) {
      throw new Error(`skillInventory.setModelInvocable: unknown skill path ${absolute}`)
    }
    const raw = await readFile(absolute, 'utf8')
    const next = rewriteModelInvocable(raw, modelInvocable)
    await writeFile(absolute, next, 'utf8')
    const scanned = await scanSkills(cwd)
    return { entries: scanned.entries, cwd: scanned.cwd }
  }
}

export default SkillInventoryGateway
