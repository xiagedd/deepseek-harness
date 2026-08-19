/**
 * Resolve the Settings page workspace root from session / workspaces feed.
 * Prefer the current session cwd, else the recent workspace path, else the first
 * registered workspace.
 */

/** Snapshot facts needed to pick a workspace root. */
export interface WorkspaceRootInputs {
  readonly currentSessionId: string | undefined
  readonly sessionsById: Readonly<Record<string, { readonly cwd?: string }>>
  readonly recentWorkspaceId: string | undefined
  readonly workspaces: readonly { readonly workspaceId: string; readonly path: string }[]
}

/**
 * @param input - session and workspace snapshots.
 * @returns absolute workspace path, or undefined when none exist.
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
