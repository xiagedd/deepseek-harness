/** One filesystem skill projected for Settings. */
export interface SkillInventoryEntry {
  /** Kebab-case skill name from frontmatter. */
  readonly name: string
  /** Short routing description from frontmatter. */
  readonly description: string
  /** Discovery source bucket (`project-dsh`, `user-dsh`, …). */
  readonly source: string
  /** Absolute path of the skill file when file-backed. */
  readonly path: string
  /** Whether model-facing catalogs include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs include this skill. */
  readonly userInvocable: boolean
}

/** Point-in-time skill inventory returned by the Remote. */
export interface SkillInventorySnapshot {
  readonly entries: readonly SkillInventoryEntry[]
  /** Absolute workspace cwd used for project-root discovery, when supplied. */
  readonly cwd: string | null
}
