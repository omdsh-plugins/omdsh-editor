/**
 * Which catalog rows this host actually has.
 *
 * Detection is a `stat` per probe and nothing more — no `mdfind`, no registry
 * read, no shelling out. That keeps the whole sweep inside a few milliseconds,
 * which is what lets the picker be a plain list the user opens rather than a
 * dialog they wait on.
 *
 * Every filesystem fact this module needs arrives through {@link DetectionEnv},
 * so a spec drives the entire matrix — macOS bundles, Windows install roots, a
 * bare Linux `PATH` — without a fixture tree on disk.
 * @module @omdsh-plugins/omdsh-editor/src/detect
 */
import { type EditorEntry, type EditorProbe, type LaunchPlan, type WindowsRoot } from './catalog.ts';
import type { EditorDescriptor } from './shared.ts';
/** The host facts detection reads, named so a spec can supply them all. */
export interface DetectionEnv {
    /** `process.platform`. */
    platform: string;
    /** Directories macOS application bundles are looked for in, `~` already expanded. */
    appDirectories: readonly string[];
    /** `PATH` entries, in order. */
    pathEntries: readonly string[];
    /** Windows install roots, absent where the environment did not name one. */
    windowsRoots: Partial<Record<WindowsRoot, string>>;
    /**
     * Whether one absolute path names something that exists.
     * @param path - the candidate.
     * @returns true when it is there.
     */
    exists: (path: string) => Promise<boolean>;
    /**
     * Whether one absolute path names a file this process may execute.
     * @param path - the candidate.
     * @returns true when it is executable.
     */
    executable: (path: string) => Promise<boolean>;
}
/** One installed application: what the picker shows, and what opening it runs. */
export interface DetectedEditor {
    /** The catalog row that matched. */
    entry: EditorEntry;
    /** The probe that answered — which decides the launch form. */
    probe: EditorProbe;
    /** What that probe resolved to: a bundle path, or an executable path. */
    located: string;
}
/**
 * How long one detection sweep stays fresh. Short enough that installing an
 * editor while the harness runs shows up without a restart, long enough that
 * one interaction with the picker never probes the disk twice.
 */
export declare const DETECTION_TTL_MS = 15000;
/**
 * Expand a leading `~` against the user's home directory.
 * @param path - a configured or catalog path.
 * @param home - the home directory to expand against.
 * @returns the absolute path.
 */
export declare function expandHome(path: string, home: string): string;
/**
 * The real host's detection facts.
 * @param env - process environment (`process.env` in production).
 * @param platform - `process.platform`.
 * @returns the environment {@link detectEditors} probes against.
 */
export declare function hostEnv(env?: NodeJS.ProcessEnv, platform?: string): DetectionEnv;
/**
 * The first probe of one row that this host answers.
 * @param entry - the catalog row.
 * @param env - the host facts.
 * @returns the match, or undefined when the row is not installed.
 */
export declare function detectEntry(entry: EditorEntry, env: DetectionEnv): Promise<DetectedEditor | undefined>;
/**
 * Sweep a catalog against one host.
 *
 * Rows are probed concurrently — they are independent `stat` calls, and the
 * sweep's latency is what the user waits on the first time the menu opens —
 * and the result keeps the catalog's own order, so the list is stable across
 * hosts rather than ordered by who answered first.
 * @param env - the host facts.
 * @param catalog - the rows to probe; the shipped table by default.
 * @returns every installed row, in catalog order.
 */
export declare function detectEditors(env: DetectionEnv, catalog?: readonly EditorEntry[]): Promise<DetectedEditor[]>;
/**
 * The wire projection of a detected row: what the picker renders, with the
 * host paths left behind.
 * @param editor - the detection result.
 * @returns the descriptor the browser half receives.
 */
export declare function describe(editor: DetectedEditor): EditorDescriptor;
/**
 * The command that opens one directory in one detected application.
 * @param editor - the detection result.
 * @param directory - the absolute directory to open.
 * @returns the command line to spawn.
 */
export declare function planFor(editor: DetectedEditor, directory: string): LaunchPlan;
/**
 * A detection sweep held for a while, so opening the menu twice is one sweep.
 *
 * The cache has a life rather than being permanent because installing an
 * editor while the harness runs is ordinary, and "restart the runtime to see
 * Cursor" is not an answer anyone should have to be given. A few seconds is
 * long enough that the menu never re-probes within one interaction.
 */
export declare class EditorRegistry {
    private readonly env;
    private readonly catalog;
    private readonly now;
    private cached;
    private inFlight;
    private readonly ttlMs;
    /**
     * @param env - the host facts to probe against.
     * @param catalog - the rows to probe.
     * @param ttlMs - how long a sweep stays fresh; `undefined` takes the default.
     * @param now - clock, injectable for specs.
     */
    constructor(env: DetectionEnv, catalog?: readonly EditorEntry[], ttlMs?: number | undefined, now?: () => number);
    /**
     * The installed applications, swept at most once per TTL.
     * @returns every installed row, in catalog order.
     */
    list(): Promise<DetectedEditor[]>;
    /**
     * One installed application by id.
     * @param id - {@link EditorEntry.id}.
     * @returns the detection result, or undefined when this host does not have it.
     */
    find(id: string): Promise<DetectedEditor | undefined>;
    /** Drop the cached sweep, so the next list re-probes. */
    invalidate(): void;
}
/**
 * Whether a path is one this plugin may hand to an editor.
 * @param path - the candidate directory.
 * @returns the resolved absolute path, or undefined when it is not absolute.
 */
export declare function normalizeDirectory(path: string): string | undefined;
//# sourceMappingURL=detect.d.ts.map