# Agent Note: 资源管理器右键「在文件管理器中显示」

Status: implemented

[English](2026-08-18-explorer-reveal-in-file-manager.md) | 中文

## 问题

用系统默认应用打开路径（`host.openPath`）不会在资源管理器 / Finder 里选中该文件。Unity 的「Show in Explorer」与 VS Code 的「Reveal in File Explorer」会打开所在文件夹并高亮目标，便于在磁盘上定位。

## 决策

在 `host.openPath` 旁新增 `host.revealPath`：同一特权信任围栏、同一 AbortSignal 生命周期，应答 `{ revealed: true }`。原生助手 `revealNativePath` 分发：

- macOS：`open -R <path>`
- Windows：`explorer.exe /select,<path>` 作为单个 argv（逗号后无空格），经 `launchNativeCommandVerbatim` 启动，使命令行不加引号地抵达 Explorer。Node 常规的 argv 引号处理会把含空格的整个 token 包进双引号，Explorer 便识别不出该开关、根本不弹窗——而 spawn 本身仍成功，Host 侧观察不到任何失败。`windowsSelectPath` 先把分隔符规整为反斜杠并去掉末尾分隔符（裸盘符或 UNC 根保留，因为没有可选中的条目）。数值退出码视为成功——explorer 常在正确 reveal 后仍非 0；`ENOENT` 与 abort 仍是失败。
- WSL：`wslpath -w` 后走 Windows `/select,`，用同一个 verbatim 启动器。
- 桌面 Linux：`dbus-send` 调用 `org.freedesktop.FileManager1.ShowItems`（`pathToFileURL` 的 `file:` URI）；失败则 `xdg-open` 父目录。

文件与目录共用「在父级中选中」语义。explorer inject `revealOsPath` → `ctx.workspaces.revealPath`。既有 portal 行菜单在「用系统应用打开」旁增加一项（目录放在「新建文件夹」之后）。文案经 `revealOsMenuKey()` 按浏览器 OS 选 `menu.revealInFinder` / `menu.revealInExplorer` / `menu.revealInFileManager`；动作仍在 Host 执行。失败走与 `openPath` 相同的 notice。

## 考虑过的替代

- **给 `host.openPath` 加 mode。** 否决：命令与成功判据不同，会污染已文档化的 open 契约。
- **用 `cmd /c start` 拼 shell 字符串 `/select,"…"`。** 否决：它换来的正是 `windowsVerbatimArguments` 直接给出的那条无引号命令行，却额外背上一个 shell 及其转义规则。
- **把 Host platform 放进 `host.describe` 做文案。** 延后：本地 GUI 浏览器 ≈ host；本改动用 `navigator` 选文案，避免扩 describe。

## 后果

- 能 open 的部署也能 reveal，共用 `canOpenPath` 门闩。
- 自动化测试 mock runner / inject，从不真的拉起系统文件管理器。verbatim spawn 选项在其被选定处断言——`dsh-native-command` 与 reveal 的默认启动器——因为对 mock argv 的任何断言都显示不出它。
- `host.revealPath` 对两种结局都写日志（成功 `info`，失败 `warn` 带失败详情）。不弹窗的文件管理器不留下任何其他痕迹，因此 Host 日志正是区分「这个构建没有该方法」与「reveal 命令跑了但什么都没做」的依据。
