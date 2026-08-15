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
import type { EditorKind } from './shared.ts';
/** Windows install roots a row may sit under, named by their environment variable. */
export type WindowsRoot = 'localAppData' | 'programFiles' | 'programFilesX86';
/**
 * One way an application may be present. A row lists several, most preferred
 * first, and detection stops at the first that answers — a user with both the
 * VS Code bundle and its `code` shim gets the bundle, which is the one that
 * survives a `PATH` the GUI session never composed.
 */
export type EditorProbe = 
/** A macOS application bundle, looked for under the standard app directories. */
{
    kind: 'mac-app';
    bundle: string;
}
/** An executable looked up on `PATH` (every platform; `.exe` is appended on Windows). */
 | {
    kind: 'path-bin';
    bin: string;
}
/** A Windows executable at a fixed place under one install root. */
 | {
    kind: 'windows-exe';
    root: WindowsRoot;
    path: string;
};
/** One catalog row. */
export interface EditorEntry {
    /** Stable identity; what an open request names. */
    id: string;
    /** The vendor's own product name. Untranslated — a product name is not copy. */
    label: string;
    /** Which glyph the picker draws for it. */
    kind: EditorKind;
    /** The product's accent color, as the picker tints that glyph. */
    accent: string;
    /** Where to look, most preferred first. */
    probes: readonly EditorProbe[];
    /**
     * Argument template for the executable form, where {@link DIRECTORY_TOKEN}
     * stands for the directory. Absent means "just the directory", which is what
     * every editor's CLI shim already means; present is for the terminals that
     * spell it as a flag. Ignored by the macOS bundle form, where `open` decides.
     */
    args?: readonly string[];
}
/**
 * The placeholder an {@link EditorEntry.args} template puts the directory at.
 * A token rather than an append rule because a flag may need it glued on
 * (`--working-directory=/path`), which appending cannot express.
 */
export declare const DIRECTORY_TOKEN = "{dir}";
/**
 * Where macOS keeps applications. `/System/…` carries the two Apple entries
 * (Terminal moved to `/System/Applications/Utilities` in Catalina, and Finder
 * has always been in CoreServices), and `~/Applications` is where a per-user
 * install lands.
 */
export declare const MAC_APP_DIRECTORIES: readonly string[];
/**
 * The known applications, in the order the picker lists them: editors first
 * (the reason someone opens this menu), then the file manager, then terminals.
 */
export declare const DEFAULT_CATALOG: readonly EditorEntry[];
/** A command line, as {@link EditorEntry} resolution produced it. */
export interface LaunchPlan {
    /** Program to run. Absolute, except for the Windows executables `PATH` answers for. */
    command: string;
    /** Its arguments, the directory already among them. */
    args: readonly string[];
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
export declare function planLaunch(entry: EditorEntry, probe: EditorProbe, located: string, directory: string): LaunchPlan;
//# sourceMappingURL=catalog.d.ts.map