# Agent Note: Composer reference chip shows its basename and its × answers pointer state

Status: implemented

[English](2026-08-18-input-chip-basename-and-remove-feedback.md) | 中文

## Problem

输入条引用芯片（`ui-conversation` 的 `InputBar` 背景层）上有两个缺陷：

1. **标签不可读。** 芯片单元格固定为 4em——它必须等于文本域中 U+FFFC 占位符的步进宽度，否则其后的每个字形都会漂移。`.chipLabel` 曾把完整的工作区相对路径居中（`justify-content: center`）并在两端裁切且无省略号，于是像 `Assets/script/Logic/Activity/CFishingExpertSetActivity.cs` 这样的长路径只显示出无意义的中段 `ctivity/C`——既没有文件名，也没有省略号提示。
2. **× 无指针反馈。** 移除控件位于 `.backdrop` 内，而背景层是 `pointer-events: none`。按钮从未覆盖这一点，所以尽管它绘制在文本域之上（`z-index: 1`），指针事件仍穿透落到文本域：真实光标下 `:hover`、`:active` 与它自己的 `onClick` 都不触发，只有 InputBar 的 `pointerdown` 命中测试能移除芯片。结果是一个毫无悬停或按下反馈、感觉「死」的 ×。

## Decision

**标签——显示 basename，其余省略，完整路径放在 title。** `input/decorations.ts` 中新增纯函数 `chipDisplayLabel(label)`，把标签归约为 basename（兼容 posix 与 windows 分隔符；无分隔符的子智能体/技能 token 原样返回）。`.chipLabel` 现为左对齐单行块，配合较小字号与 `text-overflow: ellipsis`，使名称可识别的开头保持可见，任何溢出都以可见省略号收尾。芯片的 `title` 与机器 occurrence 仍携带完整标签。相对于 `direction: rtl`（会不可预期地重排双向中性的路径标点，且只保留尾部）与 JS 中段省略（4em 单元格约容纳 8 个字形，CSS 仍会再次裁切其结果；名称开头比裸露的 `….cs` 更能区分文件，扩展名由 tooltip 承载），选择了当前方案。

**×——让控件自己响应指针。** `.chipRemove` 设置 `pointer-events: auto`（在惰性背景层内重新启用事件），因其本就绘制在文本域之上，遂在自身矩形内成为指针目标：`:hover` 与 `:active`（轻微缩放）得以生效，原生 `onClick` 得以触发。文本域上的 InputBar `pointerdown` 命中测试保留为周边单元格的兜底。命中区域增至 18px（与 AttachmentRail 一致，落在 16–20px 目标内），而芯片固定的 4em 单元格不变。反馈 token 对齐相邻的对比圆形控件：悬停/按下用 `--dsw-alias-interactive-bg-hover-solid`，`focus-visible` 用 `--dsw-alias-state-business-primary` 描边环。

× 保持 `tabIndex={-1}`：它位于文本域的 `aria-hidden` 视觉镜像中，因此是指针可用性入口而非 Tab 停靠点；键盘用户通过在其占位符上按 Backspace/Delete 移除芯片（原生单字符原子删除，未改）。`aria-label` 读作「移除引用 <basename>」，与可见单元格保持一致。

## Alternatives considered

**加宽芯片单元格以容纳整个名称。** 单元格步进宽度绑定于文本域中单个 U+FFFC 字形（一个 occurrence = 一个占位符字符），加宽意味着缩放内嵌字体并放大该草稿中的所有芯片。此处否决——在固定单元格内 basename + tooltip 已能读出文件。后续改动确实通过分档单元格阶梯逐草稿、逐档加宽了单元格（[阶梯与度量](2026-08-18-composer-chip-cell-metrics.zh.md)）；pill 显示什么仍由本 Note 的 basename 规则决定。

**用 `tabIndex={0}` 把 × 变成真正的 Tab 停靠点。** 背景层是 `aria-hidden`；在隐藏子树内放置可聚焦控件属可访问性反模式，且每个芯片都会新增一个与「以文本域为中心」的焦点模型相冲突的 Tab 停靠点。键盘移除已可经 Backspace/Delete 完成。否决。

## Consequences

- 长路径芯片显示其 basename（`CFishingExpertSetActivity.cs`），仅当 basename 本身也溢出单元格时才以可见省略号截断；完整路径在 `title` 上。
- 悬停 × 会着色，按下会缩放，点击经按钮自身的处理器移除芯片；文本域命中测试保留为兜底。
- 该变更仅涉及呈现：草稿、occurrence 表、剪贴板投影以及模型所见的一切均未改动，因此不产生会话事件或快照变化。

## Testing

`tests/input-machine.client.spec.ts` 对 `chipDisplayLabel` 做单元测试（深路径 → basename、windows 分隔符、无分隔符 token、以分隔符结尾的兜底）。`tests/input-bar.client.spec.tsx` 断言长路径芯片渲染出 basename 且完整路径在 `title`/`aria-label` 上，既有的拖放芯片用例现在期望 basename 单元格加完整路径 title。两个 spec 为绿（166 个测试）；包的 `tsc -b` 与包 bundle（无额外 `.cjs` 分片、`client.js` 内相对 `require("./` 命中为 0）均通过。
