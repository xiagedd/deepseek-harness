/**
 * Cross-platform native path and text-document openers used by the local GUI
 * carrier.
 *
 * The default intent prefers the default browser for documents it renders when
 * the platform can name one, then falls back to the default application. WSL
 * translates every path for the Windows desktop instead of assuming a Linux
 * GUI. The text-editor intent never consults the browser.
 */

import { release as osRelease } from 'node:os'
import { dirname, extname, win32 as win32Path } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchNativeCommandVerbatim, runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'

/** Testable command boundary; native implementations never invoke a shell. */
export type PathOpenerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface PathOpenerInternals {
  platform?: NodeJS.Platform
  /** Kernel release override used to distinguish WSL from desktop Linux. */
  osRelease?: string
  /** Environment used for WSL markers and the desktop Linux browser convention. */
  env?: NodeJS.ProcessEnv
  run?: PathOpenerRunner
  /**
   * Runner for fire-and-forget desktop launches (`explorer.exe /select,`).
   * Production detaches those and passes the Windows command line verbatim;
   * `run` substitutes for it when a test injects only one boundary.
   */
  launch?: PathOpenerRunner
}

/** Documents a browser renders, as opposed to ones an editor merely edits. */
const BROWSER_DOCUMENTS = new Set(['.html', '.htm', '.xhtml', '.svg'])

/**
 * The macOS bundle registered for `https` — the default browser, as
 * LaunchServices records it. The nested version dict is stripped first
 * because it carries its own `LSHandlerRoleAll`.
 */
function macBundleForHttps(plist: string): string | undefined {
  const stripped = plist.replace(/LSHandlerPreferredVersions\s*=\s*\{[^}]*\};/g, '')
  const block = /\{[^{}]*LSHandlerURLScheme\s*=\s*"?https"?;[^{}]*\}/.exec(stripped)?.[0]
  if (block === undefined) return undefined
  return /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(block)?.[1]
}

/**
 * Open one browser-renderable document with the default browser.
 * @returns true when a browser took it; false when this platform cannot name
 * one, or naming it failed — the caller then uses the default application.
 */
async function openInBrowser(
  path: string, signal: AbortSignal, platform: NodeJS.Platform,
  run: PathOpenerRunner, env: NodeJS.ProcessEnv,
): Promise<boolean> {
  if (platform === 'darwin') {
    let bundle: string | undefined
    try {
      const { stdout } = await run(
        'defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure'], signal)
      bundle = macBundleForHttps(stdout)
    } catch {
      // No LaunchServices record (a fresh account never changed a default):
      // the content-type handler is then the system's own choice anyway.
      return false
    }
    if (bundle === undefined) return false
    await run('open', ['-b', bundle, path], signal)
    return true
  }
  if (platform === 'linux') {
    // $BROWSER is the portable convention; desktop-entry resolution through
    // xdg-settings needs a launcher this package has no business shipping.
    const browser = env.BROWSER
    if (browser === undefined || browser === '') return false
    await run(browser, [path], signal)
    return true
  }
  // Windows names no browser without reading the UserChoice registry, and its
  // .html association is the browser in the ordinary case.
  return false
}

/** Native path-open intent; macOS distinguishes text editing from file association. */
type PathOpenIntent = 'default' | 'text-editor'

/** PowerShell single-quoted literal (doubles embedded quotes). */
function powershellLiteral(path: string): string {
  return `'${path.replace(/'/g, "''")}'`
}

/** Whether one environment marker is set to a non-empty value. */
function present(value: string | undefined): boolean {
  return value !== undefined && value !== ''
}

/** Distinguish WSL from desktop Linux using its process and kernel markers. */
function isWsl(internals: PathOpenerInternals): boolean {
  const env = internals.env ?? process.env
  if (present(env.WSL_DISTRO_NAME) || present(env.WSL_INTEROP)) return true
  return (internals.osRelease ?? osRelease()).toLowerCase().includes('microsoft')
}

/** Open one Windows-resolvable path through its registered desktop application. */
async function openWindowsPath(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Invoke-Item -LiteralPath ${powershellLiteral(path)}`,
  ], signal)
}

/** Translate a WSL path before handing it to the Windows desktop. */
async function openWslPath(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  const translated = await run('wslpath', ['-w', path], signal)
  signal.throwIfAborted()
  const windowsPath = translated.stdout.replace(/[\r\n]+$/, '')
  if (windowsPath === '') throw new Error('wslpath returned no Windows path')
  await openWindowsPath(windowsPath, signal, run)
}

/** Dispatch one shell-free platform command for the requested open intent. */
async function openNativePathWithIntent(
  path: string,
  signal: AbortSignal,
  intent: PathOpenIntent,
  internals: PathOpenerInternals = {},
): Promise<void> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand
  const env = internals.env ?? process.env
  const wsl = platform === 'linux' && isWsl(internals)

  if (!wsl && intent === 'default' && BROWSER_DOCUMENTS.has(extname(path).toLowerCase())
    && await openInBrowser(path, signal, platform, run, env)) return

  if (platform === 'darwin') {
    await run('open', intent === 'text-editor' ? ['-t', path] : [path], signal)
    return
  }

  if (platform === 'win32') {
    await openWindowsPath(path, signal, run)
    return
  }

  if (platform === 'linux') {
    if (wsl) {
      await openWslPath(path, signal, run)
      return
    }
    await run('xdg-open', [path], signal)
    return
  }

  throw new Error(`native path opener is unsupported on ${platform}`)
}

/**
 * Whether {@link openNativePath} plausibly reaches a desktop on this host.
 *
 * macOS and Windows always carry a desktop opener; Linux does when it is WSL
 * (the Windows desktop takes the path) or a display server is announced.
 * A headless or containerised Linux host answers false, which is what lets a
 * surface show a path as text instead of offering a button that would spawn
 * `xdg-open` into nothing.
 * @param internals - platform and environment seam for deterministic tests.
 * @returns true when handing a path to the native opener can work at all.
 */
export function canOpenNativePath(internals: PathOpenerInternals = {}): boolean {
  const platform = internals.platform ?? process.platform
  if (platform === 'darwin' || platform === 'win32') return true
  if (platform !== 'linux') return false
  const env = internals.env ?? process.env
  return isWsl(internals) || present(env.DISPLAY) || present(env.WAYLAND_DISPLAY)
}

/**
 * Open a filesystem path with the operating system's default application, or
 * with the default browser when the path names a document a browser renders.
 * @param path - absolute or host-resolvable path (caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform, environment, and runner hooks for deterministic tests.
 */
export function openNativePath(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  return openNativePathWithIntent(path, signal, 'default', internals)
}

/**
 * Open a text document for editing; macOS bypasses the file-type association
 * so a YAML association with a browser cannot consume the gesture.
 * @param path - absolute or host-resolvable text-document path.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 */
export function openNativeTextFile(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  return openNativePathWithIntent(path, signal, 'text-editor', internals)
}

/**
 * Whether a failed `explorer.exe` spawn is the well-known non-zero exit that
 * still means the folder opened and the item was selected. Missing executable
 * (`ENOENT`) and aborts stay real failures.
 * @param error - rejection from {@link PathOpenerRunner}.
 */
function isBenignExplorerExit(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: string | number }).code
  return typeof code === 'number'
}

/**
 * Explorer accepts only a native Windows path after `/select,`: a
 * forward-slash path (how a workspace cwd frequently reaches the Host) makes
 * it open the default folder and select nothing, with no error to observe. A
 * trailing separator, which a directory path often carries, has the same
 * effect, so it is dropped — except from a bare drive or UNC root, which has no
 * item to select and stays the folder Explorer opens.
 * @param path - Windows path in either separator form.
 * @returns the same location with backslash separators and no trailing one.
 */
export function windowsSelectPath(path: string): string {
  const normalized = win32Path.normalize(path)
  const trimmed = normalized.replace(/\\+$/, '')
  return trimmed === '' || trimmed.endsWith(':') ? normalized : trimmed
}

/**
 * Reveal one Windows path in Explorer with the item selected.
 *
 * `/select,` must be a single argv token with no space after the comma, and
 * that token must reach Explorer unquoted: the default launcher passes the
 * Windows command line verbatim (`launchNativeCommandVerbatim`) because Node's
 * own quoting wraps a token containing a space, which Explorer then rejects
 * without raising a window. Non-ASCII path characters need nothing extra.
 * Explorer often exits non-zero even on success, and the detached launch never
 * observes an exit code at all.
 */
async function revealWindowsPath(path: string, signal: AbortSignal, launch: PathOpenerRunner): Promise<void> {
  try {
    await launch('explorer.exe', [`/select,${windowsSelectPath(path)}`], signal)
  } catch (error: unknown) {
    if (signal.aborted) throw error
    if (!isBenignExplorerExit(error)) throw error
  }
}

/** Translate a WSL path, then reveal it on the Windows desktop. */
async function revealWslPath(
  path: string, signal: AbortSignal, run: PathOpenerRunner, launch: PathOpenerRunner,
): Promise<void> {
  const translated = await run('wslpath', ['-w', path], signal)
  signal.throwIfAborted()
  const windowsPath = translated.stdout.replace(/[\r\n]+$/, '')
  if (windowsPath === '') throw new Error('wslpath returned no Windows path')
  await revealWindowsPath(windowsPath, signal, launch)
}

/**
 * Ask the desktop FileManager1 service to show and select one path; on any
 * failure open the parent directory instead (selection is best-effort).
 */
async function revealLinuxPath(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  const uri = pathToFileURL(path).href
  try {
    await run('dbus-send', [
      '--session',
      '--dest=org.freedesktop.FileManager1',
      '--type=method_call',
      '/org/freedesktop/FileManager1',
      'org.freedesktop.FileManager1.ShowItems',
      `array:string:${uri}`,
      'string:',
    ], signal)
  } catch (error: unknown) {
    if (signal.aborted) throw error
    // No FileManager1 (headless, minimal DE, or tool missing): open the parent.
    await run('xdg-open', [dirname(path)], signal)
  }
}

/**
 * Open the host file manager on the folder that contains `path` and select
 * that item (Unity "Show in Explorer" / VS Code "Reveal in File Explorer" /
 * macOS "Reveal in Finder"). Files and directories share the same select
 * semantics — a folder is selected inside its parent, not opened as the view.
 * @param path - absolute or host-resolvable path to reveal.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform, environment, and runner hooks for deterministic tests.
 */
export async function revealNativePath(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand
  const launch = internals.launch ?? internals.run ?? launchNativeCommandVerbatim
  const wsl = platform === 'linux' && isWsl(internals)

  if (platform === 'darwin') {
    await run('open', ['-R', path], signal)
    return
  }

  if (platform === 'win32') {
    await revealWindowsPath(path, signal, launch)
    return
  }

  if (platform === 'linux') {
    if (wsl) {
      await revealWslPath(path, signal, run, launch)
      return
    }
    await revealLinuxPath(path, signal, run)
    return
  }

  throw new Error(`native path reveal is unsupported on ${platform}`)
}
