/**
 * Shared no-shell `execFile` runner for host-native OS integrations (the
 * native directory chooser, the open-with-default-application hand-off):
 * utf8 stdio capture, abort propagation, Windows console hide. A library,
 * not a plugin — no ctx, no state, no events.
 * @module @deepseek-ai/dsh-native-command
 */

import { execFile, spawn } from 'node:child_process'

/** Testable command boundary; native implementations never invoke a shell. */
export type NativeCommandRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<{ stdout: string; stderr: string }>

/**
 * Run a host command with utf8 stdio, abort propagation, and Windows hide.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @returns captured stdout/stderr on exit 0.
 */
export const runNativeCommand: NativeCommandRunner = (command, args, signal) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = Object.assign(new Error(error.message, { cause: error }), {
            code: error.code,
            stdout,
            stderr,
          })
          reject(failure)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })

/** Detached fire-and-forget spawn shared by both desktop launchers. */
function launchDetached(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
  windowsVerbatimArguments: boolean,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const child = spawn(command, [...args], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve({ stdout: '', stderr: '' })
    })
  })
}

/**
 * Launch a desktop command and stop caring about it: the child is detached,
 * keeps no stdio, and is unreferenced, so the caller neither waits for the GUI
 * it opens nor dies with it. Use it for commands whose value is the window
 * they raise, never for ones whose output is read — it resolves as soon as the
 * child is spawned, with empty stdout/stderr, and an exit code is never
 * observed. `signal` gates the spawn only; a launched desktop command is not
 * cancellable.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller lifetime; an already-aborted signal spawns nothing.
 * @returns empty capture once the child process exists.
 */
export const launchNativeCommand: NativeCommandRunner = (command, args, signal) =>
  launchDetached(command, args, signal, false)

/**
 * Launch a desktop command whose Windows command line must reach the target
 * exactly as written: `args` are joined with single spaces and handed over as
 * the literal command line (`windowsVerbatimArguments`), so Node quotes
 * nothing.
 *
 * `explorer.exe /select,<path>` requires this. The switch and the path are one
 * argv token, so a path containing a space makes Node's default quoting wrap
 * the whole token; Explorer then receives `"/select,C:\a b\c.txt"`, does not
 * recognise the switch, and raises no window at all — a silent failure the
 * caller cannot observe, since the spawn itself succeeds.
 *
 * Only the trailing path argument may contain spaces: earlier tokens, and the
 * command name itself, are not quoted and would split. A Windows file name
 * cannot contain a double quote, so joining a path argument verbatim is
 * lossless. Off Windows the option has no effect and `args` stay separate argv
 * entries. Detachment, stdio, abort gating, and the empty capture match
 * {@link launchNativeCommand}.
 * @param command - executable path or PATH name, itself free of spaces.
 * @param args - literal command-line tail (never a shell string).
 * @param signal - caller lifetime; an already-aborted signal spawns nothing.
 * @returns empty capture once the child process exists.
 */
export const launchNativeCommandVerbatim: NativeCommandRunner = (command, args, signal) =>
  launchDetached(command, args, signal, true)
