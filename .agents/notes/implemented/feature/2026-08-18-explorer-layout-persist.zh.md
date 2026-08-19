# Agent Note：跨刷新持久化布局面板列宽

Status: implemented

[English](2026-08-18-explorer-layout-persist.md) | 中文

## 问题

对 Web GUI 执行硬刷新（F5 / Ctrl+Shift+R）会重置面板版面：文件树（details）列与文件预览列都回到关闭状态，因此用户每次刷新后都要手动重新打开资源管理器。[资源管理器浏览态持久化](2026-08-18-explorer-browse-persist.md) 已经能恢复展开的文件夹与预览标签路径，但这些状态被 hydrate 进的列，却被布局 store 保持关闭。按 [详情栏会话生命周期决策](../bug-fix/2026-07-29-web-details-session-lifecycle.md)，布局 store 当时是刻意瞬时的，所以刷新总会丢弃面板几何。制作人要求反转这条子决策：刷新必须恢复面板版面。

## 决策

`createLayoutStore` 现在会把三个列宽——`sidebar`、`details`、`preview`（px，`0` 表示关闭）——以键 `dsh.layout.panels.v1` 持久化到 `localStorage`。由视口派生的一对状态（`narrow`、`narrowExpanded`）保持瞬时：AppFrame 会在挂载时依据实时视口重新推导 `narrow`，若持久化它反而会恢复一个过时的断点。

引擎的 `defineStore` persist 会把整个 state 作为一个 JSON 值写入，那样会连视口一对状态一起写盘。与其为单一消费方拓宽共享 store 契约（给 `StoreSpec.persist` 增加 partialize 选项会波及 ui-explorer／ui-workspace／ui-conversation），该工厂改为包裹引擎实例：它只 rehydrate 这三个列宽（防御性地重新 clamp，保留 `0`，忽略非法项），并把一个去重的、仅几何的投影订阅回存储。`clearPersisted` 会删除该键。

**所选语义——持久化「上次显示的几何」。** store 持久化的是当前渲染出来的内容，包括用户手动关闭的列。因此刷新会恢复上次显示的版面。切换 Session／工作区不再自动关闭资源管理器或预览（见[跨工作区全局可用](2026-08-18-explorer-preview-global-workspaces.zh.md)）；用户关闭仍计入上次显示。另一种方案——持久化一份「不受生命周期关闭影响的偏好」——已不再必要。

这部分取代了 [详情栏会话生命周期 note](../bug-fix/2026-07-29-web-details-session-lifecycle.zh.md) 中「刷新回默认」的那一半；该 note 中原先的「切换会话关闭」由全局工作区 note 取代。旧 note 均保持活跃并互相交叉链接。

## 考虑过的替代方案

**用 `defineStore` 的 `persist` 键持久化整个 state。** 否决：引擎会写入整个 `LayoutState`，视口一对状态会落盘，过时的 `narrow`／`narrowExpanded` 可能覆盖实时断点。

**给 store 引擎增加 partialize／键子集选项。** 这是更「地基化」的形态，但 `StoreSpec.persist` 现为裸 `string`，被四个包消费；为单一消费方改动它属于没有第二拥有者的契约扰动。仅几何的包裹层只作用于 ui-layout，且不删除任何共享代码。

**语义 B——持久化一份不被自动关闭影响的面板偏好。** 能保留「切换会话后重新打开资源管理器」，但需要区分用户关闭与生命周期关闭，重复维护关闭原因状态。否决；切换会话自动关闭后来已整段移除（见[跨工作区全局可用](2026-08-18-explorer-preview-global-workspaces.zh.md)），「上次显示」已满足全局能力产品规则。

**按会话持久化几何。** 与生命周期 note 中理由相同而否决：产品希望一份上次显示布局，而非记住每会话宽度表。

## 影响

- 刷新会恢复上次显示的 `sidebar`／`details`／`preview` 列宽与开合状态；用户手动关闭属于「上次显示」，而切换 Session／工作区时已打开的资源管理器与预览列保持打开（见[跨工作区全局可用](2026-08-18-explorer-preview-global-workspaces.zh.md)）。
- 版面与资源管理器树 hydrate 保持连贯：列宽在 store 创建时同步恢复，早于按会话门控的列打开，因此被恢复的列会直接以其保存宽度出现（无「先默认再改宽」的闪烁）。随后资源管理器树把展开文件夹与预览标签 hydrate 进已打开的列，其在标签恢复时调用的 `openPreview()` 与已恢复的预览宽度是幂等的。
- 视口一对状态总是从新开始，因此窄视口的覆盖状态绝不会在切换到宽视口的刷新后残留。
- 拖动写入会持续持久化（去重），与引擎自身的 persist 节奏一致；仅视口变化不会重写几何项。

## 测试

`tests/layout-store.client.spec.ts` 用以下用例替换了原先的「不持久化」用例：几何写入 + rehydrate 到新实例、视口一对状态从不出现在存储中、用户关闭被持久化为关闭列、过时宽度重新 clamp／非法项忽略，以及 `clearPersisted`。`tests/app-frame.client.spec.tsx` 在 `beforeEach` 清空 `localStorage`，使每次挂载都从约定默认值开始，并断言切换 Session 后侧栏仍打开。ui-layout 与 ui-explorer 两套用例均通过。
