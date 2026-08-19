/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'restartWeb.title': '重启 Web 服务',
  'restartWeb.description': '结束当前 Host 并在同一端口拉起新进程。服务会中断数秒。',
  'restartWeb.button': '重启 Web 服务',
  'restartWeb.confirmTitle': '重启 Web 服务？',
  'restartWeb.confirmDescription': '当前页面会断开数秒。成功后请硬刷新（Ctrl+Shift+R）。只会结束匹配本仓库 dsh web 启动方式的进程。',
  'restartWeb.acknowledge': '我了解服务会中断，并会在完成后硬刷新',
  'restartWeb.confirm': '重启',
  'restartWeb.cancel': '取消',
  'restartWeb.waiting': '正在等待新服务…',
  'restartWeb.error.timeout': '等待新服务超时，端口可能仍被占用。请查看仓库根的 .dsh-web-*.err.log，或在终端运行 pnpm run web:restart。',
  'restartWeb.error.unavailable': '当前服务还没有重启入口。请先在终端运行 pnpm run web:restart，之后即可用此按钮。',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'restartWeb.title': 'Restart Web',
  'restartWeb.description': 'Stop this Host and start a new process on the same port. The service will be down for a few seconds.',
  'restartWeb.button': 'Restart Web',
  'restartWeb.confirmTitle': 'Restart Web?',
  'restartWeb.confirmDescription': 'This page will disconnect for a few seconds. After it recovers, hard-refresh (Ctrl+Shift+R). Only listeners that match this repo\'s dsh web launch are stopped.',
  'restartWeb.acknowledge': 'I understand the service will stop, and I will hard-refresh afterwards',
  'restartWeb.confirm': 'Restart',
  'restartWeb.cancel': 'Cancel',
  'restartWeb.waiting': 'Waiting for the new server…',
  'restartWeb.error.timeout': 'Timed out waiting for the new server. The port may still be in use. Check .dsh-web-*.err.log at the repo root, or run pnpm run web:restart in a terminal.',
  'restartWeb.error.unavailable': 'This Host does not yet expose restart. Run pnpm run web:restart in a terminal once; afterwards this button works.',
} satisfies Record<SettingsKey, string>
