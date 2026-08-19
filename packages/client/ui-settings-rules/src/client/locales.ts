/** Copy dictionaries for the Rules Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: 'Rules',
  title: 'Rules',
  intro: '查看工作区指令文件（AGENTS.md / CLAUDE.md 等）。文件存在即生效；编辑请打开对应文件。',
  loading: '正在读取 Rules…',
  error: '暂时无法读取 Rules。',
  retry: '重试',
  empty: '未发现指令文件。可创建用户全局或项目根 AGENTS.md。',
  noWorkspace: '选择工作区后可列出项目指令；用户全局 AGENTS.md 仍可创建或打开。',
  catalog: '已发现的 Rules',
  scopeUser: '用户全局',
  scopeProject: '项目',
  open: '打开',
  openNamed: '打开 {name}',
  openFailed: '无法打开指令文件。',
  createUser: '新建用户全局 AGENTS.md',
  createProject: '新建项目根 AGENTS.md',
  createFailed: '无法创建 AGENTS.md。',
  effectHint: '权威来源是磁盘上的 AGENTS.md 兼容文件（dsh-agent-instructions），不是 Cursor 的 .cursor/rules。',
} satisfies Record<string, string>

/** Rules settings locale key union. */
export type RulesSettingsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Rules',
  title: 'Rules',
  intro: 'Review workspace instruction files (AGENTS.md / CLAUDE.md, and local overlays). Presence is enablement; edit by opening the file.',
  loading: 'Reading Rules…',
  error: 'Rules are temporarily unavailable.',
  retry: 'Retry',
  empty: 'No instruction files found. Create a user-global or project-root AGENTS.md.',
  noWorkspace: 'Select a workspace to list project instructions; user-global AGENTS.md can still be created or opened.',
  catalog: 'Discovered Rules',
  scopeUser: 'User global',
  scopeProject: 'Project',
  open: 'Open',
  openNamed: 'Open {name}',
  openFailed: 'Could not open the instruction file.',
  createUser: 'Create user-global AGENTS.md',
  createProject: 'Create project-root AGENTS.md',
  createFailed: 'Could not create AGENTS.md.',
  effectHint: 'Authority is on-disk AGENTS.md-compatible files (dsh-agent-instructions), not Cursor .cursor/rules.',
} satisfies Record<RulesSettingsLocaleKey, string>
