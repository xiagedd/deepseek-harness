# Agent Note: Persist explorer expand and preview tabs in localStorage

Status: implemented

[English](2026-08-18-explorer-browse-persist.md) | 中文

## Problem

Web GUI 硬刷新会重置资源管理器：所有文件夹折叠，已打开的预览标签消失。用户每次刷新后都要重新展开工作区并重新打开文件。列宽与未保存草稿是另议题；此处缺口是应在同一浏览器源下跨页面加载保留的浏览态。

## Decision

新增根作用域 `createExplorerTreeStore`，`persist: 'dsh.explorer.tree.v1'`。状态为 `{ byWorkspace: Record<cwd, { expanded, previewPaths, activePath }> }`——单一 localStorage 键，载荷内按会话 cwd 分桶（对标 `dsh.workspace.view.v5`），不用 session `scopeKey` 后缀，也不进 Host settings。Apply 用无 scope 的 `.create()` 建一份实例，经 inject 回调接到 explorer / preview 座位；实时预览 store 仍不持久化，因此 draft/dirty/正文不会落盘。

cwd 变化时，`ExplorerPanel` 读桶、按 `hydratedExpandedPaths` 展开，并对各路径 `listEntries`（非根目录 `dropOnError`，已删文件夹静默消失）。已保存的预览路径走 `showLoading` + `readText`；失败则 `close` 标签、不弹错。`retainAccountKeys` 只保留已知工作区路径。破坏性改 shape 直接 bump 键名 `.vN`，不做迁移。

## Alternatives considered

**把浏览态放进 Host settings。** 已在 [host-backed web preferences](2026-08-06-host-backed-web-preferences.md) 否决：披露与导航是浏览器实例态，不是用户级产品偏好。

**把 tree store 挂在 session 作用域的 explorer 座位上。** 会给 persist 键加 session 后缀，同一 cwd 跨会话被隔离；否决，改为单一根键下按 cwd 分桶。

**持久化完整 `FilePreviewState`（含 draft）。** 会重水合可能与磁盘不一致的未保存缓冲；否决——只存路径 + activePath，再经 `host.readText` 重载。

**持久化布局列宽。** 不在本次范围；已在 [布局面板列宽跨刷新持久化](2026-08-18-explorer-layout-persist.md) 单独实现。

## Consequences

- 硬刷新按当前 cwd 恢复展开文件夹与预览标签路径；其它工作区留在各自桶中直至被裁剪。
- 已删除路径在 hydrate 时消失且不阻塞树。
- 未保存预览编辑在刷新后仍会丢失（设计如此）。
- Reveal 滚动锁与三态文件夹探测仍只用内存中的 `dirs` / `probed`；持久化只种下要展开的目录集合。

## Testing

`tests/explorer-tree-store.client.spec.ts` 覆盖 persist 键名、cwd 隔离、`retainAccountKeys`，以及存储中不含 draft/正文。`tests/explorer-panel.client.spec.tsx` 覆盖 hydrate 展开与 list/read 失败时的静默剔除。jsdom 用例配合 `beforeEach` 中的 `localStorage.clear()`。
