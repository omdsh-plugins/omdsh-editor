/**
 * `editor` namespace dictionaries.
 *
 * Product names are absent on purpose: "VS Code" and "iTerm2" are what their
 * vendors call them in every language, and they arrive from the host's catalog
 * rather than from here. Only the harness's own words are translated.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'editor'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger.aria': '在编辑器中打开',
  'trigger.menu.aria': '选择编辑器',
  'open': '在 {editor} 中打开',
  'open.in': '在 {editor} 中打开 {path}',
  'opening': '正在启动 {editor}…',
  'loading': '正在查找已安装的编辑器…',
  'empty': '在这台主机上没有找到编辑器',
  'empty.remote': '在运行 dsh 的主机（{platform}）上没有找到编辑器',
  'remote.note': '编辑器会在运行 dsh 的主机上打开',
  'retry': '重试',
  'failed': '打开失败：{reason}',
} satisfies Record<string, string>

/** The editor namespace key union. */
export type EditorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger.aria': 'Open in editor',
  'trigger.menu.aria': 'Choose an editor',
  'open': 'Open in {editor}',
  'open.in': 'Open {path} in {editor}',
  'opening': 'Starting {editor}…',
  'loading': 'Looking for installed editors…',
  'empty': 'No editor found on this machine',
  'empty.remote': 'No editor found on the machine running dsh ({platform})',
  'remote.note': 'Editors open on the machine running dsh',
  'retry': 'Try again',
  'failed': 'Could not open: {reason}',
} satisfies Record<EditorKey, string>
