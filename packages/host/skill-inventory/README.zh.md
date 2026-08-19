# @deepseek-ai/dsh-host-skill-inventory

[English](README.md) | 中文

面向 Web 设置中文件系统 skill 的 Host Remote。`SkillInventoryGateway` 注册 `skillInventory` 服务，并发布 `skillInventory/list` 与 `skillInventory/setModelInvocable`。列举扫描与 `@deepseek-ai/dsh-skill-filesystem` 相同的项目与用户根（`<project>/.dsh/skills`、`<project>/.agents/skills`、`$DSH_HOME/skills`、`$DSH_AGENTS_HOME/skills`），但不挂载该提供方——因为 web profile 禁用了 host 侧 `skill-filesystem` 行，而 preset 仍会为 agent 发现这些目录。

`setModelInvocable` 改写 skill 文件 YAML frontmatter 中的 `disable-model-invocation` 并重新扫描。只接受在给定 cwd 下由最近一次 list 返回的路径。运行时或非文件 skill 不在本清单内。

公开 payload 类型位于 `./types`。Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

## Model Experience

无。本包是仅 Host 侧的清单投影，不注册任何提示词、工具、消息或提供方请求。

#### KV Cache effect

无；本包从不组装模型输入。

## Known Limitations and Deferred Work

- **没有新建向导** — 新增 skill 仍需在 skill 根下创建 `SKILL.md` 或扁平 `.md`。
- **没有 `user-invocable` 开关** — 设置页只切换面向模型的启用；面向人的命令策略仍写在 frontmatter。
- **web 上 host 提供方仍禁用** — agent 仍通过 preset 挂载的 `skill-filesystem` 发现 skill；本 Remote 只读写共享目录。
