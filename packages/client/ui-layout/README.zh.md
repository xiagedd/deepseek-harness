# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

外壳插件：三栏 AppFrame（拖动手柄与让步链）加 `ctx.layout` 面板几何服务；它注册到运行时拥有的 `root` slot，并声明 `sidebar`、`conversation`、`details` 和 `conversation.empty`。侧边栏的缩放边界是不可见命中条带，详情栏边界则保留其浮动胶囊；让步期间只有详情栏会收缩并随后自动关闭。关闭的侧边栏仍保留 56px 控制栏，详情栏则关闭到零宽度。该包还提供主题呈现器：它消费解析后的 `ctx.theme` 快照，并将其投影到 document（用 `html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，并将主题的别名 token 设为 body 上的内联变量，同时拥有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新）。在应用调色板和 token 后进行测量，可确保渲染后的背景成为唯一的颜色依据；呈现器在 dispose（资源释放）时会移除其自有的元数据节点，并一并清除其写入的其他全局状态。

AppFrame 始终挂载会话栏和详情栏；已连接 Session 通过 `SessionProvider` 渲染。布局 store 的侧边栏以默认宽度启动，两侧列均保持关闭。它仅把三个列宽（`sidebar`、`details`、`preview`；`0` 表示关闭）以键 `dsh.layout.panels.v1` 持久化到 `localStorage`，因此刷新页面会恢复上次显示的面板版面；而由视口派生的 narrow 一对状态保留在内存中（AppFrame 会依据实时视口重新推导）。首页（当前没有 Session）会把详情栏与预览栏渲染宽度派生为零。任意当前 Session——包括 blank 会话——都可以打开资源管理器（详情栏）与 CM6 预览列；选择不同会话或工作区时这两列保持打开，使每个工作区都具备同一套能力，同时 `ExplorerPanel` 会改绑到新会话的 cwd，浏览态仍按 cwd 分桶。用户手动关闭会作为上次显示的版面被持久化。会话 owner share 为空，侧边栏 owner share 只包含 `collapsed` 和 `width`；注册方通过标准钩子获取业务数据，并从各自的 inject 接口获取操作。

`/client` 导出表层包含插件主体（`apply`／`inject`）、`LayoutController` 和四个 owner-share 接口。AppFrame、面板 store 与让步求解器仍属于包内部。

## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **面板列宽跨刷新持久化，视口一对状态不持久化**：三个列宽以 `dsh.layout.panels.v1` 跨刷新保留（上次显示的版面，包括用户手动关闭的面板），而 `narrow`／`narrowExpanded` 会依据实时视口重新推导。在不同会话／工作区之间切换时，已打开的资源管理器与预览列保持打开；首页（当前没有 Session）仍以零宽度渲染这两列，但不会修改持久化的几何信息。
- **让步链自动关闭通过推导零宽度实现，不会改动宽度偏好**：窗口变宽时面板会自行恢复；消费方禁止把 store 中的详情宽度当作实际渲染状态。
- **挤压重排期间不提供滚动锚定**：布局变化可能移动读者的 viewport。
