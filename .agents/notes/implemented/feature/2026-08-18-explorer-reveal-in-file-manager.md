# Agent Note: Reveal in File Manager from the explorer context menu

Status: implemented

English | [中文](2026-08-18-explorer-reveal-in-file-manager.zh.md)

## Problem

Opening a path with the OS default app (`host.openPath`) does not select the file inside Explorer / Finder. Unity's "Show in Explorer" and VS Code's "Reveal in File Explorer" open the containing folder and highlight the item so the user can find it on disk quickly.

## Decision

Add `host.revealPath` beside `host.openPath`: same privileged trust fence, same AbortSignal lifetime, response `{ revealed: true }`. The native helper `revealNativePath` dispatches:

- macOS: `open -R <path>`
- Windows: `explorer.exe /select,<path>` as one argv token (no space after the comma), launched through `launchNativeCommandVerbatim` so the command line reaches Explorer unquoted. Node's ordinary argv quoting wraps a token that contains a space, and Explorer then recognises no switch and raises no window at all — the spawn still succeeds, so nothing on the Host observes the failure. `windowsSelectPath` first normalizes separators to backslashes and drops a trailing one (a bare drive or UNC root keeps it, having no item to select). A numeric exit code is treated as success — explorer often exits non-zero after a correct reveal; `ENOENT` and aborts stay failures.
- WSL: `wslpath -w` then the Windows `/select,` form, through the same verbatim launcher.
- Desktop Linux: `dbus-send` `org.freedesktop.FileManager1.ShowItems` with a `file:` URI from `pathToFileURL`; on any failure, `xdg-open` the parent directory.

Files and directories share select-in-parent semantics. The explorer injects `revealOsPath` → `ctx.workspaces.revealPath`. The existing portaled row `Menu` gains one entry next to "用系统应用打开" (directories get it after New Folder). Labels are platform-local via `revealOsMenuKey()` from the browser OS (`menu.revealInFinder` / `menu.revealInExplorer` / `menu.revealInFileManager`); the action always runs on the Host. Failures use the same open-notice path as `openPath`.

## Alternatives considered

- **Reuse `host.openPath` with a mode flag.** Rejected: different OS commands and success criteria; a mode would overload an already-documented open contract.
- **Shell-string `/select,"…"` through `cmd /c start`.** Rejected: it buys the same unquoted command line that `windowsVerbatimArguments` gives directly, at the cost of a shell and its escaping rules.
- **Put Host platform on `host.describe` for labels.** Deferred: local GUI browser ≈ host; labels follow `navigator` to avoid widening describe for this change.

## Consequences

- Clients that can open paths can also reveal them through the same `canOpenPath` gate.
- Automated tests mock the runner / inject; they never spawn a real file manager. The verbatim spawn option is asserted where it is chosen, in `dsh-native-command` and in the reveal's default launcher, because no assertion on a mocked argv can show it.
- `host.revealPath` logs each outcome (`info` on success, `warn` with the failure detail). A file manager that raises no window leaves no other trace, so the Host log is what separates a build without the method from a reveal command that ran and did nothing.
