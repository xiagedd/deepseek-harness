# @deepseek-ai/dsh-client-ui-settings-ignore

[English](README.md) | 中文

Web GUI 的 **忽略规则** 设置分区。浏览器插件向 [`ui-settings`](../ui-settings/README.md) 拥有的设置壳注册一个 id 为 `ignore`（order 19，紧挨 MCP）的本地化 `settings.section` 贡献。打开该分区时，解析当前工作区根（优先活动会话 `cwd`，否则最近工作区路径），并通过现有 `host.readText` 读取该根下的 `.dshignore`。保存经 `host.writeText` 写回同一绝对路径。

`.dshignore` 不存在时编辑器保持为空，并提示保存将新建。仅有 `.cursorignore` 时显示兼容提示；Host 的 list/search 已优先 `.dshignore`、否则回退 `.cursorignore`，且下次请求会重读（`writeText` 也会失效搜索索引），无需重启 Host。

## Model Experience

无。本包只在浏览器设置中编辑工作区 ignore 文件，不注册任何面向模型的内容。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **无可视化规则构建器** — 页面是多行文本编辑器，不是按行 GUI 矩阵。
- **一次一个根** — 编辑器只针对当前会话或最近工作区；多根选择器延后。
