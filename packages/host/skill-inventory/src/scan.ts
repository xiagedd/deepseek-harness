/**
 * Filesystem skill discovery for Settings — mirrors skill-filesystem roots
 * without registering a provider (web disables the host skill-filesystem row).
 */

import { access, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { SkillInventoryEntry } from './types.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface SkillRoot {
  readonly path: string
  readonly source: string
  readonly skipSystem?: boolean
}

/**
 * Resolve project root as the nearest ancestor containing `.git`, else cwd.
 * @param cwd - absolute workspace directory.
 */
export async function findProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd)
  for (;;) {
    try {
      await access(join(current, '.git'))
      return current
    } catch {
      // Keep walking.
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

function agentsHome(): string {
  const env = process.env.DSH_AGENTS_HOME
  if (typeof env === 'string' && env.trim().length > 0) return resolve(env.trim())
  return join(homedir(), '.agents')
}

function rootsFor(cwd: string | undefined, projectRoot: string | undefined): SkillRoot[] {
  const dshHome = resolveDshHome()
  const agents = agentsHome()
  const rows: SkillRoot[] = []
  if (projectRoot !== undefined) {
    rows.push(
      { path: join(projectRoot, '.dsh', 'skills'), source: 'project-dsh' },
      { path: join(projectRoot, '.agents', 'skills'), source: 'project-agents' },
    )
  }
  rows.push(
    { path: join(dshHome, 'skills'), source: 'user-dsh', skipSystem: true },
    { path: join(agents, 'skills'), source: 'user-agents' },
  )
  void cwd
  return rows
}

function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in data)) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'on', '1'].includes(normalized)) return true
    if (['false', 'no', 'off', '0'].includes(normalized)) return false
  }
  if (value === 1 || value === 0) return value === 1
  return undefined
}

function parseSkillFile(path: string, source: string, raw: string): SkillInventoryEntry | undefined {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/)
  if (match === null) return undefined
  let data: Record<string, unknown>
  try {
    const parsed: unknown = parseYaml(match[1] ?? '')
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    data = parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  const name = typeof data.name === 'string' ? data.name : ''
  const description = typeof data.description === 'string' ? data.description : ''
  if (!SKILL_NAME.test(name) || description.length === 0) return undefined
  const disableModel = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return {
    name,
    description,
    source,
    path,
    modelInvocable: disableModel !== true,
    userInvocable: userInvocable !== false,
  }
}

async function scanRoot(root: SkillRoot): Promise<SkillInventoryEntry[]> {
  let names: string[]
  try {
    names = await readdir(root.path)
  } catch {
    return []
  }
  const entries: SkillInventoryEntry[] = []
  for (const name of names) {
    if (root.skipSystem && name === '.system') continue
    const absolute = join(root.path, name)
    let info
    try {
      info = await stat(absolute)
    } catch {
      continue
    }
    if (info.isDirectory()) {
      const skillMd = join(absolute, 'SKILL.md')
      try {
        const raw = await readFile(skillMd, 'utf8')
        const entry = parseSkillFile(skillMd, root.source, raw)
        if (entry !== undefined) entries.push(entry)
      } catch {
        // Missing or unreadable SKILL.md.
      }
      continue
    }
    if (info.isFile() && name.endsWith('.md') && name !== 'SKILL.md') {
      try {
        const raw = await readFile(absolute, 'utf8')
        const entry = parseSkillFile(absolute, root.source, raw)
        if (entry !== undefined) entries.push(entry)
      } catch {
        // Unreadable flat skill.
      }
    }
  }
  return entries
}

/**
 * Discover winning filesystem skills for Settings (project + user roots).
 * Duplicate names keep the earliest root (project before user).
 * @param cwd - optional workspace directory for project roots.
 */
export async function scanSkills(cwd?: string): Promise<{
  entries: SkillInventoryEntry[]
  cwd: string | null
}> {
  const resolvedCwd = cwd !== undefined && cwd.trim().length > 0 ? resolve(cwd.trim()) : undefined
  const projectRoot = resolvedCwd === undefined ? undefined : await findProjectRoot(resolvedCwd)
  const byName = new Map<string, SkillInventoryEntry>()
  for (const root of rootsFor(resolvedCwd, projectRoot)) {
    for (const entry of await scanRoot(root)) {
      if (!byName.has(entry.name)) byName.set(entry.name, entry)
    }
  }
  return {
    entries: [...byName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    cwd: resolvedCwd ?? null,
  }
}

/**
 * Rewrite `disable-model-invocation` in a skill file's YAML frontmatter.
 * @param raw - full file contents.
 * @param modelInvocable - desired model-facing enablement.
 */
export function rewriteModelInvocable(raw: string, modelInvocable: boolean): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*|\r?\n?)$/)
  if (match === null) {
    throw new Error('skill-inventory: skill file is missing YAML frontmatter')
  }
  const parsed: unknown = parseYaml(match[1] ?? '')
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('skill-inventory: skill frontmatter must be a YAML object')
  }
  const data = { ...(parsed as Record<string, unknown>) }
  if (modelInvocable) {
    delete data['disable-model-invocation']
  } else {
    data['disable-model-invocation'] = true
  }
  const body = match[2] ?? '\n'
  return `---\n${stringifyYaml(data).trimEnd()}\n---${body.startsWith('\n') || body.startsWith('\r') ? body : `\n${body}`}`
}
