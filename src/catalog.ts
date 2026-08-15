/**
 * The applications this plugin knows how to find and how to open a directory
 * in — one table, and the pure rules that turn a row into a command line.
 *
 * A table rather than a probe-anything scan, because "which of these did the
 * user install" is answerable in milliseconds from a handful of `stat` calls,
 * while "what editors exist on this machine" is not answerable at all. The
 * cost is that an editor nobody added here is invisible; the {@link Config}
 * `editors` option is the escape hatch, and adding a row is four lines.
 *
 * Node-free, like [shared](./shared.ts): a row says WHERE to look and WHAT to
 * run, and [detect](./detect.ts) is the only module that touches a disk.
 * @module @omdsh-plugins/omdsh-editor/src/catalog
 */

import type { EditorKind } from './shared.ts'

/** Windows install roots a row may sit under, named by their environment variable. */
export type WindowsRoot = 'localAppData' | 'programFiles' | 'programFilesX86'

/**
 * One way an application may be present. A row lists several, most preferred
 * first, and detection stops at the first that answers — a user with both the
 * VS Code bundle and its `code` shim gets the bundle, which is the one that
 * survives a `PATH` the GUI session never composed.
 */
export type EditorProbe =
  /** A macOS application bundle, looked for under the standard app directories. */
  | { kind: 'mac-app'; bundle: string }
  /** An executable looked up on `PATH` (every platform; `.exe` is appended on Windows). */
  | { kind: 'path-bin'; bin: string }
  /** A Windows executable at a fixed place under one install root. */
  | { kind: 'windows-exe'; root: WindowsRoot; path: string }

/** One catalog row. */
export interface EditorEntry {
  /** Stable identity; what an open request names. */
  id: string
  /** The vendor's own product name. Untranslated — a product name is not copy. */
  label: string
  /** Which glyph the picker draws for it. */
  kind: EditorKind
  /** The product's accent color, as the picker tints that glyph. */
  accent: string
  /** Where to look, most preferred first. */
  probes: readonly EditorProbe[]
  /**
   * Argument template for the executable form, where {@link DIRECTORY_TOKEN}
   * stands for the directory. Absent means "just the directory", which is what
   * every editor's CLI shim already means; present is for the terminals that
   * spell it as a flag. Ignored by the macOS bundle form, where `open` decides.
   */
  args?: readonly string[]
}

/**
 * The placeholder an {@link EditorEntry.args} template puts the directory at.
 * A token rather than an append rule because a flag may need it glued on
 * (`--working-directory=/path`), which appending cannot express.
 */
export const DIRECTORY_TOKEN = '{dir}'

/**
 * Where macOS keeps applications. `/System/…` carries the two Apple entries
 * (Terminal moved to `/System/Applications/Utilities` in Catalina, and Finder
 * has always been in CoreServices), and `~/Applications` is where a per-user
 * install lands.
 */
export const MAC_APP_DIRECTORIES: readonly string[] = [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  '/System/Applications/Utilities',
  '/System/Library/CoreServices',
  '~/Applications',
]

/**
 * The known applications, in the order the picker lists them: editors first
 * (the reason someone opens this menu), then the file manager, then terminals.
 */
export const DEFAULT_CATALOG: readonly EditorEntry[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    kind: 'code',
    accent: '#3b8eea',
    probes: [
      { kind: 'mac-app', bundle: 'Visual Studio Code.app' },
      { kind: 'windows-exe', root: 'localAppData', path: 'Programs/Microsoft VS Code/Code.exe' },
      { kind: 'windows-exe', root: 'programFiles', path: 'Microsoft VS Code/Code.exe' },
      { kind: 'path-bin', bin: 'code' },
    ],
  },
  {
    id: 'vscode-insiders',
    label: 'VS Code Insiders',
    kind: 'code',
    accent: '#2aa15d',
    probes: [
      { kind: 'mac-app', bundle: 'Visual Studio Code - Insiders.app' },
      { kind: 'windows-exe', root: 'localAppData', path: 'Programs/Microsoft VS Code Insiders/Code - Insiders.exe' },
      { kind: 'path-bin', bin: 'code-insiders' },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'code',
    accent: '#a8aab0',
    probes: [
      { kind: 'mac-app', bundle: 'Cursor.app' },
      { kind: 'windows-exe', root: 'localAppData', path: 'Programs/cursor/Cursor.exe' },
      { kind: 'path-bin', bin: 'cursor' },
    ],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    kind: 'code',
    accent: '#12b886',
    probes: [
      { kind: 'mac-app', bundle: 'Windsurf.app' },
      { kind: 'windows-exe', root: 'localAppData', path: 'Programs/Windsurf/Windsurf.exe' },
      { kind: 'path-bin', bin: 'windsurf' },
    ],
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'code',
    accent: '#dd6b20',
    probes: [
      { kind: 'mac-app', bundle: 'Zed.app' },
      { kind: 'path-bin', bin: 'zed' },
    ],
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    kind: 'code',
    accent: '#ff9800',
    probes: [
      { kind: 'mac-app', bundle: 'Sublime Text.app' },
      { kind: 'windows-exe', root: 'programFiles', path: 'Sublime Text/sublime_text.exe' },
      { kind: 'path-bin', bin: 'subl' },
    ],
  },
  {
    id: 'intellij',
    label: 'IntelliJ IDEA',
    kind: 'code',
    accent: '#fe2857',
    probes: [
      { kind: 'mac-app', bundle: 'IntelliJ IDEA.app' },
      { kind: 'mac-app', bundle: 'IntelliJ IDEA CE.app' },
      { kind: 'path-bin', bin: 'idea' },
    ],
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    kind: 'code',
    accent: '#21d789',
    probes: [
      { kind: 'mac-app', bundle: 'PyCharm.app' },
      { kind: 'mac-app', bundle: 'PyCharm CE.app' },
      { kind: 'path-bin', bin: 'pycharm' },
    ],
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    kind: 'code',
    accent: '#07c3f2',
    probes: [
      { kind: 'mac-app', bundle: 'WebStorm.app' },
      { kind: 'path-bin', bin: 'webstorm' },
    ],
  },
  {
    id: 'xcode',
    label: 'Xcode',
    kind: 'code',
    accent: '#1c7ced',
    probes: [{ kind: 'mac-app', bundle: 'Xcode.app' }],
  },
  {
    id: 'finder',
    label: 'Finder',
    kind: 'files',
    accent: '#4aa3ff',
    probes: [{ kind: 'mac-app', bundle: 'Finder.app' }],
  },
  {
    id: 'explorer',
    label: 'File Explorer',
    kind: 'files',
    accent: '#ffc83d',
    // `explorer.exe` lives in the Windows directory, which is on PATH in every
    // session; there is no install root to point at.
    probes: [{ kind: 'path-bin', bin: 'explorer' }],
  },
  {
    id: 'xdg-open',
    label: 'File Manager',
    kind: 'files',
    accent: '#7f8c98',
    probes: [{ kind: 'path-bin', bin: 'xdg-open' }],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    kind: 'terminal',
    accent: '#9aa0a6',
    probes: [{ kind: 'mac-app', bundle: 'Terminal.app' }],
  },
  {
    id: 'iterm2',
    label: 'iTerm2',
    kind: 'terminal',
    accent: '#3ecf5c',
    probes: [{ kind: 'mac-app', bundle: 'iTerm.app' }],
  },
  {
    id: 'warp',
    label: 'Warp',
    kind: 'terminal',
    accent: '#01a4ff',
    probes: [{ kind: 'mac-app', bundle: 'Warp.app' }],
  },
  // The four below are listed by their CLI only, with no bundle probe. Their
  // working directory is a flag rather than a document, and `open -a` has no
  // way to pass one to an instance that is already running — a bundle probe
  // would light the row up and then open the wrong directory, which is worse
  // than the row being absent on a host whose GUI PATH lacks the shim.
  {
    id: 'ghostty',
    label: 'Ghostty',
    kind: 'terminal',
    accent: '#c8b6ff',
    probes: [{ kind: 'path-bin', bin: 'ghostty' }],
    args: [`--working-directory=${DIRECTORY_TOKEN}`],
  },
  {
    id: 'wezterm',
    label: 'WezTerm',
    kind: 'terminal',
    accent: '#4ec9b0',
    probes: [{ kind: 'path-bin', bin: 'wezterm' }],
    args: ['start', '--cwd', DIRECTORY_TOKEN],
  },
  {
    id: 'kitty',
    label: 'kitty',
    kind: 'terminal',
    accent: '#f2b632',
    probes: [{ kind: 'path-bin', bin: 'kitty' }],
    args: ['--directory', DIRECTORY_TOKEN],
  },
  {
    id: 'alacritty',
    label: 'Alacritty',
    kind: 'terminal',
    accent: '#f46d01',
    probes: [{ kind: 'path-bin', bin: 'alacritty' }],
    args: ['--working-directory', DIRECTORY_TOKEN],
  },
]

/** A command line, as {@link EditorEntry} resolution produced it. */
export interface LaunchPlan {
  /** Program to run. Absolute, except for the Windows executables `PATH` answers for. */
  command: string
  /** Its arguments, the directory already among them. */
  args: readonly string[]
}

/**
 * The command that opens one directory in one located application.
 *
 * macOS bundles go through `open -a`, never through the executable inside the
 * bundle: `open` is what asks Launch Services to activate an already-running
 * instance rather than starting a second one, and it is the only way an
 * argument reaches an application that is already up. `--args` is deliberately
 * absent — with `open -a APP DIR` the directory is the document being opened,
 * which is what makes Terminal spawn a shell there and Finder reveal it.
 *
 * Everything else is the executable itself, since a CLI shim already means
 * "open this path".
 * @param entry - the catalog row.
 * @param probe - the probe that answered.
 * @param located - what the probe resolved to (bundle path, or executable path).
 * @param directory - the absolute directory to open.
 * @returns the command line to spawn.
 */
export function planLaunch(
  entry: EditorEntry,
  probe: EditorProbe,
  located: string,
  directory: string,
): LaunchPlan {
  if (probe.kind === 'mac-app') {
    return { command: 'open', args: ['-a', located, directory] }
  }
  const template = entry.args ?? [DIRECTORY_TOKEN]
  return { command: located, args: template.map(arg => arg.replaceAll(DIRECTORY_TOKEN, directory)) }
}
