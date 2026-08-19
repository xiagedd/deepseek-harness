# Explorer `@` 文件/文件夹引用 → 聊天框（只读方案）

> 调研日期：2026-08-17  
> 范围：只读；**禁止**改 `packages/client/ui-explorer/**` 等并行 worker 源码。  
> 并行：预览区多标签；全量模糊搜索方案 `docs/explorer-fuzzy-search-plan.md`（调研时尚未落盘）。  
> 产品原话：「要支持 cursor 的 @ 的快捷功能，直接拷贝链接到聊天框，方便我快速与 ai 沟通」

---

## 0. 一句话产品行为

在聊天输入框打 `@`（或树右键「引用到聊天」）→ 选出工作区文件/文件夹 → 输入框出现可删 **chip**（label=工作区相对路径）→ 发送时模型只收到 **绝对路径字面量**（不塞文件正文），便于 agent 调工具。

---

## 1. 现状结论（已基本落地，缺口在「全量模糊」）

| 能力 | 状态 | 锚点 |
|------|------|------|
| `@` 触发 + 浮层菜单 | ✅ | `ui-input-trigger`（`TriggerChar = '/' \| '@'`，`MenuView`） |
| 工作区文件 `@` 源 | ✅ | `packages/client/ui-workspace-file`（`name: workspace-file`） |
| subagent `@` 并存 | ✅ | `ui-subagent`；`(trigger,name)` 座位不互替 |
| Chip + 可删 | ✅ | `ui-conversation` `InputBar` + `ReferenceInsert` / occurrences |
| 树「引用到聊天」 | ✅ | `ui-explorer` 菜单 `addToChat` → `insertWorkspaceReference` |
| OS 拖文件进输入框 | ✅（路径 chip） | `InputBar` + `drop-paths.ts`；图片仍走附件 |
| 树拖到聊天框 | ⏳ 可选后续 | 需对齐 T-EX-DND 与 T-AT-DRAG |
| `@` **全量**模糊候选 | ❌ 缺口 | 当前 `workspace-file` 只做 **按层 `listEntries` + includes**，README 已写明「无递归索引」 |

用户指南 `docs/user/guide/index.zh.md`「Composer 与 Cursor」仍写「本 UI 没有 `@file`」——**文档滞后于代码**，实施时需改正（非本调研改代码范围）。

---

## 2. 聊天输入框在哪 / 插入 API

### 包与组件

- 包：`@deepseek-ai/dsh-client-ui-conversation` → `packages/client/ui-conversation`
- 输入条：`src/client/skeleton/InputBar.tsx`
- 草稿状态机：`src/client/input/machine.ts` + `facade.ts`（`ConversationInputShell`）
- Trigger 管线：`@deepseek-ai/dsh-client-ui-input-trigger`（检测、菜单、键盘、Esc、源注册）

### 现成插入 API（有，禁止再造）

1. **结构化引用（推荐，唯一正路）**  
   `ctx.conversation.input.for(sessionBinding.ctx).insertReference(ref, span)`  
   - `ref: ReferenceInsert`：`{ source, ref, label, clipboardText }`  
   - `span: TokenSpan`：`{ start, end, draftRev }`（CAS）  
   - 定义：`ui-input-trigger/src/types.ts`；实现：`facade.insertReference` → machine `insert-ref`

2. **Explorer 薄封装（已有）**  
   `insertWorkspaceReference(sessionId, path): boolean`  
   （`ui-explorer/src/client/index.ts`）构造 `source:'workspace-file'`，span 落在 draft 末尾。

3. **`@` 菜单挑中**  
   `InputTriggerSource.onPick` → `{ insert: ReferenceInsert }`；由 controller 调同一条 insert 路径。

**没有**单独的「file attachment 协议」给路径引用；图片才走 `ComposerAttachment` / `session.attachment`。路径引用 = draft 里 U+FFFC occurrence + codec，不是第二条附件轨。

---

## 3. 如何把「文件引用」交给 AI

| 层 | 形态 |
|----|------|
| UI chip | `label` = 工作区相对路径（或 basename） |
| 剪贴板 / 复制 | `clipboardText` = **绝对路径** |
| 发往模型 | `codec.serialize(ref)` → **绝对路径字面量**，原地替换占位符 |

证据：`ui-workspace-file` codec `serialize: ref => Promise.resolve(ref)`；`facade.sinkSerialized` 经 `inputTriggers.serializeReference` 拼进 user prompt。README「Model Experience」明确：**不上传正文、不展开目录、不加额外 host block**。

### 序列化推荐（保持现有，可缩窄）

- **推荐默认**：继续 **绝对路径纯文本**（Windows/POSIX 主机 display path）。  
- **不推荐**：markdown link、`@rel/path` lexicon、结构化 JSON attachment（协议无此槽，且与 tool path 习惯不一致）。  
- **可缩窄选项**（需产品确认）：若希望模型少看绝对前缀，可改 codec 为相对路径；但工具调用多数吃绝对/cwd 相对——改前先确认 host tool 约定。当前实现与 LOCAL-CURSOR-PARITY T-AT-* 一致，优先不改。

---

## 4. `@` 触发 UI

- 检测：`ui-input-trigger/src/core/detect.ts`（词界；`/` 有 URL 特例，`@` 无）
- 浮层：唯一 `MenuView`；键盘上下/Enter、Esc 关闭由 controller 管
- **与 `/` 冲突**：无。`/` = command/skill；`@` = subagent + workspace-file；加号按钮只开 `/` command source
- 与 subagent：同菜单多 group；`workspace-file` `order: 1`（locale：`文件与文件夹`）

空 query：列 cwd 一层；带 `src/`：按段 `listEntries` 下钻（非全库模糊）。

---

## 5. 与文件浏览器的桥

最小侵入：**已接好**，勿新造 event bus。

```
ExplorerPanel 右键 addToChat
  → inject.insertWorkspaceReference(sessionId, path)
    → conversation.input.insertReference({ source:'workspace-file', ... })
```

- Slot：`conversation.details.explorer`（conversation 声明，explorer 注入）
- Reveal：`latestMentionPath(cwd, occurrences)` 用 chip `clipboardText` 高亮树节点
- Host RPC：列举/搜索走 `host.listEntries` / `host.searchEntries`；插入聊天 **不**走 host

`FilePreviewPanel`：预览侧暂无「添加到聊天」入口；若要加，复用同一 `insertWorkspaceReference`，勿平行 API。

---

## 6. 与全量模糊搜索的衔接（复用，禁止再造）

调研时 **`docs/explorer-fuzzy-search-plan.md` 尚不存在**。以下按 **已落地代码** 对齐，待模糊方案文档写出后以该文档为索引权威、本文件只消费。

### 已有索引 / RPC

| 层 | 职责 |
|----|------|
| Host | `host.searchEntries({ root, query })` → `apiproxy/src/search-entries.ts`（walk + ordered-subsequence fuzzy，limit 默认 200） |
| Explorer UI | `ExplorerPanel` 搜索框已调 `searchEntries`；client 侧另有 `ui-explorer/.../fuzzy.ts`（与 host 同算法镜像） |
| `@` 源 | **仍只用** `listEntries` 分层 — **这是唯一主缺口** |

### 复用契约（实施硬规则）

1. `@` picker **不得**自建第二套 walk/打分；候选主路径改为 `host.searchEntries(cwd, query)`。  
2. 打分权威以 **host 返回顺序** 为准；若 fuzzy 方案抽出共享模块，`ui-workspace-file` 只消费，不复制第三份 `fuzzyScore`。  
3. Explorer 搜索 UI 与 `@` MenuView **共享同一 RPC**；UI 壳可不同（树过滤 vs trigger 菜单 group）。  
4. 保留路径下钻：`query` 含 `/` 或 `\` 时，可继续「段下钻 + 末段过滤」**或**「整段相对路径当 fuzzy needle」——与 fuzzy 方案文档二选一写死，避免两套语义。推荐：**无分隔符 → searchEntries；有分隔符 → 现有下钻（或 searchEntries 以相对路径打分）**。  
5. ignore / `.meta`：与 explorer 搜索同一过滤口径（fuzzy 方案落地后对齐）。  
6. 上限：对齐 host limit（≤200 展示，菜单侧可再截到现有 `MAX_CANDIDATES=100`）。

---

## 7. 改动清单与分步（相对 deepseek-harness）

### A. 主缺口 — `@` 全量模糊（落在 **ui-workspace-file**，不是 ui-explorer）

| 路径 | 动作 |
|------|------|
| `packages/client/ui-workspace-file/src/client/index.ts` | `candidates`：空/无斜杠 query → `host.searchEntries`；映射 `FsEntry` → `InputTriggerCandidate`；保留 `onPick`/`codec` |
| `packages/client/ui-workspace-file/tests/browser-plugin.client.spec.ts` | mock `searchEntries`；断言全库命中、abort、失败空组 |
| `packages/client/ui-workspace-file/README.md` / `README.zh.md` | 删除「仅一层」限制说明；写清复用 `host.searchEntries` |
| （可选）`packages/host/apiproxy/tests/*search*` | 若改 limit/ignore，补 host 测；否则只读复用 |

### B. 文档滞后（conversation / user guide）

| 路径 | 动作 |
|------|------|
| `docs/user/guide/index.md` / `index.zh.md` | Composer 表：`@file` → workspace-file chip + 绝对路径 |
| `packages/client/ui-conversation/README*.md` | 如仍写「无文件 @」，对齐 |

### C. 已完成 — 勿重复开工

| 路径 | 说明 |
|------|------|
| `packages/client/ui-explorer/...` | `addToChat` / `insertWorkspaceReference` / Reveal — **并行 worker 领地，本任务勿改除非修 bug** |
| `packages/client/ui-conversation/.../InputBar.tsx` / `drop-paths.ts` | chip 渲染、删除、OS drop |
| `packages/client/ui-input-trigger/**` | 检测/菜单壳 — 仅当缺 shared candidate helper 时极小改动 |

### D. 可选后续（优先级 3）

| 项 | 路径提示 |
|----|----------|
| 树 → 聊天拖放 | explorer DnD payload + InputBar `canAcceptDrop` 认 tree mime |
| 预览栏「引用到聊天」 | `FilePreviewPanel` 调同一 insert API |
| 用户指南截图 | `docs/user/...` |

### 分步实施

1. **对齐 fuzzy 方案文档**（等 `explorer-fuzzy-search-plan.md` 或确认 host.searchEntries 为最终 API）  
2. **改 ui-workspace-file candidates → searchEntries** + vitest  
3. **修用户指南 `@file` 行**  
4. （可选）树拖到聊天 / 预览 Add to Chat  

### Vitest 要点

- `workspace-file` 注册/HMR 注销仍通过  
- `searchEntries` 返回跨目录路径 → pick → `ReferenceInsert.ref` 为绝对路径、`label` 相对  
- `signal` abort 不写脏 cache  
- RPC 失败 → 空组 / 抛错由 shell 吞，composer 不崩  
- subagent 与 workspace-file 同 `@` 菜单仍并存  
- **回归**：含 `/` 的下钻或约定语义不变  
- 不强制改 explorer 测（除非共享过滤 helper 抽公共）

---

## 8. 可缩窄假设（AskQuestion 不可用时的默认）

1. Chip 为主；剪贴板绝对路径。  
2. 发给 AI = 绝对路径文本，不塞正文。  
3. `@` 全量搜索 = 复用 `host.searchEntries`，不新建索引服务。  
4. 「Add to Chat」已够用；树拖到聊天可后置。  
5. 不改消息协议加 file-context 块。

---

## 9. 验收口径（对照制作人）

- [ ] `@` + 关键词能跨目录命中文件/文件夹并插入 chip  
- [ ] 树右键「引用到聊天」插入同一类 chip  
- [ ] 复制 chip 得到可粘贴路径  
- [ ] 发送后模型上下文含路径字面量（日志/回放可见）  
- [ ] `/` 斜杠与 subagent `@` 行为不回归  

---

## 10. 计划文档路径

本文件：`docs/explorer-at-mention-plan.md`  
应对齐：`docs/explorer-fuzzy-search-plan.md`（待并行 worker 落盘）  
任务 DAG 背景：`LOCAL-CURSOR-PARITY-TASKS.md` 第 0 期 T-AT-*
