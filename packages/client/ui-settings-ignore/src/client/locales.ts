/** Copy dictionaries for the Ignore Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '忽略规则',
  title: '忽略规则',
  intro: '编辑当前工作区根目录的 .dshignore。规则对文件树、搜索与 @ 文件候选生效；保存后下次列举或搜索即生效，无需重启。',
  syntaxHint: '语法与 gitignore 相同：例如 *.meta、Library/、# 注释、! 否定。',
  loading: '正在读取忽略规则…',
  error: '暂时无法读取忽略规则。',
  retry: '重试',
  noWorkspace: '尚未选择工作区。请先添加并选中一个工作区，再编辑忽略规则。',
  missingHint: '尚未创建 .dshignore，保存将新建该文件。',
  cursorHint: '当前兼容读取 .cursorignore；保存将创建 .dshignore。',
  pathLabel: '文件',
  editorLabel: '.dshignore 内容',
  save: '保存',
  saving: '正在保存…',
  saved: '已保存。',
  saveFailed: '保存失败。',
} satisfies Record<string, string>

/** Ignore settings locale key union. */
export type IgnoreSettingsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Ignore',
  title: 'Ignore',
  intro: 'Edit .dshignore at the current workspace root. Rules apply to the file tree, search, and @ file candidates. Saves take effect on the next list or search — no restart required.',
  syntaxHint: 'Same syntax as gitignore: for example *.meta, Library/, # comments, and ! negation.',
  loading: 'Reading ignore rules…',
  error: 'Ignore rules are temporarily unavailable.',
  retry: 'Retry',
  noWorkspace: 'No workspace is selected yet. Add and select a workspace before editing ignore rules.',
  missingHint: '.dshignore does not exist yet; saving will create it.',
  cursorHint: 'Currently reading .cursorignore for compatibility; saving will create .dshignore.',
  pathLabel: 'File',
  editorLabel: '.dshignore contents',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
  saveFailed: 'Could not save.',
} satisfies Record<IgnoreSettingsLocaleKey, string>
