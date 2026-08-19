# Agent Note: Composer 芯片点击定位文件与可选行范围

Status: implemented

[English](2026-08-18-composer-chip-reveal-and-line-jump.md) | 中文

## 问题

Composer 里的 workspace-file 芯片在固定 4em U+FFFC 单元格中截断 basename；点击芯片无法跳到资源管理器，也无法把 Ctrl+L 带的行范围滚到预览里。

## 决策

**宽度。** 每个草稿用 `chipCellStep` 按最宽 chip label 选一档单元格；`DshChipCell*` 字体族用 `size-adjust` 缩放 U+FFFC 推进宽，并把垂直度量锁回一个 em（[阶梯与度量](../bug-fix/2026-08-18-composer-chip-cell-metrics.zh.md)）。可见 pill 绝对定位在透明单元格内并以 `max-width: 100%` 裁切。否决按 chip 调 letter-spacing 与多占位符方案：textarea 无法给两个 U+FFFC 两种推进宽。

**定位。** 可选 Cordis 服务 `workspaceReveal.reveal(ref)`（ui-explorer 提供，ui-conversation 消费）。`parseReference` 拆出 `path` 与可选 `:start-end`。既有 `RevealRequests` 通道携带 `lines` 与单调 `seq`。资源管理器打开 details/preview、高亮行，并对已开标签 activate（不重读草稿）。有行号时 `CodeMirrorTextPreview` 用 `clampLineRange` clamp、选区，并以 `scrollIntoView({ y: 'center' })` 滚动；按 `seq` 键控，重复点击仍会重滚。

## 考虑过的替代

- **跨包 value import explorer 助手。** 违反 client AGENTS.md；只用服务 + 共享请求 observable。
- **每次点击重载标签。** 否决：会丢掉未保存草稿；activate + seq 滚动足够。

## 后果

- 芯片 × 仍只删除（`stopPropagation`）；有服务时点 pill 才 reveal。
- 无行号后缀的芯片只 reveal 并打开预览。
