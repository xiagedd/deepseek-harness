# Agent Note: 资源管理器搜索保留浏览状态

Status: implemented

[English](2026-08-18-explorer-search-overlay-state.md) | 中文

## Problem

在资源管理器里搜索会重置被打断的浏览状态：清空搜索词后，用户先前展开的目录全部折叠，视口回到顶部。面板把文件树与搜索结果渲染成同一个条件表达式的两个分支，因此只要搜索词非空，`react-arborist` 的 `Tree` 就会被卸载。React 状态本身在卸载中存活——`expanded`、`selected` 与 `dsh.explorer.tree.v1` 持久化都没有被写空——但树自身的展开映射会按 `initialOpenState`（只有工作区根目录）重建，虚拟滚动容器也重新挂载在偏移 0。同一个条件表达式还会在类型筛选无匹配时卸载文件树。

## Decision

搜索结果与「该类型无匹配」文案都是叠加层。只要存在工作区 `cwd`，文件树宿主就始终渲染，并在叠加层出现时带上 `hidden`，因此 `react-arborist` 在整个搜索往返中保留展开映射与已渲染行。隐藏元素会销毁其盒子并把滚动容器的 `scrollTop` 清零，而 `react-window` 仍认为自己渲染在旧偏移上，因此面板记录文件树可见时 `onScroll` 报告的最后偏移，并在叠加层消失时于 layout effect 中写回 `TreeApi.listEl`。仍在等待滚动的 reveal 优先于该恢复：文件树隐藏期间 reveal effect 跳过滚动（并保持其锁未置位），等文件树回来后再把目标行滚入视野。

## Alternatives considered

**每次重挂载后用 `expanded` 重建 arborist 的展开映射。** 拒绝：这是在重建本不该被销毁的状态，而且完全无法恢复滚动偏移。

**用 `TreeApi.scrollToOffset` 做恢复。** 拒绝：`react-window` 会丢弃目标等于其 state 中现有偏移的 `scrollTo`，而这正是隐藏之后的失同步情形——state 保留旧偏移，DOM 却停在 0。

**用绝对定位覆盖而非 `hidden`。** 拒绝：被覆盖的文件树仍留在无障碍树与键盘顺序中，且在高度不同的叠加层下调整尺寸会重新走进本修复所规避的 resize 路径。

## Consequences

进入搜索保留展开集合、选中项与滚动位置，清空搜索后回到原处。点击结果仍是用户主动操作：目录结果清空搜索词并定位自身，文件结果打开预览标签，两者都会按需展开祖先目录。文件树现在在隐藏期间仍保持挂载，因此其 `ResizeObserver` 跨搜索轮次持续观察存活的宿主元素而非已脱离文档的旧元素，后台目录列举也继续落在用户暂时看不到的树上。
