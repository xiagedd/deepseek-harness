# ui-explorer 全量文件/文件夹模糊搜索 — 落地方案

> 调研日期：2026-08-17  
> 范围：`deepseek-harness`（dsh Web / ui-explorer）  
> 性质：**只读调研结论**；本文是唯一允许新增的交付物。  
> 工作区样例：Unity 工程 `h:\GP0902_Git\client_02_dev`  
> 约束：`packages/client/ui-explorer/**` 正被另一 worker 改动（预览独立区 + 多标签）；本方案按「写入共享 preview store / 打开标签」描述打开行为，禁止设计内联第四栏或 `window.open`。

---

## 0. 现状结论（相对附图）

附图文案「仅当前已展开范围，不会索引整个工作区」是**旧客户端**表现。当前源码已经部分升级：

| 能力 | 源码现状 | 缺口 |
|---|---|---|
| Host RPC `host.searchEntries` | 已注册、schema/client/handler/api-proxy 齐全 | **无 ignore 剪枝**；**无索引缓存**；每次查询全树 `listDir` 走完 |
| 客户端调用 | `ExplorerPanel` 非空查询走 `searchEntries`，结果列表替换树 | 无防抖；无键盘上下/Esc；无命中高亮；单行只显示相对路径 |
| 模糊算法 | host `search-entries.ts` + client `fuzzy.ts` 各有一份子序列打分 | 缺 CamelCase、basename 加权；client/host 重复实现 |
| ignore | client `ignore.ts`：`.dshignore` → `.gitignore` → `DEFAULT_DSHIGNORE` | **仅过滤返回结果**，host 仍会走进 `Library/` 等目录 |
| 类型过滤 | `all / directory / code / text / other` | 图标侧已有 prefab/mesh/…；过滤选项未对齐（可能由另一 worker 扩展） |
| 预览 | `createFilePreviewStore()` + `actions.showText` | 另一 worker 在做独立 preview 区 + 多标签；打开搜索结果必须接该 store/标签 API |
| 测试 | client 有 ignore / panel 基础用例 | **无** `searchEntries` host 单测；panel 无全量搜索交互用例 |

**制作人目标**可落成：全工作区 + 文件/文件夹 + fzf/VS Code Ctrl+P 式子序列模糊。  
**落地策略**：不要再发明第二条 RPC；在已有 `host.searchEntries` 上补 **ignore 剪枝 + 懒建索引/缓存 + 打分增强**，客户端补交互与呈现。

---

## 1. 现有数据通道

### 1.1 客户端注入（ui-explorer）

入口：`packages/client/ui-explorer/src/client/index.ts`

通过 `connection.api.host` 调用：

| 方法 | payload | 用途 |
|---|---|---|
| `listEntries` | `{ path }` | 树：单层列举 |
| `searchEntries` | `{ root, query }`（可选 `limit`） | 全工作区搜索 |
| `readText` / `writeText` | `{ path }` | 读忽略文件 / 预览 / 新建文件 |
| `mkdir` / `rename` / `delete` / `copy` | 路径对 | CRUD |
| （工作区）`openPath` | 经 `ctx.workspaces` | OS 打开 |

`ExplorerPanel` 属性约定（同文件 + `ExplorerPanel.tsx`）：

```ts
listEntries(path, signal?) => Promise<readonly FsEntry[]>
searchEntries(root, query, signal?) => Promise<readonly FsEntry[]>
```

### 1.2 Host 类型与 schema

| 文件 | 职责 |
|---|---|
| `packages/host/apiproxy/src/api/host.ts` | `FsEntry` / `FsListing` / `FsSearchListing`；`HostApi.listEntries` / `searchEntries` |
| `packages/host/apiproxy/src/api/host.schema.ts` | Zod：`hostListEntries*` / `hostSearchEntries*` |
| `packages/host/apiproxy/src/api/rpc-map.ts` | RPC 名映射 |
| `packages/host/apiproxy/src/fetch/client.ts` | HTTP 客户端 `host.listEntries` / `host.searchEntries` |
| `packages/host/apiproxy/src/fetch/handler.ts` | 服务端分发 |
| `packages/host/apiproxy/src/api-proxy.ts` | 真实实现：`ctx.fs.resolve` + `ctx.fs.listDir` |
| `packages/host/apiproxy/src/search-entries.ts` | 递归 walk + fuzzy 排序 |

### 1.3 `FsEntry` / 搜索响应

```ts
interface FsEntry {
  name: string
  path: string          // absolute displayPath
  type: 'file' | 'directory' | 'other'
  hidden: boolean       // basename 以 '.' 开头
  size?: number
}

interface FsSearchListing {
  path: string          // 搜索根
  entries: FsEntry[]
  truncated: boolean    // 超过 limit
}
```

**Request**：`{ root: string; query: string; limit?: number }`  
- `limit` 默认 200，上限 500（`search-entries.ts` 的 `DEFAULT_LIMIT` / `MAX_LIMIT`）

### 1.4 注册模式（模仿对象）

新增/增强搜索能力时，**直接沿用**现有 `listEntries` / `searchEntries` 链路，不要新造 RPC 名。

对照模板：`api-proxy.ts` 中 `listEntries` → 同文件 `searchEntries`。  
若要加字段（例如 `ignoreRules` / `rebuild`），优先扩展 `hostSearchEntriesRequestSchema`，保持 unary + `AbortSignal`。

### 1.5 是否已有可复用的 glob/递归搜索

| 能力 | 有无 |
|---|---|
| 单层 `listDir` / `listEntries` | 有 |
| 递归 walk + fuzzy（`searchWorkspaceEntries`） | 有（但无 ignore 剪枝、无缓存） |
| 独立 glob RPC | **无** |
| 跨进程文件监视增量 | **无**（本阶段不引入 watcher） |

**结论**：不新增 `host.glob` / `host.find`；增强 `host.searchEntries` 即可。

---

## 2. 规模与性能（实测）

### 2.1 统计方法

PowerShell BFS，排除目录名：  
`.git` / `Library` / `Temp` / `obj` / `Logs` / `node_modules` / `Build` / `Builds` / `MemoryCaptures` / `.vs` / `UserSettings`  
（只读 Enumerate，未改任何文件。）

### 2.2 数字

| 范围 | 目录数 | 文件总数 | 其中 `*.meta` | 非 meta 文件 | 枚举耗时 |
|---|---:|---:|---:|---:|---:|
| 全仓（上述排除后） | **15 940** | **171 449** | **53 487** | **117 962** | **~61 s** |
| 仅 `Assets/` | **2 878** | **59 735** | **31 001** | **28 734** | **~17 s** |

可搜条目量级（目录 + 非 meta 文件）：

- 全仓剪枝后：约 **13.4 万**（15 940 + 117 962）
- 仅 Assets：约 **3.2 万**

文件内容体量约 23 GB（与索引无关）。索引若只存相对路径字符串：按 ~280 B/条目粗算，全仓约 **35–40 MB**，Assets 约 **8 MB** — 内存可接受。

### 2.3 判断

| 策略 | 是否可行 | 说明 |
|---|---|---|
| 每次按键全量 walk `listDir`（现状） | **否** | 即使用 ignore 剪枝，首次仍可能十几秒；无剪枝会撞 `Library` 卡死 |
| 一次性启动全量索引后常驻 | 勉强 | 61 s 冷启动体验差，且 Unity 仓大 |
| **首次懒加载建索引 + 内存缓存 + 变更失效** | **推荐** | 第一次非空查询（或 cwd 就绪后后台）建索引；之后查询对内存数组打分，通常 <50 ms；`mkdir/rename/delete/copy/writeText` 后失效 |

**推荐架构一句话**：  
`host.searchEntries` 持有 per-root 内存路径索引（懒建 + 失效）；查询阶段只做子序列 fuzzy 排序并截断；客户端负责防抖、类型过滤、结果 UI、打开 preview 标签。

---

## 3. 忽略规则

### 3.1 必须排除（walk 剪枝，不是事后过滤）

与 client `DEFAULT_DSHIGNORE` 对齐并扩展：

```
Library/
Temp/
Logs/
obj/
node_modules/
.git/
Build/
Builds/
MemoryCaptures/
.vs/
UserSettings/
*.meta
```

硬约束：

- `*.meta`：约定隐藏，搜索与树一致不出现（现状 host 已跳过 `.meta` 后缀文件）。
- 点文件：query 不以 `.` 开头时跳过 hidden（现状已有）。
- 空文件夹：树侧既有逻辑保持；搜索可返回空目录（若路径命中），不做特殊消灭。

### 3.2 是否读 `.gitignore`

**要读**，且与树一致：

1. `.dshignore`（优先）  
2. 否则 `.gitignore`  
3. 否则 `DEFAULT_DSHIGNORE`

现状：`readWorkspaceIgnore` 仅在 **client**。  
增强后：**host 建索引时必须应用同一套规则剪枝**，否则会扫描 `Library` 导致分钟级卡顿。  
实现建议：

- 短期：host `search-entries` 内嵌同等子集解析（或抽共享小模块到双方可依赖的包）；client 继续本地过滤作双保险。
- 请求可选携带 `ignoreText`（client 已读到的规则原文）——可少一次 host 读盘，但要防 client/host 不一致；更稳是 host 自己 `readText` 同路径。

**不做**：完整 gitignore（`**`、否定规则 `!`）— client `ignore.ts` 已声明 out of scope，搜索保持同一子集。

---

## 4. 模糊匹配算法

### 4.1 推荐

**自研约百行子序列打分**（已有雏形），**不引入** `fzf-for-js` / `fuzzysort`。

理由：

- 项目风格少依赖；现有 `fuzzy.ts` / `search-entries.ts` 已覆盖有序子序列 + 边界 bonus + 相邻加分。
- 候选集 ≤15 万，纯打分足够快；瓶颈在 IO walk，不在打分。
- 引入 fzf WASM/原生绑定会增加打包与测试面。

### 4.2 打分规则（在现有基础上补齐）

对 `relativePosix` 全路径与 basename 分别打分，取 max（现状已有 path 或 name 回退）：

1. **有序子序列**必须命中，否则丢弃。  
2. **连续段**加分（现状 adjacent +4）。  
3. **词首 / 分隔符后**加分：`-` `_` `/` `\`（现状 +8）。  
4. **新增 CamelCase 边界**：前一字符小写、当前大写 → 加分（建议 +6～8）。  
5. **新增 basename 权重**：basename 得分 × 系数（建议 1.5～2）或额外 bonus，使 `Buff` 优先 `FooBuff.cs` 而非深层路径偶然子序列。  
6. 同分按 basename localeCompare。

高亮：打分时记录匹配下标数组，经 RPC 带回或客户端对 basename/相对路径再跑一遍轻量 align（为少改协议，**优先客户端二次 align 只为高亮**，排序仍信 host）。

### 4.3 单一实现源

消除 client/host 双份漂移：

- 方案 A（推荐）：抽 `packages/client/ui-explorer` 与 host 都能用的极小共享 util（若包边界允许）；或  
- 方案 B：host 为权威排序；client `fuzzy.ts` 仅保留高亮 align + 单测镜像。

---

## 5. 交互设计

### 5.1 查询非空 → 结果列表模式

整体替换树视图（现状 `searchPane` 已替换，保留并增强）：

```
┌─────────────────────────────────────────┐
│ [搜索框…………]  [类型▼]                   │
│ 全工作区模糊匹配 / 正在建立索引… / 已截断 │
├─────────────────────────────────────────┤
│ 📄 BuffSystem.cs                        │
│    Assets/script/.../BuffSystem.cs      │  ← basename 主色 + 灰色相对路径
│ 📁 Buff                                 │
│    Assets/script/Buff                   │
└─────────────────────────────────────────┘
```

- 图标：沿用 `explorerIconKind`（含 prefab/mesh/…）。  
- 命中字符：basename（及可选路径）高亮。  
- **文件夹**：清空 query → `setRevealPath` 展开定位到树（现状 `onSearchActivate` 已接近）。  
- **文件**：写入**共享 preview store / 打开标签**（见 §6），禁止 `window.open`、禁止内联第四栏。

### 5.2 键盘

| 键 | 行为 |
|---|---|
| ↑ / ↓ | 结果列表选中移动 |
| Enter | 激活当前项（同点击） |
| Esc | 清空 query，回到树；若已空则不吞事件 |

### 5.3 防抖 / 上限 / 取消

- **防抖**：输入 150–200 ms 后再发 `searchEntries`（现状无防抖，需补）。  
- **上限**：继续 host `limit` 默认 200；UI 在 `truncated` 时提示「结果过多，请缩小关键词」。  
- **取消**：`AbortController` + 单调 `searchSeq`（现状已有）；防抖定时器卸载时 clear。  
- **索引构建中**：单独文案，不与「正在搜索…」混淆。

### 5.4 locales 增补 key（zh + en）

已有：`search.placeholder` / `search.aria` / `search.scope` / `search.loading` / `search.results.aria` / `empty.search`。

建议新增：

| key | zh | en |
|---|---|---|
| `search.indexing` | 正在建立工作区索引… | Building workspace index… |
| `search.truncated` | 结果过多，已截断；请输入更具体的关键词 | Too many matches; refine your query |
| `search.error` | 搜索失败 | Search failed |
| `search.empty` | （可继续用 `empty.search`） | — |

附图旧文案「仅当前已展开…」应从产品路径消失；确认 bundle 已含新 `search.scope`。

---

## 6. 与现有功能衔接

### 6.1 类型过滤

- **树模式**：过滤已展开节点（现状）。  
- **全量搜索模式**：host 返回候选后，**client** 用 `matchesTypeFilter` 再滤（现状已做）。  
- 当另一 worker 把 `ExplorerTypeFilter` 扩到 `image/data/prefab/mesh/material/shader/scene/anim/audio/asset` 时：  
  - `matchesTypeFilter` 与 `explorerIconKind` 共用扩展集合；  
  - 搜索模式自动受益，无需改 RPC。  
- `directory` 过滤：只保留文件夹命中。

### 6.2 `.meta` / 空文件夹 / ignore

保持与树一致：meta 永不出现；ignore 目录不进索引；空文件夹在树中仍显示「空文件夹」文案。

### 6.3 打开文件 → preview store / 多标签

当前：`openFile` → `actions.showLoading` / `showText`（`stores.ts`）。  

**方案约定**（兼容另一 worker）：

1. 搜索结果点文件 = 调用与树点击**同一** `openFile`（或即将改名为 `openPreviewTab`）路径。  
2. 该路径只写共享 preview store / 打开标签，不创建 explorer 内第四栏。  
3. 本任务不实现多标签本身；仅保证调用点不分叉。

### 6.4 CRUD 后索引

`mkdir` / `rename` / `delete` / `copy` / `writeText` 成功后：通知 host 失效该 root 索引（可选新字段 `searchEntries({ rebuild: true })`，或 host 在这些 mutation 实现里 `invalidateSearchIndex(root)`）。

---

## 7. 改动清单与实施步骤

### 7.1 文件列表（相对 `deepseek-harness`）

| 路径 | 动作 |
|---|---|
| `packages/host/apiproxy/src/search-entries.ts` | **主改**：ignore 剪枝、懒索引缓存、失效 API、打分增强（CamelCase + basename） |
| `packages/host/apiproxy/src/api-proxy.ts` | mutation 后 `invalidate`；`searchEntries` 传入 ignore 解析 / fs |
| `packages/host/apiproxy/src/api/host.ts` | 若需扩展 request（如 `rebuild`）则补类型注释 |
| `packages/host/apiproxy/src/api/host.schema.ts` | 同步 Zod（仅在扩展字段时） |
| `packages/host/apiproxy/tests/search-entries.spec.ts` | **新增**：剪枝、fuzzy 排序、limit/truncated、abort |
| `packages/host/apiproxy/tests/api-proxy-workspace.spec.ts` | 补 `searchEntries` 集成断言（若已有 listEntries 用例则并列） |
| `packages/client/ui-explorer/src/client/fuzzy.ts` | 与 host 对齐打分；导出高亮 align |
| `packages/client/ui-explorer/src/client/ExplorerPanel.tsx` | 防抖、键盘、basename+路径行、高亮、truncated/indexing 文案；打开走统一 preview |
| `packages/client/ui-explorer/src/client/ExplorerPanel.module.css` | 结果行样式（主名/副路径/高亮） |
| `packages/client/ui-explorer/src/client/locales.ts` | 增补 §5.4 keys |
| `packages/client/ui-explorer/src/client/ignore.ts` | 一般不动；若抽共享则改为 re-export |
| `packages/client/ui-explorer/src/client/index.ts` | 透传 `truncated`（若 UI 需要）；`limit` 可选 |
| `packages/client/ui-explorer/src/client/stores.ts` | **只读衔接**；多标签由另一 worker 改，搜索只调用其打开 API |
| `packages/client/ui-explorer/tests/explorer-panel.client.spec.tsx` | 搜索替换树、取消竞态、类型过滤、Esc、打开 preview mock |
| `packages/client/ui-explorer/tests/fuzzy.spec.ts` | **新增**：子序列 / CamelCase / basename 权重 |
| `docs/explorer-fuzzy-search-plan.md` | 本文 |

**不改**：Unity 仓 `client_02_dev`；不新增 npm 模糊依赖。

### 7.2 分步实施与验证

#### Step 1 — Host：ignore 剪枝 + 单测

- 在 `searchWorkspaceEntries` walk 时跳过 ignore 目录与 `*.meta`。  
- **验证**：vitest — `Library/` 下文件不出现；`Foo.cs.meta` 不出现；`Assets/x.cs` 可命中。

#### Step 2 — Host：懒索引缓存 + 失效

- 首次查询建 `Map<root, IndexEntry[]>`；后续查询复用；mutation invalidate。  
- **验证**：同一 root 第二次 `searchEntries` 不再重复 `listDir` 全树（mock listDir 调用次数）；rename 后结果更新。

#### Step 3 — 打分增强

- CamelCase + basename 权重；统一 client/host。  
- **验证**：`fuzzy.spec.ts` — query `fbs` 命中 `FooBarService`；`buff` 时 basename `Buff.cs` 高于深层偶然匹配。

#### Step 4 — Client 交互

- 防抖 150–200 ms；结果 UI；键盘；locales；`truncated` 提示。  
- **验证**：panel 测试 — 快输只触发最后一次 RPC；Esc 回树；点击文件调用 preview actions；目录点击 reveal。

#### Step 5 — 与 preview 多标签 worker 汇合

- 确认 `openFile` 唯一入口接到新 tab API。  
- **验证**：手工 / 既有 `file-preview-panel` 测试不回归；不启动 dsh web（本调研阶段禁止）；实施阶段由主进程决定是否手动验收。

### 7.3 vitest 用例要点（汇总）

**Host `search-entries.spec.ts`**

1. 空 query → 空或 schema 拒绝（与现约定一致）。  
2. 子序列命中文件 + 文件夹。  
3. ignore 目录不被 listDir（或 list 后不入栈）。  
4. `.meta` 排除。  
5. `limit` → `truncated: true`。  
6. `AbortSignal` → `AbortError`。  
7. 缓存命中减少 listDir 次数。

**Client**

1. `fuzzyScore` / basename 权重。  
2. 搜索模式替换树；loading / empty / error 文案。  
3. 类型过滤与搜索组合。  
4. 竞态：旧响应不覆盖新 query。  
5. 文件打开走 preview store mock；文件夹 reveal 并清空 query。

---

## 8. 风险与协作

1. **与另一 ui-explorer worker 冲突**：改 `ExplorerPanel.tsx` / `locales.ts` / CSS 前先同步 diff；优先小步、少动 preview 结构。  
2. **运行中的旧 bundle**：附图旧文案说明 3080 可能未热更；实施后需 Ctrl+Shift+R，但不在本调研执行。  
3. **无文件监视**：索引依赖 CRUD 失效；外部用资源管理器改文件需手动刷新（可接受 v1）。  
4. **完整 gitignore**：不做 `**` / `!`，与树 ignore 子集一致，避免两套语义。

---

## 9. 验收口径（制作人可感知）

1. 搜索框提示为全工作区模糊，不再出现「仅当前已展开范围」。  
2. 未展开的深层路径（如 `Assets/.../BuffSystem.cs`）可被 `buff` / `bs` 类查询命中。  
3. 文件夹与文件均可出现在结果中；点文件夹定位树，点文件打开 preview 标签。  
4. Unity 大仓首次有「建立索引」提示，其后按键响应快；`Library` 不拖垮搜索。

---

## 10. 推荐结论速查

| 项 | 结论 |
|---|---|
| 架构 | 增强已有 `host.searchEntries` + client 结果列表；懒索引缓存在 host |
| 量级 | 剪枝后 ~13.4 万条目；Assets ~3.2 万；冷枚举 17–61 s → 必须缓存 |
| RPC | **不新增**；签名保持 `{ root, query, limit? }` → `{ path, entries, truncated }`；可选加 `rebuild` |
| 算法 | 自研子序列打分（增强 CamelCase + basename）；无新依赖 |
| 打开文件 | 共享 preview store / 多标签 API |
| 文档 | `docs/explorer-fuzzy-search-plan.md` |
