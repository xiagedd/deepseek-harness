/**
 * gitignore-style ignore matching for the explorer tree (client兜底).
 * Host `listEntries` / `searchEntries` already prune; the panel still applies
 * the same stack so a stale listing cannot flash ignored rows. Patterns come
 * from the workspace root through host.readText — never node:fs.
 *
 * Stack (Cursor-like): built-in `.git/` → `.gitignore` when present →
 * `.dshignore` else `.cursorignore` → {@link DEFAULT_DSHIGNORE} when neither
 * git nor product file exists. The `ignore` package supplies `*` / `**` /
 * root-relative `/` / suffix globs / `#` comments / `!` negation.
 */
import ignore, { type Ignore } from 'ignore'

/** Built-in patterns used when the workspace root has no ignore file. */
export const DEFAULT_DSHIGNORE = 'Library/\nTemp/\nLogs/\nobj/\n*.meta\n'

/** Always applied; VCS metadata never appears in the tree. */
export const BUILTIN_IGNORE = '.git/\n'

/** Compiled ignore matcher (one workspace load). */
export interface IgnoreRules {
  /** Concatenated source texts (debug / tests). */
  readonly sourceKey: string
  /**
   * True when the workspace-relative POSIX path is ignored.
   * @param relative - path under the workspace root.
   * @param directory - true when the path names a directory.
   */
  ignores(relative: string, directory: boolean): boolean
}

/**
 * Legacy name for one compiled workspace matcher.
 * @deprecated Prefer {@link IgnoreRules}; kept for call-site type imports.
 */
export type IgnoreRule = IgnoreRules

/**
 * Test whether a basename is a Unity sidecar `*.meta` file.
 * @param name - entry basename.
 * @returns true for a case-insensitive `.meta` suffix.
 */
export function isMetaName(name: string): boolean {
  return name.toLowerCase().endsWith('.meta')
}

/**
 * Compile one or more ignore-file bodies into a matcher.
 * @param parts - raw file texts in overlay order.
 * @returns compiled matcher and source cache key.
 */
export function compileIgnore(parts: readonly string[]): IgnoreRules {
  const ig: Ignore = ignore()
  for (const part of parts) {
    if (part !== '') ig.add(part)
  }
  const sourceKey = parts.join('\0')
  return {
    sourceKey,
    ignores(relative: string, directory: boolean): boolean {
      if (relative === '') return false
      if (ig.ignores(relative)) return true
      if (directory && ig.ignores(`${relative}/`)) return true
      return false
    },
  }
}

/**
 * Compile a single ignore-file body (or {@link DEFAULT_DSHIGNORE}).
 * @param text - file body from host.readText.
 * @returns compiled matcher.
 */
export function parseIgnore(text: string): IgnoreRules {
  return compileIgnore([text])
}

/**
 * Produce a workspace-relative POSIX path; empty when the paths are equal.
 * @param root - absolute workspace root.
 * @param path - absolute entry path.
 * @returns POSIX relative path used by the ignore matcher.
 */
export function relativePosix(root: string, path: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normPath === normRoot) return ''
  const prefix = `${normRoot}/`
  if (normPath.startsWith(prefix)) return normPath.slice(prefix.length)
  const slash = Math.max(normPath.lastIndexOf('/'), 0)
  return slash >= 0 ? normPath.slice(slash + 1) : normPath
}

/**
 * Test a workspace-relative path against compiled rules.
 * @param relative - POSIX path from the workspace root.
 * @param directory - true when the path names a directory.
 * @param rules - compiled ignore rules.
 * @returns true when the path is ignored.
 */
export function matchesIgnore(
  relative: string,
  directory: boolean,
  rules: IgnoreRules,
): boolean {
  return rules.ignores(relative, directory)
}

/**
 * Test an absolute listing row against workspace rules.
 * @param root - absolute workspace root.
 * @param path - absolute entry path.
 * @param directory - true when the path names a directory.
 * @param rules - compiled ignore rules.
 * @returns true when the row is ignored.
 */
export function isIgnoredEntry(
  root: string,
  path: string,
  directory: boolean,
  rules: IgnoreRules,
): boolean {
  return matchesIgnore(relativePosix(root, path), directory, rules)
}

/**
 * Load stacked ignore rules: built-in → `.gitignore` → `.dshignore` else
 * `.cursorignore` → defaults when neither git nor product file exists.
 * @param cwd - workspace root.
 * @param readText - host.readText bound to absolute paths.
 * @param joinChild - host-path-aware child join.
 * @returns compiled stacked matcher.
 */
export async function loadStackedIgnore(
  cwd: string,
  readText: (path: string) => Promise<string>,
  joinChild: (root: string, name: string) => string,
): Promise<IgnoreRules> {
  const parts: string[] = [BUILTIN_IGNORE]
  let hasGit = false
  let hasProduct = false
  const tryRead = async (name: string): Promise<string | undefined> => {
    try {
      return await readText(joinChild(cwd, name))
    } catch {
      return undefined
    }
  }
  const git = await tryRead('.gitignore')
  if (git !== undefined) {
    parts.push(git)
    hasGit = true
  }
  const dsh = await tryRead('.dshignore')
  if (dsh !== undefined) {
    parts.push(dsh)
    hasProduct = true
  } else {
    const cursor = await tryRead('.cursorignore')
    if (cursor !== undefined) {
      parts.push(cursor)
      hasProduct = true
    }
  }
  if (!hasGit && !hasProduct) parts.push(DEFAULT_DSHIGNORE)
  return compileIgnore(parts)
}
