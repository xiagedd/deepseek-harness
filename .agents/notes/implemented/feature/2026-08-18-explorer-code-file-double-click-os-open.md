# Agent Note: Explorer double-click hands a code file, and the root solution, to the OS

Status: implemented

English | [中文](2026-08-18-explorer-code-file-double-click-os-open.zh.md)

## Problem

In the explorer tree a click on a file only opened the in-page CodeMirror preview, and the OS handoff sat behind the row context menu ("用系统应用打开"). A Unity developer reaches for a different reflex: double-clicking a script in the Unity Project window opens Visual Studio on the project's solution with that file in front. Reading a `.cs` file in the web preview is not that gesture, and discovering the context-menu entry is not either.

## Decision

Double-clicking a code-file row in `ExplorerPanel` hands the file to the Host OS default application through the existing `host.openPath` seam (`ExplorerInjected.openPath` → `ctx.workspaces.openPath`), and, when the workspace root's listing shows a solution file, hands that solution over as well. "Code file" is the same `isCodeName` predicate the 代码 type filter uses (`.cs`, `.ts`, `.tsx`, `.js`, `.jsx`, `.c`, `.h`, `.cpp`, `.hpp`, `.py`, `.go`, `.rs`, `.java`), so the tree needs no second extension table. No Visual Studio path, product name, or launcher argument is hardcoded: what makes `.cs` land in Visual Studio is the Windows file association the platform opener already uses.

`workspaceSolution(root, dirs)` is a pure read of the root listing the tree already holds, so the gesture costs no extra Host call. A solution named after the workspace root (`<ProjectName>.sln`, what Unity writes beside `Assets/`) wins; otherwise the first `.sln` in name order keeps the pick deterministic. An unlisted, still-loading, or failed root simply has no solution, and the file is then handed over alone.

The file is handed over **before** the solution. A cold editor takes the file, owns a single window, and the solution request that follows joins that instance; opening the solution first races an instance that has not registered yet, which on Windows tends to produce a second window holding only the loose file.

Click and double-click are separated by `event.detail` on the row click, not by a second `dblclick` listener: `detail` counts the clicks of one sequence, so the first click keeps opening the preview and the second one takes the OS handoff instead of repeating the `host.readText` read. A double-clicked folder keeps its per-click expand/collapse toggle and never reaches the opener. A double-clicked non-code file does nothing beyond the preview the first click already opened. Failures use the existing open notice: a rejected `openPath` shows the Host message, and a deployment with `canOpenPath === false` shows the unavailable copy instead of silently doing nothing.

## Alternatives considered

**Open only the solution.** Closest to the literal request ("打开当前的 vs 工程"), but it drops the file the user pointed at, which is the whole point of the gesture in Unity. Rejected.

**Open only the file.** One command, no ordering question, but a `.cs` opened standalone lands in Visual Studio as a miscellaneous file with no project context — the "工程" half of the ask is missing whenever the editor is cold. Rejected.

**A dedicated `dblclick` listener.** Would need the click path to suppress its own second preview read anyway, leaving two mechanisms for one gesture. `event.detail` is one.

**A new Host RPC that launches an editor with `<solution> <file>` arguments.** The faithful way to reproduce Unity's single launch, and the only way to also jump to a line. It means a new capability seam, a new privileged command surface, and editor-specific argument knowledge in the Host. Deferred: two association-driven `openPath` calls need no new wire surface.

**Extend the gesture to the fuzzy-search result rows.** The search list is a jump-to affordance whose click reveals and previews; the tree is the surface with Unity parity. Left out deliberately to keep one code path for the handoff.

## Consequences

- Double-clicking `Assets/**/Foo.cs` in a Unity workspace opens the script in the associated editor and loads the root solution behind it.
- Single click behavior is unchanged: preview read, reveal highlight, selection.
- Non-code files and folders keep their existing double-click behavior, and the second click no longer issues a duplicate preview read for any file.
- The context-menu "用系统应用打开" entry still works for every file, including non-code ones.

## Risks

- The handoff is two OS launches, so an editor that opens each request in its own window shows two windows; the file-first order is what keeps the common cold-start case to one.
- Nothing locates the file inside the solution, and no caret line is passed; the editor decides what to focus.
- `.cs` associated with something other than Visual Studio (a plain text editor, for example) opens there while the solution still goes to Visual Studio. The association is the user's, not the harness's.
- Chat tool rows use the same `host.openPath` RPC and inherit its host limits ([tool-call file open in OS](2026-07-28-tool-call-file-open-in-os.md)).

## Testing

`tests/explorer-panel.client.spec.tsx`: `workspaceSolution` unit cases (root-named winner, name-order fallback, directory named `*.sln` excluded, no root / unlisted root / loading root); a double-clicked `.cs` calls `openPath` with the file then the root solution while a single click only reads the preview; a double-clicked non-code file and a double-clicked folder call nothing; a rejected handoff surfaces the Host message; a `canOpenPath === false` deployment calls nothing and shows the unavailable copy. The package suite is green (13 files, 126 tests), and `pnpm --filter @deepseek-ai/dsh-client-ui-explorer bundle` emits one unsharded `lib/client.js`.
