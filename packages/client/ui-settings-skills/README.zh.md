# @deepseek-ai/dsh-client-ui-settings-skills

[English](README.md) | 中文

Web GUI 的 **Skills** 设置分区。浏览器插件注册 id 为 `skills`（order 15）的本地化 `settings.section`。打开分区时懒调用 `ctx.remote.skillInventory.list` / `setModelInvocable`，并通过 `ctx.workspaces.openPath` 打开文件。

页面列出项目与用户根下的文件系统 skill，含名称、来源、路径与模型可见性。开关在磁盘上改写 `disable-model-invocation`。空态、加载中与失败态留在已挂载组件本地。

## Model Experience

无。本包只在浏览器设置中可视化并开关 Host 拥有的文件系统 skill，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **没有新建向导** — 新增 skill 仍需在 skill 根下编辑文件。
- **没有 `user-invocable` 开关** — 与 Host 清单一并推迟。
