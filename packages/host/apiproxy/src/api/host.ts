/**
 * host domain contract. No protocol version: client and host ship
 * together; introduce protocolVersion only when an independently released client appears.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One directory row of a listing: a child entry or a breadcrumb ancestor. */
export interface DirectoryEntry {
  /** Base name shown in a browser row (a root crumb carries its full path). */
  name: string
  /** Absolute host path — the client never joins path segments itself. */
  path: string
  /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
  hidden: boolean
}

/** host.listDirectory response value: one directory level plus its ancestry. */
export interface DirectoryListing {
  /** Absolute path of the listed directory. */
  path: string
  /** The host account's home directory (breadcrumb "Home" rooting). */
  home: string
  /**
   * Ancestor chain from the filesystem root to the listed directory
   * inclusive; every crumb is a jump target (crumb `hidden` is always false).
   */
  crumbs: DirectoryEntry[]
  /** Direct child directories, name-sorted; symlinks to directories included. */
  entries: DirectoryEntry[]
  /** True when the backend cut `entries` at its complete-result bound (the name-sorted tail is absent). */
  truncated: boolean
}

/** One file or directory row of {@link FsListing}. */
export interface FsEntry {
  /** Base name shown in a browser row. */
  name: string
  /** Absolute host path — the client never joins path segments itself. */
  path: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
  hidden: boolean
  /** Byte size of a regular file, when the backend reported it. */
  size?: number
}

/** host.listEntries response value: one directory level of files and folders. */
export interface FsListing {
  /** Absolute path of the listed directory. */
  path: string
  /** Direct children (files and folders), name-sorted. */
  entries: FsEntry[]
}

/** host.searchEntries response value: fuzzy matches under one workspace root. */
export interface FsSearchListing {
  /** Absolute workspace root that was searched. */
  path: string
  /** Ranked file and directory rows (basename + absolute path). */
  entries: FsEntry[]
  /** True when more matches existed than the requested limit. */
  truncated: boolean
}

/** Host-level unary methods. */
export interface HostApi {
  /**
   * One-shot host snapshot. Empty payload uses the literal `{}` (extend in place when fields arrive).
   * version = the host app's (apps/cli) package.json version; cwd = the host process working
   * directory (root for session persistence and tool execution); provider/model = the defaults
   * applied when a new agent doesn't specify them explicitly, absent when the host configures
   * no explicit default (the adapter falls back internally);
   * attachedSessions = count of currently attached sessions (those with a live agent);
   * canOpenPath = whether this deployment can hand a path to a user-visible native desktop.
   */
  describe(request: RpcRequest<{}>): Promise<RpcResponse<{
    version: string
    cwd: string
    provider?: string
    model?: string
    attachedSessions: number
    canOpenPath: boolean
  }>>

  /**
   * Open the operating system's single-directory picker; cancellation returns
   * null. Only served under the `native` capability.
   */
  pickDirectory(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ path: string | null }>>

  /**
   * List one directory level for the in-app browser; an absent path lists the
   * host account's home directory. Only served under the `browse` capability;
   * unreadable or missing targets fail with `directory-unreadable`. The
   * carrier's request signal follows the caller, stopping the backend's scan
   * on disconnect or timeout.
   */
  listDirectory(
    request: RpcRequest<{ path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<DirectoryListing>>

  /**
   * Create one child directory under an existing parent (the browser's
   * "New folder"). Only served under the `browse` capability; an existing
   * child fails with `directory-exists`, every other filesystem failure with
   * `directory-create-failed`.
   */
  createDirectory(
    request: RpcRequest<{ path: string; name: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * List one directory level of files and folders via `ctx.fs.listDir`.
   * Unlike {@link listDirectory}, this is the workspace file-tree listing
   * (files included) and does not serve the folder-only picker. Ignored
   * paths (`.dshignore` / `.cursorignore` / `.gitignore`) and `*.meta`
   * sidecars are omitted. Optional `root` is the workspace cwd for ignore
   * matching; when omitted the host uses the longest registered workspace
   * prefix, else `path`. A missing `path` is a schema failure; a missing or
   * unreadable target fails with `fs-failed`. The carrier's request signal
   * follows the caller.
   */
  listEntries(
    request: RpcRequest<{ path: string; root?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<FsListing>>

  /**
   * Fuzzy-search files and folders under one workspace root via `ctx.fs.listDir`.
   * The walk stays inside the resolved root; ignore rules and `.meta`
   * sidecars are pruned before descent so large trees are not indexed.
   * @param request - workspace root, query, and optional result cap.
   * @param signal - aborts the walk.
   */
  searchEntries(
    request: RpcRequest<{ root: string; query: string; limit?: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<FsSearchListing>>

  /**
   * Create one directory at an absolute path via `ctx.fs.mkdir`. An existing
   * target fails with `fs-failed` (`FS_ALREADY_EXISTS`); other filesystem
   * failures use the same code with the provider's reason.
   */
  mkdir(
    request: RpcRequest<{ path: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * Rename/move a file or directory via `ctx.fs.rename`. An existing
   * destination or missing source fails with `fs-failed`.
   */
  rename(
    request: RpcRequest<{ from: string; to: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * Delete a file or directory via `ctx.fs.delete`. Directories are removed
   * recursively. A missing target fails with `fs-failed` (`FS_NOT_FOUND`).
   */
  delete(
    request: RpcRequest<{ path: string }>,
  ): Promise<RpcResponse<{ deleted: true }>>

  /**
   * Copy a file or directory via `ctx.fs.copy`. Directories are copied
   * recursively. An existing destination fails with `fs-failed`.
   */
  copy(
    request: RpcRequest<{ from: string; to: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * Create or replace a UTF-8 text file via `ctx.fs.writeText`. An absent
   * `content` writes an empty file. Filesystem failures use `fs-failed`
   * with the provider's reason.
   */
  writeText(
    request: RpcRequest<{ path: string; content?: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * Read a UTF-8 text file via `ctx.fs.readText`. Binary or missing
   * targets fail with `fs-failed` and the provider's reason.
   */
  readText(
    request: RpcRequest<{ path: string }>,
  ): Promise<RpcResponse<{ path: string; content: string }>>

  /**
   * Open a filesystem path with the operating system's default application
   * (Finder / Explorer / xdg-open hand-off). The browser carrier's
   * prefix-wide trust fence covers this privileged method like every other
   * `/api` request.
   */
  openPath(
    request: RpcRequest<{ path: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ opened: true }>>

  /**
   * Reveal a filesystem path in the host file manager with the item selected
   * (Explorer `/select`, macOS `open -R`, Linux FileManager1.ShowItems). Same
   * trust fence as {@link openPath}.
   */
  revealPath(
    request: RpcRequest<{ path: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ revealed: true }>>

  /**
   * Accept a loopback-only restart of this deployment's `dsh web` listener.
   * The payload may carry only an optional `port` (1–65535); extra keys are a
   * schema `bad-request`. An omitted port uses this process's listen port,
   * else 3080. After confirming `scripts/restart-dsh-web.mjs` exists under the
   * host cwd, the method returns `{ accepted, port }` and then schedules a
   * detached spawn of that script with only `--port <n>` so the HTTP response
   * can flush before the script kills this process. Kill safety stays in the
   * script (CommandLine-confirmed `dsh` / `web` / `--port` only). A missing
   * script answers `internal` with the path. A spawn that throws after accept
   * is logged and is not rolled back; the browser infers failure from the
   * origin health wait. The browser never supplies argv.
   * @param request - optional listen port.
   * @returns accepted restart plus the port the script will target.
   */
  restartWeb(
    request: RpcRequest<{ port?: number }>,
  ): Promise<RpcResponse<{ accepted: true; port: number }>>
}
