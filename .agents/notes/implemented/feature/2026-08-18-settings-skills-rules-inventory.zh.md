# Agent Note: Web 设置 Skills 与 Rules 清单页

Status: implemented

[English](2026-08-18-settings-skills-rules-inventory.md) | 中文

## 问题

Web 设置已有 MCP 清单页，但用户无法在 GUI 内列出或编辑产品侧 Skills（文件系统 `SKILL.md`）与 Rules（`AGENTS.md` 兼容指令文件）。

## 决策

交付两个 Host Remote 与两个设置分区，与 MCP 同构：

1. **Skills 权威源** — `@deepseek-ai/dsh-skill-filesystem` 拥有的项目／用户 skill 根（`.dsh/skills`、`.agents/skills`）。Web 禁用 host 侧 `skill-filesystem` Loader 行，因此 `@deepseek-ai/dsh-host-skill-inventory` 直接扫描这些目录。`setModelInvocable` 改写 `disable-model-invocation` frontmatter。编辑通过 `host.openPath` 打开文件。
2. **Rules 权威源** — `@deepseek-ai/dsh-agent-instructions` 的发现逻辑（`$DSH_HOME/AGENTS.md` 以及项目 `AGENTS.md` / `CLAUDE.md` 与本地 overlay）。`@deepseek-ai/dsh-host-rules-inventory` 列出候选，并可在缺失时创建用户全局或项目根 `AGENTS.md`。没有启用开关：文件存在即生效。不是 Cursor 的 `.cursor/rules`。
3. **Client** — `@deepseek-ai/dsh-client-ui-settings-skills`（`settings.section` id `skills`，order 15）与 `@deepseek-ai/dsh-client-ui-settings-rules`（id `rules`，order 16），经 `slots.inject` 挂在 MCP（order 18）旁。

## 考虑过的替代方案

- **仅为设置重新启用 host `skill-filesystem`** — 拒绝：会与 agent 的 preset 层发现重复。
- **复用会话 `skills.list` RPC** — 拒绝：会话作用域、只保留 user-invocable、无路径、不能写 frontmatter。
- **合并为一个 Skills & Rules 分区** — 拒绝：分开展示与 MCP／Ignore 一致，空态更清晰。

## 后果

- 设置导航增加 Skills 与 Rules。
- Skill 模型开关在 preset `skill-filesystem` 下一轮发现后生效。
- Rules 新建写入起步 Markdown；打开走操作系统交接。
- 推迟：skill 新建向导、`user-invocable` 开关、内嵌编辑器、重新启用 web 的 `agent-instructions` 注入。

## 必要验证

- Host 单测：skill 扫描 + frontmatter 改写；rules 列举 + 创建。
- Client vitest：分区注册、列表／开关／打开／新建、空态。
- Client bundle：无 `.cjs` 分片；`require("./` 计数为 0。
