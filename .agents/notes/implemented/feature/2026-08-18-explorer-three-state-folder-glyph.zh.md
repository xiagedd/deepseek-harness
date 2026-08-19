# Agent Note: The explorer folder glyph has three states driven by a background emptiness probe

Status: implemented

[English](2026-08-18-explorer-three-state-folder-glyph.md) | 中文

## Problem

资源管理器里折叠的文件夹，无论有没有子项，看起来都一样，只有展开才知道是否为空。制作人希望图标在点击前就能表达这一事实。难点在于：要在不为每一行做同步 `host.listEntries` 的前提下判断未展开文件夹是否为空——否则每次渲染都会阻塞整棵树。

## Decision

文件夹图标有三种状态，都在 `explorer-icons.tsx` 中以与文件类型图标一致的折角纸风格绘制（`currentColor`、`strokeWidth="1.15"`、圆角连接、`viewBox="0 0 16 16"`）：有可见子项时为实心文件夹，为空时为描边文件夹，展开时为打开态文件夹。`ExplorerGlyph` 把 `kind === 'folderEmpty'` 映射到描边，把 `kind === 'folder'` 按 `open` 标志映射到打开/实心。这三个文件夹图标改为本包本地拥有，不再从 `dsh-client-ui-primitives` 导入，使三态区分集中在一个文件里。

折叠且可见文件夹的空态判定来自客户端后台探测（通道 (c)），既不用 host 索引也不改 RPC。`ExplorerPanel` 维护一个独立于 `dirs` 展开状态的 `probed` 缓存（`Record<string, readonly FsEntry[]>`）。一个 effect 遍历可见树顺序，对每个既未列举（`dirs`）、又未探测过、也不在进行中的可见目录，发起一次可中止的 `host.listEntries`；结果只喂给图标。在探测返回前——或探测失败时——图标保持实心这一保守默认，因此不会闪烁。搜索模式下跳过探测；刷新、发生变更、切换工作区时清空缓存。

图标空态由新增的 `ExplorerTreeNode.iconEmpty` 字段承载，与结构性的 `empty`（已列举且零可见子项的目录）区分开。`empty` 仍驱动 `aria-expanded` 与空文件夹提示；`iconEmpty` 只驱动图标。这样 `dirs` 的语义——「用户是否展开过它」——保持不变，因此探测不影响选择、重命名、粘贴、拖拽行为。

`.meta` 隐藏与 ignore 规则不变：探测复用同一条列举路径，所以只含隐藏项的文件夹读出来就是空，与展开所见一致。

## Alternatives considered

**Host 侧懒索引（`search-entries.ts`）。** 模糊索引已经全量 walk 工作区，可从中派生「是否有可见子项」位。否决：它的 ignore/`.meta` 过滤是为搜索调的，与资源管理器逐次列举的规则并非一一对应，图标可能与展开所见不一致；而且会把图标耦合到为另一功能构建的索引上。

**扩展 host RPC（`FsEntry.hasChildren` / `childCount`）。** 长期最干净的信号，也能省去探测调用，但要改整条链路（`host.ts`、`host.schema.ts`、`rpc-map.ts`、`fetch/client.ts`、`fetch/handler.ts`、`api-proxy.ts）以及所有 fixture 和 fake-api，为一个纯外观图标冒险动 384 全绿的 apiproxy 基线。暂缓，并记为退役探测的方式（README 已知限制）。

**从父层 `listEntries` 派生空态。** 父层列举只说明子项是目录，不说明该子目录自己是否有可见子项，因此不做第二次列举就无法回答。那其实就是探测，只是没缓存。

**把探测结果写进 `dirs`。** 最初的做法。它让「已探测但未展开」的文件夹看起来像「已列举」，破坏了选择/重命名/粘贴/拖拽依赖的用户展开不变量，还耗尽了按次计数的测试 mock。改用独立的 `probed` 缓存与 `iconEmpty` 字段后否决。

## Consequences

- 折叠文件夹在用户展开前就显示实心或描边；因为未知回退到实心，状态稳定不闪烁。
- 图标代价是每个可见折叠目录一次后台 `host.listEntries`，缓存至刷新或发生变更。宽树上比以前多出一些列举；host 的 `hasChildren` 字段可将其移除。
- `dirs` 仍只表示用户驱动的展开，因此没有任何结构性交互（选择、重命名、粘贴、拖拽、空叶提示）发生改变。
- 资源管理器不再从 `dsh-client-ui-primitives` 导入文件夹图标；三个文件夹图标本地拥有。

## Testing

`tests/explorer-icons.client.spec.tsx` 断言三个文件夹 SVG 在视觉上互不相同（fill 属性、path 数量），并断言 `ExplorerGlyph` 对 `folderEmpty` 渲染描边、对 `folder` 按开合渲染打开/实心。`tests/explorer-panel.client.spec.tsx` 断言未展开的非空文件夹为实心，空文件夹在其探测返回后变为描边图标，已展开文件夹为打开态，而探测仍挂起的文件夹保持实心。两个 spec 均绿；改动包的 `test:gui` 数量除新增用例外不变。
