# Explorer 文本/代码预览富化 — 落地方案

> 调研日期：2026-08-18  
> 范围：`deepseek-harness`（dsh Web / `ui-explorer` 预览列）  
> 性质：可执行方案 + **已定产品拍板**；预览列 + 多标签已落地，禁止 `window.open` / 内联第四栏。

相关锚点：[web-styling.md](web-styling.md)、[explorer-fuzzy-search-plan.md](explorer-fuzzy-search-plan.md)、[handoff-2026-08-18-dsh-web.md](handoff-2026-08-18-dsh-web.md)、依赖策略 [dependencies-over-hand-rolling](../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)、实现记录 [editable CM6 preview](../.agents/notes/implemented/feature/2026-08-18-explorer-editable-codemirror-preview.md)。

---

## 0. 一句话结论（已定）

**现在：CodeMirror 6 可编辑预览**（语法高亮、行号、查找、折叠；Save / Ctrl/Cmd+S → `host.writeText`；多标签 dirty）。  
**最终目标：Monaco / VS Code 类似能力**；本次不上 Monaco，但业务只依赖 `TextPreviewEngineProps` 薄适配层，便于后续替换引擎。  
不推荐自研编辑器内核；不把业务写死进 CM6 API。

---

## 已定（制作人拍板）

| 项 | 决定 |
|---|---|
| v1 引擎 | **CodeMirror 6**，必须 **可编辑** |
| 保存 | 工具栏保存 + Mod-S，走已有 `host.writeText({ path, content })` |
| Dirty | 多标签可见（`•` / `data-dirty`） |
| 超大文件 | 客户端 **1 MiB** UTF-8 门槛；超限不挂编辑器 |
| 架构 | `TextPreviewEngineProps` + `CodeMirrorTextPreview`；Monaco 为后续实现 |
| 明确不做 | 本次不上 Monaco；不重做多标签 / 布局 / 模糊搜索 / `@` chip |

---

## 1. 现状：数据流

| 步骤 | 位置 | 行为 |
|---|---|---|
| 点击树文件 | `ExplorerPanel.openFile` | `openPreview()` → `showLoading` → `host.readText`；超大 → `showError(tooLarge)` |
| 成功 | `showText` | `content` + `draft`，`dirty: false` |
| 编辑 | `setDraft` | 更新 `draft`，`dirty = draft !== content` |
| 保存 | `FilePreviewPanel` | `writeText(path, draft)` → `markSaved` |
| 渲染 | `TextPreviewBody` → lazy `CodeMirrorTextPreview` | 引擎可替换 |

关键文件：`FilePreviewPanel.tsx`、`TextPreviewBody.tsx`、`text-preview-engine.ts`、`CodeMirrorTextPreview.tsx`、`preview-lang.ts`、`stores.ts`、`ExplorerPanel.tsx`（`openFile`）、`index.ts`（preview inject `writeText`）。

---

## 2. 第三方候选对比（摘要）

| 维度 | Monaco | CodeMirror 6（已定 v1） | Shiki 只读 |
|---|---|---|---|
| 可编辑 | 是 | **是** | 否 |
| 体积 / 工程化 | 大（worker/CSP） | 中小 | 零新依赖但无查找/折叠 |
| 路线 | **最终目标** | **现在落地** | 仅作只读备选 |

---

## 3. 落地范围（v1）

### 扩展名 → language

见 `PREVIEW_LANG_BY_EXT`（`.cs`→csharp，`.ts`/`.tsx`→typescript，json/md/yaml/xml/shader→…，未知→`plain`）。仍挂 CM6；二进制仍由 `readText` 失败回退。

### 二进制 / 超大

| 情况 | 行为 |
|---|---|
| 二进制 / 非 UTF-8 | `showError`（现状） |
| > 1 MiB | 打开时 `showError(tooLarge)`；若 store 已有超大正文，`TextPreviewBody` 显示 oversized 状态 |

### 可编辑

Store：`draft` / `dirty` / `setDraft` / `markSaved`。Preview inject：`writeText(path, content)`。冲突策略：无 CAS，后写覆盖（与 Host 一致）。

---

## 4. 依赖

`@deepseek-ai/dsh-client-ui-explorer` 的 `dependencies`：`@codemirror/*`、`@codemirror/legacy-modes`、`@lezer/highlight`。主题映射 `--dsw-*` / `--shiki-*`；无全局冲突 CSS。

---

## 5. 路线：CM6 可编辑 → Monaco

1. **现在**：`TextPreviewEngineProps`（path/text/language/readOnly/onChange/onSave）+ CM6 实现。  
2. **以后**：新增 `MonacoTextPreview` 实现同一 props；改 `TextPreviewBody` 的 lazy import；面板 / store / openFile **零 CM6/Monaco API**。  
3. Monaco 再处理 worker、CSP、更大 bundle。

---

## 6. 验收

- [x] `.cs` 等扩展高亮 + 行号（CM6）  
- [x] 可编辑 + dirty + writeText 保存  
- [x] 超大 / 二进制回退  
- [x] 引擎抽象可替换  
- [ ] 运行中 3080 需 `pnpm --filter @deepseek-ai/dsh-client-ui-explorer bundle`（及 web-app 视部署）后刷新才可见
