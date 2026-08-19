# Agent Note: 资源管理器与 CM6 预览对所有工作区全局可用

Status: implemented

[English](2026-08-18-explorer-preview-global-workspaces.md) | 中文

## Problem

在某个 Session 打开文件树（details）或 CM6 文本预览后，这两列看起来像绑在该工作区上：再选另一个 Session／工作区会在绘制前关掉两列，布局持久化又把关闭宽度写回去，于是下一个工作区像是没有资源管理器和预览，直到用户再手动打开。插件注册、Host 的 `listEntries`／`searchEntries`／`readText`／`revealPath`，以及 web-app cordis 里的 `ui-explorer` 行本来就是账户级的——断点是 AppFrame 在 Session 切换时强制关闭，而不是某个 cwd 缺能力。

## Decision

**语义 A——能力全局；浏览态仍按工作区隔离。** 任意当前 Session（含 blank）都可打开 details 与 preview。切换 Session 或工作区不再调用 `closeDetails`／`closePreview`。`ExplorerPanel` 本就会改绑到新会话 cwd，并从按 cwd 分桶的 `dsh.explorer.tree.v1` 重水合展开／预览标签路径；Host RPC 仍按路径作用，没有单一 workspaceId 门控。布局几何仍是一份根作用域的「上次显示」偏好（不按 cwd 分桶）。首页（无当前 Session）仍把这两列渲染宽度派生为零。

本决策部分取代 [详情栏会话生命周期 note](../bug-fix/2026-07-29-web-details-session-lifecycle.md) 中「切换会话即关闭」的一半，以及 [布局面板列宽持久化](2026-08-18-explorer-layout-persist.md) 中的对应表述。语义 B（所有 cwd 共享一份展开／标签表）否决——会串台。

## Alternatives considered

**保留切换即关闭，让用户自己再开。** 否决：制作人要的是每个工作区都有功能，而不是每次切换后再点一次。

**按工作区 cwd 分别持久化开合。** 回到某 cwd 时可恢复上次宽度，但新工作区首次仍会关掉列，并多一张几何表。否决——保留一份上次显示布局，且切换时绝不自动关。

**跨工作区共享展开／预览标签态（语义 B）。** 否决：两个项目会争用同一展开集与标签列表。

## Consequences

- 打开资源管理器或预览一次后，切换工作区列保持打开，并显示该工作区的树／标签。
- 用户手动关闭仍作为上次显示的版面持久化，并在刷新后恢复。
- 陈旧预览正文不泄漏：cwd effect 会清空实时预览 store，只重载新桶中的路径。
- 工具选中时的 `openDetails` 与标题栏「文件」动作不变。

## Testing

`packages/client/ui-layout/tests/app-frame.client.spec.tsx` 断言 Session id 变化后两侧轨道仍打开。`packages/client/ui-explorer/tests/browser-plugin.client.spec.ts` 断言在同一次插件注册下，list／read／preview inject 面对不同 cwd 路径均可用。改完后跑 ui-layout 与 ui-explorer 的 client 套件。
