# @deepseek-ai/dsh-client-ui-explorer

[English](README.md) | 中文

Web 会话详情列的工作区文件树。浏览器侧占用会话声明的 `conversation.details.explorer` 子座位——绝不占用 `details` 本体，否则会阴影 `DetailsPanel` 并吃掉工具输出。会话标题栏的「文件」按钮打开该详情列，因此不必先 Inspect 一次工具调用也能看见树。资源管理器与 CM6 预览是账户级能力：每个工作区 Session 都能打开；切换 Session／工作区时列保持打开，树改绑到该会话 cwd（浏览态仍按 cwd 分桶）。

树根是当前会话工作区（`cwd`）。文件夹按层展开/折叠，每一层一次 `host.listEntries`。已展开文件夹路径与预览标签路径（仅路径列表 + 当前路径）持久化在浏览器 `localStorage` 的 `dsh.explorer.tree.v1` 下，在单一根作用域 store 内按工作区 cwd 分桶——不走 session `scopeKey`，也不进 Host settings。硬刷新后按这些路径重新列举/重读；已删除路径静默剔除。未保存的预览草稿与 dirty 标志只留在内存。列举结果里的 `.meta` 文件（Unity 的 `Foo.cs.meta` 等）会被省略，目录仍显示。空文件夹用空态图标和弱化文案标在自身行上，展开后不再插入假子项。文件夹行有三种图标状态：有可见子项时为实心文件夹，为空时为描边（空心）文件夹，展开时为打开态文件夹。折叠文件夹的实心/描边判定来自对可见未展开目录的一次性、带缓存、非阻塞的单层 `host.listEntries` 探测；结果到达前（或探测失败时）图标保持实心，因此不会闪烁跳变。文件类型图标区分文件夹、C# / 代码、文本、图片、JSON/YAML 与其它文件。标题行刷新只重新列举当前已展开的目录，并清空探测缓存。Reveal 只在存在真实路径事实时展开祖先并高亮：一次成功的页内预览，或 composer 里落在 `cwd` 下的 `@` workspace-file 芯片；没有事实就不高亮。Reveal 只在目标行尚不存在时滚动定位，因此之后的展开或探测不会把视口拉回旧的 reveal，也就不会把刚点击的行挤出视野。单击文件走 `host.readText`，正文出现在相邻可编辑预览列（CodeMirror 6，经可替换的 text-preview 引擎；后续目标为 Monaco），保存按钮 / Ctrl/Cmd+S 走 `host.writeText`。预览编辑器聚焦时，Ctrl/Cmd+L（以及工具栏或右键「引用到聊天」）把 workspace-file 芯片插入 composer——路径加上选区可选行号范围，从不上传选中正文——与树右键菜单共用同一插入路径。预览外观（预置主题、chrome/语法色覆盖、字号、行高、行号）落在 Host settings 命名空间 `ui-explorer-preview`，经 `theme.overrideTokens` → `ThemePresenter` 发布 `--dsh-editor-*`，并在「通用设置 → 编辑器预览」中编辑。超过 1 MiB 的正文不进编辑器。不再 `window.open`。双击代码文件（`.cs`、`.ts`、`.cpp` 等「代码」类型过滤覆盖的扩展）复刻 Unity 双击脚本的手感：文件经 `host.openPath` 交给 Host 操作系统的默认应用——Unity 开发机上 `.cs` 即 Visual Studio——若工作区根列出了解决方案，再把该解决方案一并交出，让编辑器加载整个工程而不是一个孤立文件。根下与工作区同名的 `.sln` 优先，否则取名称序第一个。先交文件、后交解决方案：冷启动的编辑器由此只占一个窗口，解决方案请求落进同一实例。单击仍只打开页内预览，双击文件夹仍只展开/折叠，交接失败或 `canOpenPath === false` 的部署在树内提示里说明原因。OS 打开同时仍是文件右键菜单。Ctrl/Cmd 与 Shift 多选；复制/剪切/粘贴走 `host.copy` 与 `host.rename`。把文件或文件夹拖到另一个文件夹，语义与剪切粘贴相同（`host.rename`）：不能拖到自身或子孙，Host 错误原文露出，成功后只刷新相关已展开层。本包不占用 `details` 本体，也不做 Git 角标。

非空搜索词调用 `host.searchEntries`，以全工作区模糊排序结果覆盖在文件树之上。结果是叠加层而非替换：文件树始终保持挂载，因此清空搜索词（Escape 或清空输入框）会回到搜索前的展开集合、选中项与滚动位置，搜索过程也不会向 `dsh.explorer.tree.v1` 写入空展开列表。点击结果属于用户主动操作而非重置——目录会清空搜索词并定位自身，文件会打开预览标签，两者都会按需展开祖先目录。Host 枚举会叠加 `.gitignore` 与 `.dshignore`（优先）或 `.cursorignore`，支持 `*`、`**`、根相对路径、目录规则、注释和 `!` 否定；被忽略目录在下钻前即剪枝，因此文件树、搜索结果与 `@` workspace-file 候选保持一致。刷新会重读 ignore 文件，搜索则每次请求都重读。

Host 列出的隐藏项会被省略。没有工作区、空文件夹、列举失败、以及 `canOpenPath === false` 的部署各自有文案；最后一种情况仍可页内预览。

## 模型体验

无，因为本包为人类渲染 Host 文件系统列举，不触及 prompt、消息、schema、流或工具结果。

#### KV Cache effect

无；本包从不组装或发送 provider 请求。

## 已知限制与暂缓事项

- **Git 角标** —— 后续 explorer 工作，且仅当已有 Host Git 状态 RPC。
- **Monaco / 类 VS Code 编辑器** —— 预览编辑经 `TextPreviewEngineProps` 使用 CodeMirror 6；Monaco 是后续引擎替换，不是 v1 依赖。
- **大文件窗口读** —— 超过 1 MiB 的正文在预览列拒绝打开编辑器；尚未实现分段读取。
- **空态探测开销** —— 实心/描边文件夹图标会对每个可见的折叠目录跑一次后台 `host.listEntries`（缓存至刷新或发生变更）；若 Host 提供 `hasChildren`/`childCount` 字段即可省去这些探测调用。
