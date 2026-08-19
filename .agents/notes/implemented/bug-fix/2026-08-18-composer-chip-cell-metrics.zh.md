# Agent Note: Composer 芯片单元格阶梯锁定垂直字体度量

Status: implemented

[English](2026-08-18-composer-chip-cell-metrics.md) | 中文

## 问题

用来撑宽 chip U+FFFC 占位符的分档单元格字体，反而破了它要撑宽的 chip：pill 画成一个空的圆角块，文件名看不见，背景只覆盖了字形真正落点的一条带。

`size-adjust` 会缩放这一 face 的全部度量，ascent 与 descent 也在内，而不只是阶梯想要的字形推进宽。Composer 把分档 face 放在 `.input`、`.mirror`、`.backdrop` 的字体栈首位，于是在第 N 档时三层里每个行内盒的 content area 都变成 N em 高，而行盒仍是 38px。content area 决定基线在行盒里的位置（基线以上空间 = 半行距 + ascent），因此字形被画低了 0.3 × N em：在 Chromium 中实测一个 19 字符 basename（当时为第 3 档），`.chipLabel` 自身的行内盒有 42px 高，却装在 22px 的 `overflow: hidden` 裁切盒里，名字几乎被完全裁掉，chip 之后的普通草稿文本也落到三层 42px 高度之外。pill 本身居中是正确的——它在行内包含块里的 `top: 50%` 恰好抵消了这次膨胀——这正是浅蓝圆角块看起来只覆盖文字"一半"的原因：它覆盖的是文字本该占据的那一行，而文字沉到了它下面。

## 决策

**逐 face 锁定垂直度量，`size-adjust` 只负责推进宽。** 每个 `DshChipCellN` face 都按自身缩放倍数相除后声明 `ascent-override`、`descent-override`、`line-gap-override`，因此每一档实际生效的度量都是 ascent 0.8em / descent 0.2em——一个 em 的 content area——而 U+FFFC 推进宽照旧缩放。这些 override 与字形轮廓走同一个乘数（实测：`size-adjust: 300%` 配 `ascent-override: 80%` 在 16px 下得到 48px content area，配 `26.667%` 得到 16px），所以相除才能让度量恒定。

**芯片 label 直接指定 app 字体族。** `.chipLabel` 不承载占位符，单元格 face 只会把自己的度量借给它；`font-family: var(--dsw-font-family)` 让 label 字形即使在忽略度量 override 的引擎上也留在 pill 内。

**阶梯改为 2em 一档（4em … 26em，十二个 face），不再是 4em 单元格。** `chipCellEm(step)` 独占这套算术，`chipCellStep` 选取能容纳草稿中最宽 label 的最窄一档，把 pill 之后残留的透明余量减半。一个草稿仍只跑一档：textarea 无法给两个 U+FFFC 两种推进宽，所以多 chip 草稿跟随其中最宽的 label。

## 考虑过的替代

- **逐档生成把推进宽烧进 `hmtx` 的字体。** 能彻底消掉描述符之间的相互作用，但会把一份经过审计的 blob 换成十二份手工改过、又没有生成器可复现的 blob。否决：override 百分比写在样式表里且有测试断言，blob 做不到。
- **在 DOM 里实测每个 pill 再写回宽度。** 精确宽度需要一个隐藏的不受 `max-width` 约束的量取元素、一次布局期读取、以及每次草稿编辑后的重渲染，而且最终仍要量化到某一档。本次修复否决：pill 已按内容定宽，残留的是透明余量，不是可见色块。
- **label 继续沿用三层字体栈，只锁定度量。** 一旦某个引擎忽略 override，所有 label 会再次被裁。否决：label 没有理由继承一个只为占位符存在的 face。

## 后果

- 芯片显示完整 basename，在 32px pill 中垂直居中，上下各留 5px；× 保持居中，hover 与按压反馈不变。
- 单元格推进宽为 `2(step + 1)` em：短名占 4–6em 单元格，而不是整跳一个 4em 档；超过 26em 的名字在 pill 内省略，完整路径仍在 chip title 上。
- 光标对齐由构造保证不变：三层共享同一字体族、同一推进宽，现在还共享同一 content area，因此 backdrop 的字形串与 mirror 的逐像素一致。
- 纯表现层改动——草稿文本、occurrence 表、剪贴板投影以及模型可见的一切都未触动，没有 session 事件或快照变化。

## 测试

`tests/chip-cell-ladder.client.spec.ts`（6 个测试）覆盖档位算术，并为实现它的样式表设闸：每档都声明一个缩放倍数等于其推进宽的 face，每档 `ascent-override × size-adjust` 为 80%、`descent-override × size-adjust` 为 20%，每档都绑定自己的字体族，且 `.chipLabel` 指定 app 字体族。`tests/input-bar.client.spec.tsx` 保持渲染、删除与 reveal 行为为绿（与阶梯 spec 合计 92 个测试；包内 451 个中 449 通过，两个 `gate-branch-tails` 失败为既有）。

盒模型正确性通过在无头 Chromium 中渲染真实样式表验证（既测源码样式表，也测 bundle 实际发出的、类名已哈希的版本），覆盖短名、长名、CJK、超长、双 chip 与软换行草稿，断言：chip 行内盒恰为一个 em、pill 中心落在行中心、label 墨迹同时落在 pill 与其裁切盒内、× 居中、占位符推进宽等于该档、backdrop 尾部文本串与 mirror 的起点一致。
