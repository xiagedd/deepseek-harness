#!/usr/bin/env node
/**
 * Cross-platform entry for restarting `dsh web` with self-proof.
 *
 * Windows: delegates to scripts/restart-dsh-web.ps1 (CommandLine-confirmed kill).
 * macOS/Linux: uses lsof + safe argv matching, then starts the same node/tsx command.
 *
 * Usage:
 *   pnpm run web:restart
 *   pnpm run web:restart -- --port 3080
 *   pnpm run web:restart -- --no-kill --timeout 15
 *   pnpm run web:restart -- --foreground
 *   pnpm run web:restart -- --dry-run
 *   pnpm run web:restart -- --skip-start
 */
import { spawn, spawnSync } from 'node:child_process'
import { openSync } from 'node:fs'
import http from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')

/**
 * @typedef {{
 *   port: number,
 *   noKill: boolean,
 *   timeout: number,
 *   foreground: boolean,
 *   skipStart: boolean,
 *   dryRun: boolean,
 * }} RestartOptions
 */

/**
 * Parse CLI flags shared by the npm script wrapper.
 * @param {string[]} argv
 * @returns {RestartOptions}
 */
export function parseArgs(argv) {
  /** @type {RestartOptions} */
  const opts = {
    port: 3080,
    noKill: false,
    timeout: 10,
    foreground: false,
    skipStart: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`Missing value after ${a}`)
      return v
    }
    switch (a) {
      case '--port':
      case '-Port':
        opts.port = Number(next())
        break
      case '--timeout':
      case '-Timeout':
        opts.timeout = Number(next())
        break
      case '--no-kill':
      case '-NoKill':
        opts.noKill = true
        break
      case '--foreground':
      case '-Foreground':
        opts.foreground = true
        break
      case '--skip-start':
      case '-SkipStart':
        opts.skipStart = true
        break
      case '--dry-run':
      case '-DryRun':
        opts.dryRun = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${a}`)
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    throw new Error(`Invalid --port ${opts.port}`)
  }
  if (!Number.isInteger(opts.timeout) || opts.timeout < 1) {
    throw new Error(`Invalid --timeout ${opts.timeout}`)
  }
  return opts
}

function printHelp() {
  console.log(`Restart dsh web with kill confirmation and self-proof.

Usage: pnpm run web:restart -- [options]

Options:
  --port <n>       Listen port (default 3080)
  --timeout <s>    Wait budget for free/listen/health (default 10)
  --no-kill        Start only; fail if the port is already taken
  --foreground     Keep the server in this terminal (default: background + logs)
  --skip-start     Only clear/confirm the port; do not start dsh web
  --dry-run        Print the plan; do not kill or start
  -h, --help       Show this help

Background logs (default):
  .dsh-web-<port>.log
  .dsh-web-<port>.err.log
`)
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

/**
 * @param {RestartOptions} opts
 */
function runWindows(opts) {
  const ps1 = join(scriptDir, 'restart-dsh-web.ps1')
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ps1,
    '-Port', String(opts.port),
    '-Timeout', String(opts.timeout),
  ]
  if (opts.noKill) args.push('-NoKill')
  if (opts.foreground) args.push('-Foreground')
  if (opts.skipStart) args.push('-SkipStart')
  if (opts.dryRun) args.push('-DryRun')
  const result = spawnSync('powershell.exe', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${process.env.PATH ?? ''};C:\\Program Files\\nodejs`,
    },
  })
  process.exit(result.status ?? 1)
}

/**
 * @param {number} port
 * @returns {number[]}
 */
function listeningPidsUnix(port) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  })
  if (r.status !== 0 && !(r.stdout ?? '').trim()) return []
  return (r.stdout ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * @param {number} pid
 * @returns {{ pid: number, ppid: number, command: string } | null}
 */
function processInfoUnix(pid) {
  const r = spawnSync('ps', ['-o', 'pid=,ppid=,command=', '-p', String(pid)], {
    encoding: 'utf8',
  })
  if (r.status !== 0) return null
  const line = (r.stdout ?? '').trim()
  if (!line) return null
  const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
  if (!m) return null
  return { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }
}

/**
 * @param {string} command
 * @param {number} port
 */
function isDshWebCommand(command, port) {
  if (!command) return false
  const portRe = new RegExp(`(?:--port|-Port)["']?\\s*["']?${port}(?:\\s|["']|$)`)
  if (!portRe.test(command)) return false
  const hasBinWeb = /bin\.ts(?:\s|["'])+web\b/i.test(command)
  const hasDshWeb = /(?:\bdsh\b|\/dsh(?:\.js)?)\b.*\bweb\b/i.test(command)
  const hasTsxOrNode = /(?:tsx\/esm|apps\/cli\/src\/bin\.ts|\bnode\b)/i.test(command)
  if (hasBinWeb) return true
  if (hasDshWeb && hasTsxOrNode) return true
  if (/(?:^|[\s"'])web(?:[\s"']|$)/i.test(command) && /bin\.ts/i.test(command) && hasTsxOrNode) return true
  return false
}

/**
 * @param {number} port
 */
function killCandidatesUnix(port) {
  /** @type {number[]} */
  const toKill = []
  /** @type {string[]} */
  const rejected = []
  const listeners = listeningPidsUnix(port)
  for (const pid of listeners) {
    const info = processInfoUnix(pid)
    if (!info) {
      rejected.push(`PID ${pid} (vanished)`)
      continue
    }
    if (!isDshWebCommand(info.command, port)) {
      rejected.push(`PID ${pid} CMD=${info.command}`)
      continue
    }
    toKill.push(pid)
    const parent = processInfoUnix(info.ppid)
    if (
      parent &&
      (
        isDshWebCommand(parent.command, port) ||
        (
          /\b(corepack|pnpm)\b/i.test(parent.command) &&
          /\b(?:dsh|bin\.ts)\b/i.test(parent.command) &&
          /\bweb\b/i.test(parent.command)
        )
      )
    ) {
      toKill.push(parent.pid)
    }
  }
  return { listeners, toKill: [...new Set(toKill)], rejected }
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {number} port
 * @param {number} seconds
 */
async function waitPortFree(port, seconds) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (listeningPidsUnix(port).length === 0) return
    await sleep(250)
  }
  const left = listeningPidsUnix(port)
  const details = left.map((pid) => {
    const info = processInfoUnix(pid)
    return info ? `PID ${info.pid} CMD=${info.command}` : `PID ${pid}`
  })
  fail(`Port ${port} still LISTENING after ${seconds}s:\n${details.join('\n')}`)
}

/**
 * @param {number} port
 * @param {number} seconds
 * @returns {Promise<number[]>}
 */
async function waitPortListen(port, seconds) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const pids = listeningPidsUnix(port)
    if (pids.length > 0) return pids
    await sleep(250)
  }
  fail(`Port ${port} did not enter LISTENING within ${seconds}s. Check .dsh-web-${port}.log / .dsh-web-${port}.err.log`)
}

/**
 * @param {number} port
 * @param {number} seconds
 */
async function waitHttpOk(port, seconds) {
  const url = `http://127.0.0.1:${port}/`
  const deadline = Date.now() + seconds * 1000
  let last = 'no attempt'
  while (Date.now() < deadline) {
    try {
      const status = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.setTimeout(2000, () => {
          req.destroy(new Error('timeout'))
        })
      })
      if (status >= 200 && status < 400) return
      last = `HTTP ${status}`
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await sleep(300)
  }
  fail(`Health check failed for ${url} within ${seconds}s. Last error: ${last}`)
}

/**
 * @param {RestartOptions} opts
 */
async function runUnix(opts) {
  console.log(`Repo: ${repoRoot}`)
  console.log(`Port: ${opts.port}  Timeout: ${opts.timeout}s  NoKill=${opts.noKill}  Foreground=${opts.foreground}  SkipStart=${opts.skipStart}  DryRun=${opts.dryRun}`)

  if (opts.dryRun) {
    const plan = killCandidatesUnix(opts.port)
    console.log(`DryRun: listeners=${plan.listeners.join(',')} killCandidates=${plan.toKill.join(',')} rejected=${plan.rejected.length}`)
    console.log(`DryRun: would start: node --import tsx/esm apps/cli/src/bin.ts web --port ${opts.port}`)
    console.log(opts.foreground
      ? 'DryRun: foreground mode (terminal occupied).'
      : `DryRun: background mode -> .dsh-web-${opts.port}.log / .dsh-web-${opts.port}.err.log`)
    process.exit(0)
  }

  if (!opts.noKill) {
    const plan = killCandidatesUnix(opts.port)
    if (plan.rejected.length > 0 && plan.toKill.length === 0 && plan.listeners.length > 0) {
      fail(`Port ${opts.port} is LISTENING but no confirmed dsh-web process matched. Refusing to kill unrelated owners:\n${plan.rejected.join('\n')}`)
    }
    if (plan.rejected.length > 0 && plan.toKill.length > 0) {
      console.log('WARNING: some listeners were skipped (not confirmed dsh web):')
      for (const row of plan.rejected) console.log(`  ${row}`)
    }
    if (plan.toKill.length > 0) {
      for (const pid of plan.toKill) {
        const info = processInfoUnix(pid)
        console.log(`Stopping PID ${pid}${info ? ` CMD=${info.command}` : ''}`)
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // Process may already have exited.
        }
      }
      await waitPortFree(opts.port, opts.timeout)
      console.log(`Port ${opts.port} is free.`)
    } else {
      console.log(`No confirmed dsh-web listener on port ${opts.port}.`)
      const left = listeningPidsUnix(opts.port)
      if (left.length > 0) {
        fail(`Port ${opts.port} still has listeners but none matched dsh web. PIDs: ${left.join(', ')}`)
      }
    }
  } else {
    console.log('-NoKill set: leaving existing listeners alone.')
    const left = listeningPidsUnix(opts.port)
    if (left.length > 0) {
      fail(`Port ${opts.port} already LISTENING (PIDs ${left.join(', ')}). Clear it or omit --no-kill.`)
    }
  }

  if (opts.skipStart) {
    console.log('SkipStart: port clear; not starting dsh web.')
    process.exit(0)
  }

  const bin = join(repoRoot, 'apps/cli/src/bin.ts')
  const nodeArgs = ['--import', 'tsx/esm', bin, 'web', '--port', String(opts.port)]
  console.log(`Command: node ${nodeArgs.join(' ')}`)

  if (opts.foreground) {
    console.log(`Starting dsh web in FOREGROUND on port ${opts.port} (this terminal stays occupied).`)
    const child = spawn(process.execPath, nodeArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code, signal) => {
      if (signal) process.exit(1)
      process.exit(code ?? 1)
    })
    return
  }

  const outLog = join(repoRoot, `.dsh-web-${opts.port}.log`)
  const errLog = join(repoRoot, `.dsh-web-${opts.port}.err.log`)
  console.log(`Starting dsh web in BACKGROUND on port ${opts.port}.`)
  console.log(`Logs: ${outLog}`)
  console.log(`      ${errLog}`)
  const outFd = openSync(outLog, 'a')
  const errFd = openSync(errLog, 'a')
  const child = spawn(process.execPath, nodeArgs, {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: process.env,
  })
  child.unref()
  const startedPid = child.pid
  const listenerPids = await waitPortListen(opts.port, opts.timeout)
  await waitHttpOk(opts.port, opts.timeout)

  console.log('')
  console.log('=== RESTART SELF-PROOF ===')
  console.log(`URL: http://127.0.0.1:${opts.port}/`)
  if (startedPid) console.log(`Start-Process PID: ${startedPid}`)
  for (const pid of listenerPids) {
    const info = processInfoUnix(pid)
    console.log(`Listener PID: ${pid}`)
    console.log(`CommandLine: ${info?.command ?? '(unavailable)'}`)
  }
  console.log('')
  console.log('If the new process start time is later than your last code change, the new process loaded that code.')
  console.log('Browser refresh alone does NOT restart the host. Hard-refresh only helps rebuilt client bundles.')
  process.exit(0)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (process.platform === 'win32') {
    runWindows(opts)
    return
  }
  await runUnix(opts)
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirect) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err))
  })
}
