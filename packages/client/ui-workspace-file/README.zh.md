# @deepseek-ai/dsh-client-ui-workspace-file

[English](README.md) | 中文

工作区文件与文件夹 `@` 引用 source，浏览器半侧：向 `ctx.inputTriggers` 注册名为 `workspace-file` 的 `@` trigger source，与既有 subagent `@` source 并存。两个座位是不同的 `(trigger, name)` 对，因此子智能体候选仍出现在同一菜单中。

- **空 `@` 查询** — 以会话工作区根（`sessions.list` 的 cwd）调用 `IApiClient.host.listEntries({ path, root })`。传入 `root` 后，嵌套下钻也与 Host 的 `.gitignore`／`.dshignore`／`.cursorignore` 过滤完全一致。每个 `(session, path)` 缓存一层列举，单飞 fetch。
- **模糊查询（不含 `/` 或 `\`）** — 调用 `host.searchEntries({ root, query, limit })`，与文件浏览器搜索框同一 RPC、同一宿主排序（菜单 limit 100）。客户端不做 walk，也不另建索引。
- **路径下钻（`src/` 或 `src\util`）** — 仍用 `listEntries` 按段走具名子目录，使用宿主返回的绝对 `path`（客户端不拼接路径段）。

`type === 'file'` 与 `type === 'directory'` 的行成为候选；其他类型省略。菜单行显示 basename，嵌套时灰色相对路径写在 `description`。列举层的隐藏项默认省略，除非末段以 `.` 开头（搜索的 ignore／隐藏策略跟宿主）。

pick 会插入 `ReferenceInsert` 芯片：label 是工作区相对写法，`ref`／剪贴板／模型序列化是宿主绝对路径。草稿不会收到文件字节，也不会收到递归目录列举；模型看到的是可以交给工具的路径。带 `/` 和扩展名的路径不能走明文 lexicon 的 `@([\w-]+)` 扫描，因此本 source 不实现 lexicon。缺少 cwd 时返回空组；失败的 `host.listEntries`／`host.searchEntries` 从 `candidates` 抛出，由 slash 壳层记日志并静默丢掉该菜单组。

`/client` 导出只有插件体（`apply`／`inject`）；source 对象留在注册 effect 内部。

## 模型侧体验

### 用户提示中的工作区路径芯片

#### 模型看到什么

选中的文件或文件夹会以宿主绝对路径（例如 `/ws/README.md` 或 `/ws/src`）替换草稿芯片进入普通用户消息。不会附加文件正文、目录树、二进制附件或额外 host block。

#### Token 影响

有条件且仅追加：路径字面量只给这条新用户消息加 token。打开菜单、列举或搜索本身不加模型 token。

#### KV Cache 影响

仅追加。本包从不改写更早的请求 token。

## 已知限制与延后工作

- **芯片删除与拖放** — 删除插入的芯片由会话输入条负责；树拖到 composer 是后续 explorer 任务。
- **命中字符高亮** — MenuView 只渲染纯文本 `name`／`description`；子串高亮需要共享菜单 mark API（不归本包）。
- **宿主搜索质量** — 打分、ignore 剪枝与索引缓存在 `host.searchEntries`；本包只消费 `{ root, query, limit? }` → `{ path, entries, truncated }`。
