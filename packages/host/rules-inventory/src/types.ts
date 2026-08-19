/** Scope of one workspace instruction file for Settings. */
export type RulesInventoryScope = 'user-global' | 'project'

/** Create target for a missing default AGENTS.md. */
export type RulesCreateTarget = 'user-global' | 'project-root'

/** One AGENTS.md-compatible instruction file projected for Settings. */
export interface RulesInventoryEntry {
  /** Model-facing path label (e.g. `AGENTS.md`, `~/.dsh/AGENTS.md`). */
  readonly displayPath: string
  /** Absolute filesystem path. */
  readonly absolutePath: string
  /** Whether the file is the fixed user-global home file or a project candidate. */
  readonly scope: RulesInventoryScope
  /** True when the file exists on disk. */
  readonly present: boolean
}

/** Point-in-time rules inventory returned by the Remote. */
export interface RulesInventorySnapshot {
  readonly entries: readonly RulesInventoryEntry[]
  /** Absolute workspace cwd used for project discovery, when supplied. */
  readonly cwd: string | null
  /** Whether `$DSH_HOME/AGENTS.md` is missing and can be created. */
  readonly canCreateUserGlobal: boolean
  /** Whether `<projectRoot>/AGENTS.md` is missing and can be created. */
  readonly canCreateProjectRoot: boolean
}
