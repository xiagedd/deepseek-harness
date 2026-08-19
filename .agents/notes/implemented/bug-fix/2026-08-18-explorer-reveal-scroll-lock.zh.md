# Agent Note: Explorer reveal scrolls only until its target row exists

Status: implemented

[English](2026-08-18-explorer-reveal-scroll-lock.md) | 中文

## Problem

在资源管理器展开文件夹时，视口有时会被向上拉，把刚点击的行挤出视野。reveal effect 会在每次 `dirs` 变化时重跑，并朝当前 reveal 目标再次发起 `scrollIntoView` / `treeApi.scrollTo(activeReveal)`。由于展开文件夹——以及空态探测返回后的后台列举——都会修改 `dirs`，effect 会再次触发，滚回一个位于用户刚点击行上方的旧 reveal 目标。滚动发生在布局之后，于是被点击的行明显跳走。

## Decision

reveal effect 只在目标行尚未出现在可见顺序中时滚动定位，随后加锁。`ExplorerPanel` 维护一个 `scrolledReveal` ref：一旦 `activeReveal` 出现在 `visibleTreeOrder` 中，effect 记录它并停止对同一路径的重复滚动。新的 reveal（不同的 `activeReveal`）会清锁并再滚动一次；清空 `activeReveal` 会重置该 ref。`scrollIntoView` 保持 `block: 'nearest'`，因此首次 reveal 不会过度居中。这样之后的 `dirs` 变化——用户展开或探测结果——不再把视口重新锚到已解析的 reveal，被点击的文件夹保持原位，子项向下展开。

## Alternatives considered

**从 effect 依赖列表里去掉 `dirs`。** 能止住重跑，但 effect 确实需要 `dirs`：首次 reveal 一个深路径时，必须等祖先列举后目标行才存在。去掉依赖会破坏对尚未列举路径的 reveal。锁保留依赖，只把「解析后重复」变成空操作。

**把 `scrollIntoView` 改成 `block: 'start'` 或 `'center'`。** 改变目标落点但不触及根因：下一次 `dirs` 变化时 effect 仍会滚回旧目标，只是偏移不同。作为治标否决。

**阻止探测触碰 `dirs`。** 探测已经写入独立的 `probed` 缓存而非 `dirs`，所以它本身不会经由 `dirs` 重触发 effect。但普通的用户展开仍会修改 `dirs`，因此 reveal effect 无论如何都需要自己的锁；探测解耦是必要但不充分的。

## Consequences

- 展开文件夹时被点击行保持在视野内；子项在其下方展开。
- 对深层、尚未列举的路径首次 reveal 仍然有效，因为锁只在目标行存在后才生效。
- 锁按 reveal 目标区分：发起新的 reveal 会再次滚动，因此预览/`@` 芯片的 reveal 不受影响。

## Testing

`tests/explorer-panel.client.spec.tsx` 监视 `HTMLElement.prototype.scrollIntoView`：断言一次 reveal 滚动一次，随后展开无关文件夹不再滚动。该 spec 为绿。
