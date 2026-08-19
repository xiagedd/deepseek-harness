# Agent Note: 资源管理器预览编辑器主题设置

Status: implemented

中文 | [English](2026-08-18-explorer-preview-editor-theme-settings.md)

## 问题

资源管理器 CodeMirror 预览使用固定的 `--dsw-*` / `--shiki-*` 外观。用户无法选择预置主题、覆盖语法/chrome 色或调整排版，且此类选择在硬刷新后无法保留。选区可见性已用半透明当前行与 overlay 选区 token 修补；该修复需留在新的 token 体系内。

## 决策

由 ui-explorer 节点半边注册 Host settings 命名空间 `ui-explorer-preview`（`presetId` + `overrides`）。浏览器半边经 `settingsScope` 绑定，将预置（`default` / `vs-dark` / `vs-light` / `one-dark`）与覆盖解算为 `--dsh-editor-*`，再经 `theme.overrideTokens` 并入 `ThemePresenter` 写到 body——不另起第二套 DOM 写手。CodeMirror 只读这些变量并回退到 `--dsw-*` / `--shiki-*`；行号用 Compartment（CSS 关不掉 `lineNumbers()`）。通用设置行（`settings.general.item`，id `editor-preview`）提供预置 Menu、颜色输入、字号/行高 Input、行号开关与恢复默认（`unset` overrides）。

## 放弃的方案

- **用 localStorage 存编辑器配色。** 拒绝：产品偏好应与外观一样走 Host settings，不是浏览器浏览态。
- **在 ThemePresenter 旁再写一套 body.style。** 拒绝：重复契约并与主题切换竞态。
- **从 ExplorerPanel 穿 props 到 FilePreviewPanel。** 拒绝：二者是无父子关系的兄弟 slot。

## 后果

硬刷新后编辑器外观仍在。`default` 预置值为 CSS 变量引用，跟随应用亮暗；绝对预置忽略应用 scheme。远程非 loopback 与其它 scope 一样降级为 memory。Monaco 仍是后续引擎替换；`TextPreviewEngineProps` 增加可选 `showLineNumbers`。
