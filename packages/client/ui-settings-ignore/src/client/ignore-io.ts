/**
 * Pure helpers for the Ignore Settings page: workspace-root path join and
 * resolving which root the editor should target.
 */

/** Join one filename under a workspace root using the root's separator style. */
export function joinUnderRoot(root: string, name: string): string {
  const trimmed = root.replace(/[/\\]+$/, '')
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${trimmed}${sep}${name}`
}

/** Snapshot facts needed to pick the Ignore editor's workspace root. */
export interface WorkspaceRootInputs {
  /** Current session id when Settings opens over an active session. */
  readonly currentSessionId: string | undefined
  /** Session list keyed by id; only `cwd` is read. */
  readonly sessionsById: Readonly<Record<string, { readonly cwd?: string }>>
  /** Most recently active workspace id from the workspaces feed. */
  readonly recentWorkspaceId: string | undefined
  /** Registered workspaces (path is the ignore-file root). */
  readonly workspaces: readonly { readonly workspaceId: string; readonly path: string }[]
}

/**
 * Prefer the current session cwd, else the recent workspace path, else the
 * first registered workspace. Returns undefined when none exist.
 */
export function resolveWorkspaceRoot(input: WorkspaceRootInputs): string | undefined {
  const currentId = input.currentSessionId
  if (currentId !== undefined) {
    const cwd = input.sessionsById[currentId]?.cwd
    if (cwd !== undefined && cwd !== '') return cwd
  }
  const recent = input.recentWorkspaceId
  if (recent !== undefined) {
    const match = input.workspaces.find(item => item.workspaceId === recent)
    if (match !== undefined && match.path !== '') return match.path
  }
  const first = input.workspaces[0]
  return first !== undefined && first.path !== '' ? first.path : undefined
}

/** Result of probing workspace-root ignore files for the editor. */
export interface IgnoreFileState {
  /** Absolute path that save writes (always `.dshignore`). */
  readonly path: string
  /** Editor body; empty when `.dshignore` is absent. */
  readonly content: string
  /** True when `.dshignore` already exists on disk. */
  readonly exists: boolean
  /** True when `.dshignore` is missing but `.cursorignore` is present. */
  readonly cursorFallback: boolean
}

/**
 * Load editor state for one workspace root.
 * Reads `.dshignore` when present; otherwise reports missing (optionally with
 * a `.cursorignore` compatibility hint) and leaves the editor empty.
 * @param root - absolute workspace root.
 * @param readText - host text read; missing files must reject.
 */
export async function loadIgnoreFileState(
  root: string,
  readText: (path: string) => Promise<string>,
): Promise<IgnoreFileState> {
  const path = joinUnderRoot(root, '.dshignore')
  try {
    const content = await readText(path)
    return { path, content, exists: true, cursorFallback: false }
  } catch {
    // Missing or unreadable `.dshignore` — probe cursor fallback next.
  }
  let cursorFallback = false
  try {
    await readText(joinUnderRoot(root, '.cursorignore'))
    cursorFallback = true
  } catch {
    // Neither product ignore file exists.
  }
  return { path, content: '', exists: false, cursorFallback }
}
