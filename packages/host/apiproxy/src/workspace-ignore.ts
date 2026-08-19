/**
 * Workspace ignore matching for explorer list/search (Cursor-like).
 * Loads `.gitignore` when present, then `.dshignore` or else `.cursorignore`,
 * on top of a built-in `.git/` rule. Uses the `ignore` package (git-style
 * globs, `**`, and `!` negation). Missing product + gitignore files fall
 * back to {@link DEFAULT_DSHIGNORE}. Each list/search re-reads the files so
 * edits apply on the next request without restarting the host.
 */
import ignore, { type Ignore } from 'ignore'

/** Built-in patterns applied when the workspace has no ignore files. */
export const DEFAULT_DSHIGNORE = 'Library/\nTemp/\nLogs/\nobj/\n*.meta\n'

/** Always applied; VCS metadata never appears in the tree or search index. */
export const BUILTIN_IGNORE = '.git/\n'

/** Compiled matcher plus a cache key derived from the loaded file bodies. */
export interface WorkspaceIgnore {
  /** Concatenated source texts; search indexes invalidate when this changes. */
  readonly sourceKey: string
  /**
   * True when the workspace-relative POSIX path is ignored.
   * @param relative - path under the workspace root (`Library`, `Assets/a.cs`).
   * @param directory - true when the path names a directory.
   */
  ignores(relative: string, directory: boolean): boolean
}

/**
 * Join one ignore filename under a workspace root using its separator style.
 * @param root - absolute workspace root.
 * @param name - ignore filename.
 * @returns absolute path under the root.
 */
export function joinUnderRoot(root: string, name: string): string {
  const trimmed = root.replace(/[/\\]+$/, '')
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${trimmed}${sep}${name}`
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
 * Test whether a basename is a Unity sidecar `*.meta` file.
 * @param name - entry basename.
 * @returns true for a case-insensitive `.meta` suffix.
 */
export function isMetaName(name: string): boolean {
  return name.toLowerCase().endsWith('.meta')
}

/**
 * Resolve the ignore root for a listing path: optional explicit root, else the
 * longest registered workspace path that contains the listing, else the
 * listing path itself (workspace-root listings without a registry).
 * @param listPath - absolute directory being listed.
 * @param explicitRoot - workspace cwd from the client when known.
 * @param workspacePaths - registered workspace paths from the host registry.
 * @returns the root used to relativize ignore matches.
 */
export function resolveIgnoreRoot(
  listPath: string,
  explicitRoot: string | undefined,
  workspacePaths: readonly string[],
): string {
  if (explicitRoot !== undefined && explicitRoot !== '') return explicitRoot.replace(/[/\\]+$/, '')
  const norm = listPath.replace(/\\/g, '/').replace(/\/+$/, '')
  let best: string | undefined
  for (const raw of workspacePaths) {
    const root = raw.replace(/\\/g, '/').replace(/\/+$/, '')
    if (root === '' ) continue
    if (norm === root || norm.startsWith(`${root}/`)) {
      if (best === undefined || root.length > best.length) best = raw.replace(/[/\\]+$/, '')
    }
  }
  return best ?? listPath.replace(/[/\\]+$/, '')
}

/**
 * Compile ignore-file bodies into one matcher (order = git-style overlay).
 * @param parts - raw file texts in apply order.
 * @returns compiled matcher and source cache key.
 */
export function compileIgnore(parts: readonly string[]): WorkspaceIgnore {
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
 * Load stacked ignore rules for one workspace root.
 * Order: built-in `.git/` → `.gitignore` (if present) → `.dshignore` else
 * `.cursorignore` → {@link DEFAULT_DSHIGNORE} when neither git nor product file exists.
 * @param rootPath - absolute workspace root.
 * @param readText - host filesystem text read (missing files reject).
 * @returns the compiled stacked matcher.
 */
export async function loadWorkspaceIgnore(
  rootPath: string,
  readText: (path: string) => Promise<string>,
): Promise<WorkspaceIgnore> {
  const parts: string[] = [BUILTIN_IGNORE]
  let hasGit = false
  let hasProduct = false
  const tryRead = async (name: string): Promise<string | undefined> => {
    try {
      return await readText(joinUnderRoot(rootPath, name))
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
