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

import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import {
  DEFAULT_CATALOG, MAC_APP_DIRECTORIES, planLaunch,
  type EditorEntry, type EditorProbe, type LaunchPlan, type WindowsRoot,
} from './catalog.ts'
import type { EditorDescriptor } from './shared.ts'

/** The host facts detection reads, named so a spec can supply them all. */
export interface DetectionEnv {
  /** `process.platform`. */
  platform: string
  /** Directories macOS application bundles are looked for in, `~` already expanded. */
  appDirectories: readonly string[]
  /** `PATH` entries, in order. */
  pathEntries: readonly string[]
  /** Windows install roots, absent where the environment did not name one. */
  windowsRoots: Partial<Record<WindowsRoot, string>>
  /**
   * Whether one absolute path names something that exists.
   * @param path - the candidate.
   * @returns true when it is there.
   */
  exists: (path: string) => Promise<boolean>
  /**
   * Whether one absolute path names a file this process may execute.
   * @param path - the candidate.
   * @returns true when it is executable.
   */
  executable: (path: string) => Promise<boolean>
}

/** One installed application: what the picker shows, and what opening it runs. */
export interface DetectedEditor {
  /** The catalog row that matched. */
  entry: EditorEntry
  /** The probe that answered — which decides the launch form. */
  probe: EditorProbe
  /** What that probe resolved to: a bundle path, or an executable path. */
  located: string
}

/** File extensions Windows treats as directly executable, in `PATHEXT` order. */
const WINDOWS_EXECUTABLE_SUFFIXES: readonly string[] = ['.exe', '.cmd', '.bat', '.com']

/**
 * How long one detection sweep stays fresh. Short enough that installing an
 * editor while the harness runs shows up without a restart, long enough that
 * one interaction with the picker never probes the disk twice.
 */
export const DETECTION_TTL_MS = 15_000

/**
 * Expand a leading `~` against the user's home directory.
 * @param path - a configured or catalog path.
 * @param home - the home directory to expand against.
 * @returns the absolute path.
 */
export function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}

/**
 * The real host's detection facts.
 * @param env - process environment (`process.env` in production).
 * @param platform - `process.platform`.
 * @returns the environment {@link detectEditors} probes against.
 */
export function hostEnv(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): DetectionEnv {
  const home = homedir()
  return {
    platform,
    appDirectories: MAC_APP_DIRECTORIES.map(directory => expandHome(directory, home)),
    pathEntries: (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter(entry => entry !== ''),
    windowsRoots: {
      ...env['LOCALAPPDATA'] === undefined ? {} : { localAppData: env['LOCALAPPDATA'] },
      ...env['ProgramFiles'] === undefined ? {} : { programFiles: env['ProgramFiles'] },
      ...env['ProgramFiles(x86)'] === undefined ? {} : { programFilesX86: env['ProgramFiles(x86)'] },
    },
    exists: async (path) => {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    },
    executable: async (path) => {
      try {
        // X_OK is advisory on Windows (every readable file reports executable),
        // which is why the Windows branch filters by suffix before asking.
        await access(path, constants.X_OK)
        return (await stat(path)).isFile()
      } catch {
        return false
      }
    },
  }
}

/**
 * Resolve one probe against the host.
 * @param probe - the probe to try.
 * @param env - the host facts.
 * @returns what it resolved to, or undefined when this host does not have it.
 */
async function locate(probe: EditorProbe, env: DetectionEnv): Promise<string | undefined> {
  if (probe.kind === 'mac-app') {
    // A bundle probe is meaningless off macOS: `open -a` is the launch form,
    // and no other platform has it.
    if (env.platform !== 'darwin') return undefined
    for (const directory of env.appDirectories) {
      const candidate = join(directory, probe.bundle)
      if (await env.exists(candidate)) return candidate
    }
    return undefined
  }
  if (probe.kind === 'windows-exe') {
    if (env.platform !== 'win32') return undefined
    const root = env.windowsRoots[probe.root]
    if (root === undefined) return undefined
    const candidate = join(root, probe.path)
    return await env.exists(candidate) ? candidate : undefined
  }
  const suffixes = env.platform === 'win32' ? WINDOWS_EXECUTABLE_SUFFIXES : ['']
  for (const directory of env.pathEntries) {
    for (const suffix of suffixes) {
      const candidate = join(directory, probe.bin + suffix)
      if (await env.executable(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * The first probe of one row that this host answers.
 * @param entry - the catalog row.
 * @param env - the host facts.
 * @returns the match, or undefined when the row is not installed.
 */
export async function detectEntry(entry: EditorEntry, env: DetectionEnv): Promise<DetectedEditor | undefined> {
  for (const probe of entry.probes) {
    const located = await locate(probe, env)
    if (located !== undefined) return { entry, probe, located }
  }
  return undefined
}

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
export async function detectEditors(
  env: DetectionEnv,
  catalog: readonly EditorEntry[] = DEFAULT_CATALOG,
): Promise<DetectedEditor[]> {
  const found = await Promise.all(catalog.map(entry => detectEntry(entry, env)))
  return found.filter((editor): editor is DetectedEditor => editor !== undefined)
}

/**
 * The wire projection of a detected row: what the picker renders, with the
 * host paths left behind.
 * @param editor - the detection result.
 * @returns the descriptor the browser half receives.
 */
export function describe(editor: DetectedEditor): EditorDescriptor {
  const { id, label, kind, accent } = editor.entry
  // Only a macOS bundle carries an icon this plugin knows how to read. Saying
  // so here is what keeps the picker from requesting one per row on a host
  // where every request would 404.
  return { id, label, kind, accent, icon: editor.probe.kind === 'mac-app' }
}

/**
 * The command that opens one directory in one detected application.
 * @param editor - the detection result.
 * @param directory - the absolute directory to open.
 * @returns the command line to spawn.
 */
export function planFor(editor: DetectedEditor, directory: string): LaunchPlan {
  return planLaunch(editor.entry, editor.probe, editor.located, directory)
}

/**
 * A detection sweep held for a while, so opening the menu twice is one sweep.
 *
 * The cache has a life rather than being permanent because installing an
 * editor while the harness runs is ordinary, and "restart the runtime to see
 * Cursor" is not an answer anyone should have to be given. A few seconds is
 * long enough that the menu never re-probes within one interaction.
 */
export class EditorRegistry {
  private cached: { at: number; editors: DetectedEditor[] } | undefined
  private inFlight: Promise<DetectedEditor[]> | undefined

  private readonly ttlMs: number

  /**
   * @param env - the host facts to probe against.
   * @param catalog - the rows to probe.
   * @param ttlMs - how long a sweep stays fresh; `undefined` takes the default.
   * @param now - clock, injectable for specs.
   */
  constructor(
    private readonly env: DetectionEnv,
    private readonly catalog: readonly EditorEntry[] = DEFAULT_CATALOG,
    ttlMs: number | undefined = undefined,
    private readonly now: () => number = Date.now,
  ) {
    this.ttlMs = ttlMs ?? DETECTION_TTL_MS
  }

  /**
   * The installed applications, swept at most once per TTL.
   * @returns every installed row, in catalog order.
   */
  async list(): Promise<DetectedEditor[]> {
    const cached = this.cached
    if (cached !== undefined && this.now() - cached.at < this.ttlMs) return cached.editors
    // Concurrent callers share one sweep: the picker's list request and an
    // open posted straight after it would otherwise probe the disk twice.
    this.inFlight ??= detectEditors(this.env, this.catalog).then((editors) => {
      this.cached = { at: this.now(), editors }
      this.inFlight = undefined
      return editors
    }, (error: unknown) => {
      this.inFlight = undefined
      throw error
    })
    return this.inFlight
  }

  /**
   * One installed application by id.
   * @param id - {@link EditorEntry.id}.
   * @returns the detection result, or undefined when this host does not have it.
   */
  async find(id: string): Promise<DetectedEditor | undefined> {
    return (await this.list()).find(editor => editor.entry.id === id)
  }

  /** Drop the cached sweep, so the next list re-probes. */
  invalidate(): void {
    this.cached = undefined
  }
}

/**
 * Whether a path is one this plugin may hand to an editor.
 * @param path - the candidate directory.
 * @returns the resolved absolute path, or undefined when it is not absolute.
 */
export function normalizeDirectory(path: string): string | undefined {
  if (!isAbsolute(path)) return undefined
  return resolve(path)
}
