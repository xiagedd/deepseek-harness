/**
 * OS / Chromium file-drop path math for the composer. Images stay on the
 * attachment rail; anything else becomes a workspace-file chip only when the
 * engine supplied a native path (Electron `File.path`) under the session cwd.
 * No `node:fs`, no directory walk, no file-body read.
 */

/** One dropped file that can become a path chip. */
export interface DroppedPath {
  readonly file: File
  readonly path: string
}

/** Split a Files drop without reading bytes. */
export interface ClassifiedDrop {
  readonly images: File[]
  readonly paths: DroppedPath[]
  readonly missingPath: File[]
}

/** A dropped path accepted as a workspace-file chip. */
export interface WorkspaceDropChip {
  readonly path: string
  readonly label: string
}

const WORKSPACE_FILE_SOURCE = 'workspace-file'

/**
 * Native path from a Chromium/Electron File, when the OS drop provided one.
 * `webkitRelativePath` is a relative name, not a local path — ignored.
 * @param file - a dropped File.
 * @returns the absolute path, or undefined when the browser did not supply one.
 */
export function localPathOf(file: File): string | undefined {
  const path = (file as File & { readonly path?: unknown }).path
  return typeof path === 'string' && path !== '' ? path : undefined
}

/**
 * Image-rail membership: MIME `image/*` only. Folders and text files have
 * empty or non-image types and must not enter `addImages`.
 * @param file - a dropped File.
 */
export function isImageDrop(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Forward-slash form with no trailing slash (`/` stays `/`; `C:/` becomes `C:`). */
function posixTrim(path: string): string {
  const norm = path.replace(/\\/g, '/')
  if (norm === '/') return '/'
  return norm.replace(/\/+$/, '')
}

/** True when the spelling is a Windows drive or UNC path. */
function windowsAbs(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith('//')
}

/**
 * Last path segment in `/` spelling. Empty only for `/` or `''`.
 * @param path - absolute or relative path.
 */
export function lastSegment(path: string): string {
  const norm = posixTrim(path)
  const cut = norm.lastIndexOf('/')
  return cut < 0 ? norm : norm.slice(cut + 1)
}

/**
 * Workspace-relative POSIX label, or undefined when `abs` is not under `cwd`.
 * Does not join, invent, or probe the disk.
 * @param cwd - session workspace root.
 * @param abs - native absolute path from the drop.
 */
export function relativeToCwd(cwd: string, abs: string): string | undefined {
  const root = posixTrim(cwd)
  const full = posixTrim(abs)
  if (root === '' || full === '') return undefined
  const fold = windowsAbs(root) || windowsAbs(full)
    ? (value: string) => value.toLowerCase()
    : (value: string) => value
  const a = fold(root)
  const b = fold(full)
  if (b === a) {
    const name = lastSegment(full)
    return name === '' ? undefined : name
  }
  const prefix = root === '/' ? '/' : `${root}/`
  if (!b.startsWith(fold(prefix))) return undefined
  return full.slice(prefix.length)
}

/**
 * Chip label matching an `@` workspace-file pick: workspace-relative, or
 * undefined when `cwd` is missing or `abs` is not under it. Never a basename
 * fallback — outside-workspace drops must fail visibly, not look like a chip.
 * @param cwd - session workspace root, when known.
 * @param abs - native absolute path from the drop.
 */
export function pathChipLabel(cwd: string | undefined, abs: string): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  return relativeToCwd(cwd, abs)
}

/**
 * `@` workspace-file insert payload (relative label, absolute ref).
 * @param abs - native absolute path (codec / clipboard).
 * @param label - chip display label.
 */
export function workspaceFileInsert(abs: string, label: string): {
  readonly source: typeof WORKSPACE_FILE_SOURCE
  readonly ref: string
  readonly label: string
  readonly clipboardText: string
} {
  return {
    source: WORKSPACE_FILE_SOURCE,
    ref: abs,
    label,
    clipboardText: abs,
  }
}

/**
 * Keep only paths under `cwd`. Missing cwd or a path outside the workspace
 * is a visible reject — the composer must not invent a chip label.
 * @param cwd - session workspace root, when known.
 * @param rows - non-image drops that already have a native path.
 */
export function acceptWorkspaceDrops(
  cwd: string | undefined,
  rows: readonly DroppedPath[],
): { readonly chips: readonly WorkspaceDropChip[]; readonly outside: boolean } {
  const chips: WorkspaceDropChip[] = []
  for (const row of rows) {
    const label = pathChipLabel(cwd, row.path)
    if (label === undefined) continue
    chips.push({ path: row.path, label })
  }
  return { chips, outside: chips.length !== rows.length }
}

/**
 * Partition a Files drop. Images go to the rail; other files/folders with a
 * native path become chips; path-less non-images are rejects (toast, no body).
 * @param files - `dataTransfer.files`.
 */
export function classifyDrop(files: readonly File[]): ClassifiedDrop {
  const images: File[] = []
  const paths: DroppedPath[] = []
  const missingPath: File[] = []
  for (const file of files) {
    if (isImageDrop(file)) {
      images.push(file)
      continue
    }
    const path = localPathOf(file)
    if (path === undefined) missingPath.push(file)
    else paths.push({ file, path })
  }
  return { images, paths, missingPath }
}
