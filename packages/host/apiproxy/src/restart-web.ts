/**
 * Detached spawn of the repo `web:restart` script. The browser never sees
 * argv: Host validates a port, then this module launches
 * `scripts/restart-dsh-web.mjs --port <n>` only.
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Milliseconds to wait after accepting the RPC so the HTTP response can flush. */
export const RESTART_WEB_FLUSH_MS = 300

/** Repo-relative restart script; Host never accepts a caller-supplied path. */
export const RESTART_WEB_SCRIPT = join('scripts', 'restart-dsh-web.mjs')

/**
 * Resolve the port the restart script will target.
 * @param payloadPort - optional RPC port.
 * @param fallbacks - process listen port from config or `webServer`.
 * @returns payload port, else configured, else hosted, else 3080.
 */
export function resolveRestartListenPort(
  payloadPort: number | undefined,
  fallbacks: { configured?: number; hosted?: number },
): number {
  return payloadPort ?? fallbacks.configured ?? fallbacks.hosted ?? 3080
}

/**
 * Arguments passed to the restart script after the script path.
 * @param port - listen port the script will target.
 * @returns `--port` plus the decimal port; never extra flags.
 */
export function restartWebScriptArgs(port: number): readonly string[] {
  return ['--port', String(port)]
}

/**
 * Resolve the restart script under a host cwd.
 * @param cwd - host process working directory (repo root when launched via `dsh web`).
 * @returns absolute script path, or undefined when the file is absent.
 */
export function resolveRestartWebScript(cwd: string): string | undefined {
  const scriptPath = join(cwd, RESTART_WEB_SCRIPT)
  return existsSync(scriptPath) ? scriptPath : undefined
}

/** Inputs for a detached restart spawn. */
export interface RestartWebSpawnRequest {
  scriptPath: string
  port: number
  cwd: string
}

/** Injectable spawn used by tests; production uses node:child_process.spawn. */
export type RestartWebSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => Pick<ChildProcess, 'unref'>

/**
 * Copy process env for the restart child. Windows appends the stock Node
 * install directory so a Host started without it on PATH still finds `node`.
 * @param platform - `process.platform` of the Host.
 * @param env - env to copy (usually `process.env`).
 * @returns detached-child env; never mutates `env`.
 */
export function restartWebSpawnEnv(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (platform !== 'win32') return { ...env }
  return { ...env, PATH: `${env.PATH ?? ''};C:\\Program Files\\nodejs` }
}

/**
 * Spawn the restart script detached with only `--port`. The child outlives
 * this process so it can kill the current listener and start a new one.
 * @param request - script path, target port, and working directory.
 * @param spawnImpl - injectable spawn (defaults to `spawn`).
 */
export function spawnRestartWeb(
  request: RestartWebSpawnRequest,
  spawnImpl?: RestartWebSpawner,
): void {
  /* v8 ignore next -- production uses node:child_process.spawn; unit tests inject a recorder */
  const run = spawnImpl ?? spawn
  const child = run(process.execPath, [request.scriptPath, ...restartWebScriptArgs(request.port)], {
    cwd: request.cwd,
    detached: true,
    stdio: 'ignore',
    env: restartWebSpawnEnv(process.platform, process.env),
    windowsHide: true,
  })
  child.unref()
}

/**
 * Schedule restart work after the current turn so the unary response can flush.
 * @param work - spawn the restart script.
 * @param delayMs - flush delay (production default {@link RESTART_WEB_FLUSH_MS}).
 */
export function scheduleRestartWeb(work: () => void, delayMs = RESTART_WEB_FLUSH_MS): void {
  setTimeout(work, delayMs)
}
