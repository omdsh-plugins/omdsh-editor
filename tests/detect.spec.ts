/** Detection: which catalog rows a host answers, and how a sweep is cached. */

import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CATALOG, EditorRegistry, describe as describeEditor, detectEditors, detectEntry, expandHome,
  normalizeDirectory, planFor,
} from '../src/index.ts'
import type { DetectionEnv, EditorEntry } from '../src/index.ts'

/**
 * A host with a fixed set of paths present.
 * @param present - the paths that exist; executables are also executable.
 * @param overrides - anything else about the host.
 * @returns the detection environment.
 */
function host(present: readonly string[], overrides: Partial<DetectionEnv> = {}): DetectionEnv {
  const set = new Set(present)
  return {
    platform: 'darwin',
    appDirectories: ['/Applications', '/System/Applications/Utilities'],
    pathEntries: ['/usr/local/bin', '/usr/bin'],
    windowsRoots: {},
    exists: path => Promise.resolve(set.has(path)),
    executable: path => Promise.resolve(set.has(path)),
    ...overrides,
  }
}

const VSCODE = DEFAULT_CATALOG.find(entry => entry.id === 'vscode') as EditorEntry
const GHOSTTY = DEFAULT_CATALOG.find(entry => entry.id === 'ghostty') as EditorEntry

describe('expandHome', () => {
  it('expands a leading tilde and leaves everything else alone', () => {
    expect(expandHome('~/Applications', '/Users/ada')).toBe('/Users/ada/Applications')
    expect(expandHome('~', '/Users/ada')).toBe('/Users/ada')
    expect(expandHome('/Applications', '/Users/ada')).toBe('/Applications')
    // A path that merely starts with the character is not a home reference.
    expect(expandHome('~notauser/bin', '/Users/ada')).toBe('~notauser/bin')
  })
})

describe('detectEntry', () => {
  it('finds a macOS bundle in the app search path', async () => {
    const found = await detectEntry(VSCODE, host(['/Applications/Visual Studio Code.app']))
    expect(found?.located).toBe('/Applications/Visual Studio Code.app')
    expect(found?.probe.kind).toBe('mac-app')
  })

  it('prefers the bundle over the CLI shim when the host has both', async () => {
    const found = await detectEntry(VSCODE, host([
      '/usr/local/bin/code',
      '/Applications/Visual Studio Code.app',
    ]))
    // The bundle survives a GUI session whose PATH never ran the user's
    // profile, which is why it is listed first and must win.
    expect(found?.probe.kind).toBe('mac-app')
  })

  it('falls back to the CLI shim when the bundle is absent', async () => {
    const found = await detectEntry(VSCODE, host(['/usr/local/bin/code']))
    expect(found?.located).toBe('/usr/local/bin/code')
    expect(found?.probe.kind).toBe('path-bin')
  })

  it('reports nothing when no probe answers', async () => {
    expect(await detectEntry(VSCODE, host([]))).toBeUndefined()
  })

  it('ignores bundle probes off macOS', async () => {
    const linux = host(['/Applications/Visual Studio Code.app'], { platform: 'linux' })
    expect(await detectEntry(VSCODE, linux)).toBeUndefined()
  })

  it('ignores a PATH entry that exists but is not executable', async () => {
    const notExecutable = host([], {
      exists: () => Promise.resolve(true),
      executable: () => Promise.resolve(false),
    })
    expect(await detectEntry(GHOSTTY, notExecutable)).toBeUndefined()
  })

  it('finds a Windows executable under its install root', async () => {
    const windows = host(['C:\\Users\\ada\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'.replaceAll('\\', '/')], {
      platform: 'win32',
      windowsRoots: { localAppData: 'C:/Users/ada/AppData/Local' },
      pathEntries: [],
    })
    const found = await detectEntry(VSCODE, windows)
    expect(found?.probe.kind).toBe('windows-exe')
  })

  it('appends a Windows executable suffix when probing PATH', async () => {
    const windows = host(['C:/tools/code.exe'], {
      platform: 'win32',
      pathEntries: ['C:/tools'],
      windowsRoots: {},
    })
    const found = await detectEntry(VSCODE, windows)
    expect(found?.located).toBe('C:/tools/code.exe')
  })

  it('skips a Windows root the environment never named', async () => {
    const windows = host(['C:/Program Files/Microsoft VS Code/Code.exe'], {
      platform: 'win32',
      windowsRoots: {},
      pathEntries: [],
    })
    expect(await detectEntry(VSCODE, windows)).toBeUndefined()
  })
})

describe('detectEditors', () => {
  it('keeps catalog order rather than answer order', async () => {
    // iTerm sits near the end of the catalog and Cursor near the front; both
    // are present, so the result must not be ordered by who resolved first.
    const found = await detectEditors(host([
      '/Applications/iTerm.app',
      '/Applications/Cursor.app',
    ]))
    expect(found.map(editor => editor.entry.id)).toStrictEqual(['cursor', 'iterm2'])
  })

  it('reports an empty list on a host with nothing installed', async () => {
    expect(await detectEditors(host([]))).toStrictEqual([])
  })
})

describe('describe', () => {
  it('projects a detection to the wire without the host path', async () => {
    const found = await detectEntry(VSCODE, host(['/Applications/Visual Studio Code.app']))
    const wire = describeEditor(found as NonNullable<typeof found>)
    expect(wire).toStrictEqual({ id: 'vscode', label: 'VS Code', kind: 'code', accent: VSCODE.accent, icon: true })
    expect(JSON.stringify(wire)).not.toContain('/Applications')
  })
})

describe('planFor', () => {
  it('opens a macOS bundle through Launch Services', async () => {
    const found = await detectEntry(VSCODE, host(['/Applications/Visual Studio Code.app']))
    expect(planFor(found as NonNullable<typeof found>, '/w/proj')).toStrictEqual({
      command: 'open',
      args: ['-a', '/Applications/Visual Studio Code.app', '/w/proj'],
    })
  })

  it('runs a CLI shim with the directory as its only argument', async () => {
    const found = await detectEntry(VSCODE, host(['/usr/local/bin/code']))
    expect(planFor(found as NonNullable<typeof found>, '/w/proj')).toStrictEqual({
      command: '/usr/local/bin/code',
      args: ['/w/proj'],
    })
  })

  it('substitutes the directory into an argument template', async () => {
    const found = await detectEntry(GHOSTTY, host(['/usr/local/bin/ghostty']))
    expect(planFor(found as NonNullable<typeof found>, '/w/proj')).toStrictEqual({
      command: '/usr/local/bin/ghostty',
      args: ['--working-directory=/w/proj'],
    })
  })

  it('passes a directory containing shell metacharacters as one argument', async () => {
    const found = await detectEntry(VSCODE, host(['/usr/local/bin/code']))
    const nasty = '/w/a b; rm -rf ~'
    expect(planFor(found as NonNullable<typeof found>, nasty).args).toStrictEqual([nasty])
  })
})

describe('EditorRegistry', () => {
  it('sweeps once inside the TTL and again after it', async () => {
    const exists = vi.fn(() => Promise.resolve(true))
    let clock = 1000
    const registry = new EditorRegistry(
      host([], { exists, executable: () => Promise.resolve(false) }),
      [VSCODE],
      5_000,
      () => clock,
    )

    await registry.list()
    const firstSweep = exists.mock.calls.length
    expect(firstSweep).toBeGreaterThan(0)

    clock += 4_999
    await registry.list()
    expect(exists.mock.calls.length).toBe(firstSweep)

    clock += 2
    await registry.list()
    expect(exists.mock.calls.length).toBeGreaterThan(firstSweep)
  })

  it('shares one sweep between concurrent callers', async () => {
    let sweeps = 0
    const registry = new EditorRegistry(
      host([], {
        exists: () => {
          sweeps += 1
          return Promise.resolve(false)
        },
        executable: () => Promise.resolve(false),
      }),
      [VSCODE],
    )
    await Promise.all([registry.list(), registry.list(), registry.list()])
    // One probe per bundle directory, from one sweep — not three sweeps' worth.
    expect(sweeps).toBe(2)
  })

  it('finds an installed row by id and misses an absent one', async () => {
    const registry = new EditorRegistry(host(['/Applications/Visual Studio Code.app']), [VSCODE])
    expect((await registry.find('vscode'))?.entry.id).toBe('vscode')
    expect(await registry.find('cursor')).toBeUndefined()
  })

  it('re-probes after the cache is invalidated', async () => {
    const present = new Set<string>()
    const registry = new EditorRegistry(
      host([], {
        exists: path => Promise.resolve(present.has(path)),
        executable: () => Promise.resolve(false),
      }),
      [VSCODE],
    )
    expect(await registry.list()).toStrictEqual([])
    present.add('/Applications/Visual Studio Code.app')
    registry.invalidate()
    expect((await registry.list()).map(editor => editor.entry.id)).toStrictEqual(['vscode'])
  })

  it('does not cache a failed sweep', async () => {
    let attempt = 0
    const registry = new EditorRegistry(
      host([], {
        exists: () => {
          attempt += 1
          return attempt === 1 ? Promise.reject(new Error('EIO')) : Promise.resolve(false)
        },
        executable: () => Promise.resolve(false),
      }),
      [VSCODE],
    )
    await expect(registry.list()).rejects.toThrow('EIO')
    // A rejected sweep must leave nothing behind, or the registry answers
    // every later call from a promise that already failed.
    await expect(registry.list()).resolves.toStrictEqual([])
  })
})

describe('normalizeDirectory', () => {
  it('resolves an absolute path and refuses a relative one', () => {
    expect(normalizeDirectory('/w/proj/../proj')).toBe('/w/proj')
    expect(normalizeDirectory('proj')).toBeUndefined()
    expect(normalizeDirectory('')).toBeUndefined()
  })
})
