/** Copy dictionaries for the Skills Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: 'Skills',
  title: 'Skills',
  intro: '查看项目与用户目录下的 skill，并开关其对模型目录的可见性。开关会改写 skill 文件 frontmatter 中的 disable-model-invocation。',
  loading: '正在读取 Skills…',
  error: '暂时无法读取 Skills。',
  retry: '重试',
  empty: '未发现任何 skill。可在工作区 .dsh/skills 或 ~/.dsh/skills 下添加 SKILL.md。',
  noWorkspace: '选择工作区后可列出项目 skill；用户全局 skill 仍会显示。',
  catalog: '已发现的 Skills',
  source: '来源',
  modelOn: '模型可见',
  modelOff: '模型隐藏',
  enable: '对模型启用 {name}',
  disable: '对模型禁用 {name}',
  open: '打开',
  openNamed: '打开 {name}',
  openFailed: '无法打开 skill 文件。',
  toggleFailed: '无法更新模型可见性。',
  effectHint: '开关写入磁盘后，下一轮 agent 发现会看到新状态（web 上由 preset 的 skill-filesystem 加载）。',
} satisfies Record<string, string>

/** Skills settings locale key union. */
export type SkillsSettingsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Skills',
  title: 'Skills',
  intro: 'Review project and user skills and toggle model-catalog visibility. Toggles rewrite disable-model-invocation in the skill file frontmatter.',
  loading: 'Reading Skills…',
  error: 'Skills are temporarily unavailable.',
  retry: 'Retry',
  empty: 'No skills found. Add SKILL.md under workspace .dsh/skills or ~/.dsh/skills.',
  noWorkspace: 'Select a workspace to list project skills; user-global skills still appear.',
  catalog: 'Discovered Skills',
  source: 'Source',
  modelOn: 'Model-visible',
  modelOff: 'Hidden from model',
  enable: 'Enable {name} for the model',
  disable: 'Disable {name} for the model',
  open: 'Open',
  openNamed: 'Open {name}',
  openFailed: 'Could not open the skill file.',
  toggleFailed: 'Could not update model visibility.',
  effectHint: 'After the write, the next agent discovery sees the new state (web loads skills via preset skill-filesystem).',
} satisfies Record<SkillsSettingsLocaleKey, string>
