# dsh Web 接力交接 — 2026-08-18

## 本轮已完成（四项，勿重做）

1. **预览独立列 + 多标签**  
   - 列序：`sidebar | 1fr | preview | details`  
   - `openPreview` / `closePreview`；双 `DragHandle`  
   - 关键：`packages/client/ui-layout/`、`packages/client/ui-explorer/`（`createFilePreviewStore` / tabs）

2. **预览在资源管理左侧可独立拖拽**  
   - 预览列在树左侧，宽度可拖  
   - 关键：`ui-layout` 列布局与 DragHandle

3. **全量文件/文件夹模糊搜索**  
   - `fuzzy.ts` + `host.searchEntries` 懒索引  
   - 计划：`docs/explorer-fuzzy-search-plan.md`

4. **@ 引用走 searchEntries → 绝对路径 chip**  
   - `@` → `searchEntries` → `insertReference`；绝对路径序列化  
   - 关键：`packages/client/ui-workspace-file/`  
   - 计划：`docs/explorer-at-mention-plan.md`

## 硬约束（新窗口强制）

- **只改** `h:/GP0902_Git/deepseek-harness`
- **禁止改** `client_02_dev` 业务代码（仅允许 sync_relay / active_task）
- **禁止** 任何 git 写操作
- **禁止** `npx @deepseek-ai/dsh`
- **3080 单实例**（不要重启、不要再起第二个）

## 验证状态

| 包 | vitest |
|---|---|
| ui-layout | 64 全绿 |
| ui-explorer | 82 全绿 |
| ui-workspace-file | 31 全绿 |
| apiproxy | 384 全绿 |

- bundle 已刷新
- 收口修过：`IApiClient.searchEntries` + connection fixture/fake-api
- 运行入口：http://127.0.0.1:3080
- 截图：`%LOCALAPPDATA%\dsh-verify\`

## 遗留

- `@` 候选项：**无命中字符高亮**（需 MenuView mark API）
- 首次搜索：**冷索引约 1 分钟量级**

## 新窗口不要重做

- 图标接线（prefab/image/mesh/…）
- 内联第四栏预览
- `window.open` 方案

## 建议下一步（让用户选，勿擅自开写）

1. 布局/交互打磨  
2. 性能（冷索引、搜索响应）  
3. `@` 候选项命中高亮（MenuView mark）

## 关键锚点

- 计划：`docs/explorer-fuzzy-search-plan.md`、`docs/explorer-at-mention-plan.md`
- 本文件：`docs/handoff-2026-08-18-dsh-web.md`
- 预览：http://127.0.0.1:3080
- 截图：`%LOCALAPPDATA%\dsh-verify\`
