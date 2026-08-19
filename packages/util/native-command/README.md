# dsh-native-command

English | [中文](README.zh.md)

A **zero-dependency no-shell `execFile` runner** shared by host-native OS integrations: one `runNativeCommand(command, args, signal)` call spawns the executable directly (never a shell string), captures utf8 stdout/stderr, propagates the caller's abort into child termination, and hides the transient console window on Windows. Failures reject with the exit `code` and both captured streams attached, so callers classify (missing tool, cancelled, real failure) without re-running anything.

Its consumers are the host-side native integrations: the [`directory-picker-native`](../../host/directory-picker-native/README.md) backend's OS chooser commands and the gateway's open- and reveal-a-path hand-offs ([`dsh-host-apiproxy`](../../host/apiproxy/README.md) `host.openPath` / `host.revealPath`). The `NativeCommandRunner` type is their injectable command boundary, shared by all three runners.

Two launchers cover commands whose value is the window they raise rather than their output: both detach the child, drop its stdio, unref it, and resolve as soon as the process exists, so no exit code is ever observed and `signal` gates only the spawn. `launchNativeCommandVerbatim` differs in one thing — it hands Windows the literal command line (`windowsVerbatimArguments`) instead of letting Node quote each token. `explorer.exe /select,<path>` needs that: switch and path are one argv token, and quoting it because the path contains a space makes Explorer recognise no switch and raise no window, while the spawn still reports success. Only the trailing path may contain spaces there; the command name and earlier tokens are joined unquoted and would split.

It is a **library, not a service or plugin**: no `ctx`, registers nothing, holds no state, emits no events.

## Surface

```ts
import {
  runNativeCommand, launchNativeCommand, launchNativeCommandVerbatim, type NativeCommandRunner,
} from '@deepseek-ai/dsh-native-command'
```

## Model Experience

None, as this is host-side subprocess plumbing; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No output bounding** — both streams buffer unbounded in memory; every current caller invokes small native tools whose output is a path or an error line. Adopt `dsh-output-retention` bounding before pointing this at commands with meaningful output volume.
