/**
 * 16px explorer glyphs, one shared line weight (1.15) and 16-unit viewBox.
 * Folders have three states drawn in the same folded-paper style as the file
 * marks: a filled tab folder when closed with contents, a filled open folder
 * when expanded, and a stroke-only outline folder when empty and closed.
 * Files share one folded-paper silhouette; the inner mark is the type.
 */
import type { ReactElement, ReactNode } from 'react'

/** Row glyph after ignore / `.meta` filtering. */
export type ExplorerIconKind =
  | 'folder'
  | 'folderEmpty'
  | 'code'
  | 'text'
  | 'image'
  | 'data'
  | 'prefab'
  | 'mesh'
  | 'material'
  | 'shader'
  | 'scene'
  | 'anim'
  | 'audio'
  | 'asset'
  | 'file'

/** Type-filter values shown next to the expanded-range search box. */
export type ExplorerTypeFilter = 'all' | 'directory' | 'code' | 'text' | 'other'

const CODE_EXTS = new Set(['cs', 'ts', 'tsx', 'js', 'jsx', 'c', 'h', 'cpp', 'hpp', 'py', 'go', 'rs', 'java'])
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'rst', 'log'])
const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tga', 'tif', 'tiff', 'exr', 'hdr', 'psd', 'rendertexture',
])
const DATA_EXTS = new Set(['json', 'yaml', 'yml', 'toml', 'xml'])
const PREFAB_EXTS = new Set(['prefab'])
const MESH_EXTS = new Set(['fbx', 'obj', 'mesh', 'blend', 'dae', '3ds'])
const MATERIAL_EXTS = new Set(['mat', 'physicmaterial', 'physicsmaterial'])
const SHADER_EXTS = new Set(['shader', 'hlsl', 'cginc', 'compute', 'shadergraph'])
const SCENE_EXTS = new Set(['unity'])
const ANIM_EXTS = new Set(['anim', 'controller', 'overridecontroller', 'playable'])
const AUDIO_EXTS = new Set(['wav', 'mp3', 'ogg', 'aiff', 'aif', 'flac'])
const ASSET_EXTS = new Set(['asset'])

const PAPER =
  'M3.4 1.7h5.7L12.6 5.2v8.4c0 .6-.5 1.1-1.1 1.1H3.4c-.6 0-1.1-.5-1.1-1.1V2.8c0-.6.5-1.1 1.1-1.1Z'
const FOLD = 'M9.05 1.75v2.85c0 .4.35.75.75.75h2.7'

/** Closed tab-folder silhouette shared by the filled and outline glyphs. */
const FOLDER_CLOSED =
  'M2.4 4.35c0-.63.5-1.13 1.12-1.13h2.63c.37 0 .72.18.94.48l.5.68c.22.3.57.48.94.48h4.06c.62 0 1.12.5 1.12 1.12v5.63c0 .62-.5 1.12-1.12 1.12H3.52c-.62 0-1.12-.5-1.12-1.12V4.35Z'
/** Open-folder back plate (tab + rear wall). */
const FOLDER_OPEN_BACK =
  'M2.4 4.35c0-.63.5-1.13 1.12-1.13h2.63c.37 0 .72.18.94.48l.5.68c.22.3.57.48.94.48h4.06c.62 0 1.12.5 1.12 1.12v1.05H5.1c-.53 0-1 .35-1.14.86L2.4 11.6V4.35Z'
/** Open-folder front flap tilted forward. */
const FOLDER_OPEN_FRONT =
  'M4.28 7.55h9.4c.6 0 1.03.58.86 1.16l-1.03 3.5c-.12.4-.49.68-.9.68H2.72c-.6 0-1.03-.58-.86-1.16l1.03-3.5c.12-.4.49-.68.9-.68Z'

/** Filled tab folder — a closed directory with contents. */
export function ExplorerFolderSolid16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={FOLDER_CLOSED} fill="currentColor" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </svg>
  )
}

/** Outline tab folder — a closed directory with no visible children. */
export function ExplorerFolderEmpty16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={FOLDER_CLOSED} fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </svg>
  )
}

/** Filled open folder — an expanded directory. */
export function ExplorerFolderOpen16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={FOLDER_OPEN_BACK} fill="currentColor" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d={FOLDER_OPEN_FRONT} fill="currentColor" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </svg>
  )
}

function FoldedPaper({ size, children }: { size: number; children?: ReactNode }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={PAPER} stroke="currentColor" strokeWidth="1.15" />
      <path d={FOLD} stroke="currentColor" strokeWidth="1.15" />
      {children}
    </svg>
  )
}

/** Lowercased extension after the last dot; empty when the name has none. */
export function fileExtension(name: string): string {
  const cut = name.lastIndexOf('.')
  if (cut <= 0 || cut === name.length - 1) return ''
  return name.slice(cut + 1).toLowerCase()
}

/** True when the basename is README, with or without an extension. */
export function isReadmeName(name: string): boolean {
  return /^readme(\.|$)/i.test(name)
}

/** True when the name is a code file for the type filter. */
export function isCodeName(name: string): boolean {
  return CODE_EXTS.has(fileExtension(name))
}

/** True when the name is `.txt` / `.md` / README for the type filter. */
export function isTextName(name: string): boolean {
  return isReadmeName(name) || TEXT_EXTS.has(fileExtension(name))
}

/**
 * Whether a listed row belongs in the current type filter. Folders are only
 * a direct match for `all` / `directory`; they stay as ancestors separately.
 */
export function matchesTypeFilter(
  kind: 'file' | 'directory',
  name: string,
  filter: ExplorerTypeFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'directory') return kind === 'directory'
  if (kind === 'directory') return false
  if (filter === 'code') return isCodeName(name)
  if (filter === 'text') return isTextName(name)
  return !isCodeName(name) && !isTextName(name)
}

/** Case-insensitive substring match; a blank query matches every name. */
export function matchesSearch(name: string, query: string): boolean {
  if (query === '') return true
  return name.toLowerCase().includes(query.trim().toLowerCase())
}

/**
 * Icon kind for a file or folder row. A known-empty folder maps to the outline
 * `folderEmpty` glyph; every other folder maps to the filled `folder` glyph
 * (open vs closed is the `ExplorerGlyph` `open` flag).
 * A listed file with `size === 0` is a blank folded page, even if it has an extension.
 */
export function explorerIconKind(
  kind: 'file' | 'directory',
  name: string,
  empty = false,
  size?: number,
): ExplorerIconKind {
  if (kind === 'directory') return empty ? 'folderEmpty' : 'folder'
  if (size === 0) return 'file'
  if (isReadmeName(name)) return 'text'
  const ext = fileExtension(name)
  if (PREFAB_EXTS.has(ext)) return 'prefab'
  if (MESH_EXTS.has(ext)) return 'mesh'
  if (MATERIAL_EXTS.has(ext)) return 'material'
  if (SHADER_EXTS.has(ext)) return 'shader'
  if (SCENE_EXTS.has(ext)) return 'scene'
  if (ANIM_EXTS.has(ext)) return 'anim'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (ASSET_EXTS.has(ext)) return 'asset'
  if (CODE_EXTS.has(ext)) return 'code'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (DATA_EXTS.has(ext)) return 'data'
  return 'file'
}

/** Blank folded page (empty files and untyped others). */
export function ExplorerFileBlank16({ size = 16 }: { size?: number }): ReactElement {
  return <FoldedPaper size={size} />
}

/** Folded page with a green `#` — code (`.cs` / `.ts` / `.js` …). */
export function ExplorerFileCode16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <text
        x="8"
        y="12.15"
        fill="#3DDC84"
        fontSize="7.2"
        fontFamily="ui-monospace,Consolas,monospace"
        fontWeight="700"
        textAnchor="middle"
      >
        #
      </text>
    </FoldedPaper>
  )
}

/** Folded page with three lines — `.txt` / `.md` / README. */
export function ExplorerFileText16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path d="M4.7 8.15h6.4M4.7 10.05h6.4M4.7 11.95h4.2" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </FoldedPaper>
  )
}

/** Folded page with a mountain — textures / images. */
export function ExplorerFileImage16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <circle cx="5.7" cy="8.05" r="0.7" fill="currentColor" />
      <path d="M4.4 12.35 7 9.55l1.7 1.5 1.55-1.85 1.7 3.15" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </FoldedPaper>
  )
}

/** Folded page with `{}` — json / yml. */
export function ExplorerFileData16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path
        d="M6.15 7.15c-.55 0-.85.35-.85.85v.55c0 .2-.1.35-.35.45.25.1.35.25.35.45v.55c0 .5.3.85.85.85M9.85 7.15c.55 0 .85.35.85.85v.55c0 .2.1.35.35.45-.25.1-.35.25-.35.45v.55c0 .5-.3.85-.85.85"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </FoldedPaper>
  )
}

/** Folded page with a cube — `.prefab`. */
export function ExplorerFilePrefab16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path
        d="M8 7.1 5.6 8.35v2.5L8 12.1l2.4-1.25v-2.5Z"
        stroke="#5B8DEF"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M5.6 8.35 8 9.6l2.4-1.25" stroke="#5B8DEF" strokeWidth="1.1" />
    </FoldedPaper>
  )
}

/** Folded page with a triangle mesh — `.fbx` / `.obj` / `.mesh`. */
export function ExplorerFileMesh16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path d="M8 7.05 5.35 12.05h5.3Z" stroke="#C47A3A" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M8 7.05v5M5.35 12.05 8 9.4l2.65 2.65" stroke="#C47A3A" strokeWidth="1.05" />
    </FoldedPaper>
  )
}

/** Folded page with a shaded sphere — `.mat`. */
export function ExplorerFileMaterial16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <circle cx="8" cy="9.6" r="2.55" stroke="#E07A3A" strokeWidth="1.15" />
      <path d="M6.35 8.55c.45-.7 1.15-1.05 1.9-.85" stroke="#E07A3A" strokeWidth="1.1" strokeLinecap="round" />
    </FoldedPaper>
  )
}

/** Folded page with a bolt — `.shader` / `.hlsl`. */
export function ExplorerFileShader16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path d="M8.85 6.9 6.4 9.7h1.7L7.15 12.3 9.7 9.45H8Z" fill="#A56BFF" />
    </FoldedPaper>
  )
}

/** Folded page with a sun over ground — `.unity` scene. */
export function ExplorerFileScene16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <circle cx="8" cy="8.35" r="1.15" stroke="#E0B400" strokeWidth="1.1" />
      <path d="M4.55 12.2 6.4 10.2l1.45 1.2 1.5-1.85 2.1 2.65" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </FoldedPaper>
  )
}

/** Folded page with a play mark — `.anim` / animator. */
export function ExplorerFileAnim16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path d="M6.55 7.35v4.7L11.05 9.7Z" fill="#3DDC84" />
    </FoldedPaper>
  )
}

/** Folded page with a waveform — audio clips. */
export function ExplorerFileAudio16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path
        d="M5.2 10.9V8.7M6.7 12.05V7.55M8.2 11.2V8.4M9.7 12.2V7.4M11.2 10.55V8.85"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </FoldedPaper>
  )
}

/** Folded page with a diamond — generic `.asset`. */
export function ExplorerFileAsset16({ size = 16 }: { size?: number }): ReactElement {
  return (
    <FoldedPaper size={size}>
      <path d="M8 7.2 10.4 9.6 8 12 5.6 9.6Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </FoldedPaper>
  )
}

/**
 * Pick the 16px glyph for one arborist row.
 * @param kind - {@link ExplorerIconKind}.
 * @param open - true when a non-empty folder is expanded.
 */
export function ExplorerGlyph({ kind, open }: { kind: ExplorerIconKind; open: boolean }): ReactElement {
  if (kind === 'folderEmpty') return <ExplorerFolderEmpty16 />
  if (kind === 'folder') return open ? <ExplorerFolderOpen16 /> : <ExplorerFolderSolid16 />
  if (kind === 'code') return <ExplorerFileCode16 />
  if (kind === 'text') return <ExplorerFileText16 />
  if (kind === 'image') return <ExplorerFileImage16 />
  if (kind === 'data') return <ExplorerFileData16 />
  if (kind === 'prefab') return <ExplorerFilePrefab16 />
  if (kind === 'mesh') return <ExplorerFileMesh16 />
  if (kind === 'material') return <ExplorerFileMaterial16 />
  if (kind === 'shader') return <ExplorerFileShader16 />
  if (kind === 'scene') return <ExplorerFileScene16 />
  if (kind === 'anim') return <ExplorerFileAnim16 />
  if (kind === 'audio') return <ExplorerFileAudio16 />
  if (kind === 'asset') return <ExplorerFileAsset16 />
  return <ExplorerFileBlank16 />
}
