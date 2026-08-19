# Agent Note: Explorer double-click hands a code file, and the root solution, to the OS

Status: implemented

[English](2026-08-18-explorer-code-file-double-click-os-open.md) | 中文

## Problem

在资源管理器树里单击文件只打开页内 CodeMirror 预览，把文件交给操作系统则藏在行右键菜单（「用系统应用打开」）里。Unity 开发者的肌肉记忆是另一套：在 Unity Project 窗口双击脚本，会用 Visual Studio 打开该工程的解决方案并把这个文件摆到眼前。在网页预览里读 `.cs` 不是这个手势，让人去翻右键菜单也不是。

## Decision

在 `ExplorerPanel` 里双击代码文件行，经既有的 `host.openPath` 缝（`ExplorerInjected.openPath` → `ctx.workspaces.openPath`）把文件交给 Host 操作系统的默认应用；若工作区根的列举里有解决方案文件，再把该解决方案一并交出。「代码文件」沿用「代码」类型过滤的同一个 `isCodeName` 判定（`.cs`、`.ts`、`.tsx`、`.js`、`.jsx`、`.c`、`.h`、`.cpp`、`.hpp`、`.py`、`.go`、`.rs`、`.java`），树因此不需要第二份扩展名表。Visual Studio 的安装路径、产品名与启动参数一概不硬编码：让 `.cs` 落到 Visual Studio 的是平台 opener 本就使用的 Windows 文件关联。

`workspaceSolution(root, dirs)` 是对树已持有的根列举做的纯读取，因此这个手势不额外增加 Host 调用。与工作区根同名的解决方案（`<ProjectName>.sln`，Unity 写在 `Assets/` 旁边的那个）优先；否则取名称序第一个，使选择确定。根尚未列举、仍在加载或列举失败时就当作没有解决方案，此时只交出文件。

**先交文件、后交解决方案。** 冷启动的编辑器接住文件后只占一个窗口，随后的解决方案请求落进同一实例；反过来先交解决方案，会与尚未注册完成的实例抢跑，在 Windows 上往往多出一个只装着孤立文件的窗口。

单击与双击靠行 click 上的 `event.detail` 区分，而不是另加 `dblclick` 监听：`detail` 记录同一次点击序列的次数，因此第一次点击照旧打开预览，第二次改走 OS 交接而不是重复一次 `host.readText`。双击文件夹保持逐次点击的展开/折叠，永不触达 opener。双击非代码文件除第一次点击已打开的预览之外不做任何事。失败沿用既有的 open 提示：`openPath` 被拒时显示 Host 原文，`canOpenPath === false` 的部署显示不可用文案，而不是静默无反应。

## Alternatives considered

**只打开解决方案。** 最贴字面要求（「打开当前的 vs 工程」），但丢掉了用户指的那个文件，而这正是 Unity 手势的核心。否决。

**只打开文件。** 一条命令、没有顺序问题，但单独打开的 `.cs` 在 Visual Studio 里是杂项文件，没有工程上下文——编辑器冷启动时「工程」这一半就丢了。否决。

**单独加 `dblclick` 监听。** click 路径无论如何都要抑制自己的第二次预览读取，于是一个手势要两套机制。`event.detail` 只需一套。

**新增一个用 `<solution> <file>` 参数启动编辑器的 Host RPC。** 这才是忠实复刻 Unity 单次启动的做法，也是唯一能定位到行的做法。但它意味着新的能力缝、新的特权命令面，以及把编辑器参数知识放进 Host。暂缓：两次依赖关联的 `openPath` 不需要任何新的 wire 面。

**把这个手势扩展到模糊搜索结果行。** 搜索列表是「跳过去」的入口，其点击负责 reveal 与预览；与 Unity 对齐的是树。刻意不做，让交接只有一条代码路径。

## Consequences

- 在 Unity 工作区双击 `Assets/**/Foo.cs`，脚本在关联编辑器里打开，根解决方案在其后加载。
- 单击行为不变：预览读取、reveal 高亮、选中。
- 非代码文件与文件夹的双击行为不变，且任何文件的第二次点击都不再触发重复的预览读取。
- 右键菜单「用系统应用打开」对所有文件（包括非代码文件）仍然有效。

## Risks

- 交接是两次 OS 启动，因此把每个请求都开新窗口的编辑器会出现两个窗口；先交文件的顺序正是为了让常见的冷启动只剩一个。
- 没有任何机制在解决方案里定位该文件，也不传行号；聚焦到哪里由编辑器决定。
- 若 `.cs` 关联到 Visual Studio 之外的程序（例如纯文本编辑器），文件会在那里打开，而解决方案仍去 Visual Studio。关联属于用户，不属于 harness。
- 聊天工具行使用同一个 `host.openPath` RPC，并继承其宿主限制（[tool-call file open in OS](2026-07-28-tool-call-file-open-in-os.md)）。

## Testing

`tests/explorer-panel.client.spec.tsx`：`workspaceSolution` 单元用例（同名者胜出、名称序回退、名为 `*.sln` 的目录被排除、无根/未列举根/加载中根）；双击 `.cs` 依次以文件和根解决方案调用 `openPath`，而单击只读预览；双击非代码文件与双击文件夹都不调用；被拒的交接露出 Host 原文；`canOpenPath === false` 的部署不调用并显示不可用文案。该包测试全绿（13 个文件、126 个用例），`pnpm --filter @deepseek-ai/dsh-client-ui-explorer bundle` 产出单一未分片的 `lib/client.js`。
