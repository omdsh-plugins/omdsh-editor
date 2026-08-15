/**
 * The catalog's own consistency. Nothing here probes a disk — these are the
 * rules a new row has to keep, checked at the one place adding a row is easy
 * to get subtly wrong.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG, DIRECTORY_TOKEN, MAC_APP_DIRECTORIES, planLaunch } from '../src/index.ts'

describe('every row', () => {
  it('has a unique id — an open request names one', () => {
    const ids = DEFAULT_CATALOG.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has an id no placeholder row could collide with', () => {
    for (const entry of DEFAULT_CATALOG) expect(entry.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('has a label to render', () => {
    // Only non-blank: a label is the vendor's own product name, and some of
    // them (kitty) are lowercase and identical to the id.
    for (const entry of DEFAULT_CATALOG) expect(entry.label.trim()).not.toBe('')
  })

  it('has an accent the browser can actually paint', () => {
    for (const entry of DEFAULT_CATALOG) expect(entry.accent).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('offers at least one way to be found', () => {
    for (const entry of DEFAULT_CATALOG) expect(entry.probes.length).toBeGreaterThan(0)
  })

  it('names a bundle that would be found in the app search path', () => {
    for (const entry of DEFAULT_CATALOG) {
      for (const probe of entry.probes) {
        if (probe.kind === 'mac-app') expect(probe.bundle.endsWith('.app')).toBe(true)
      }
    }
  })
})

describe('the listing order', () => {
  it('puts editors first, then the file manager, then terminals', () => {
    const rank = { code: 0, files: 1, terminal: 2 }
    const kinds = DEFAULT_CATALOG.map(entry => rank[entry.kind])
    expect(kinds).toStrictEqual([...kinds].sort((a, b) => a - b))
  })
})

describe('argument templates', () => {
  it('are present exactly where a row needs the directory somewhere other than last', () => {
    for (const entry of DEFAULT_CATALOG) {
      if (entry.args === undefined) continue
      // A template that never mentions the directory would launch the editor
      // on nothing at all, silently.
      expect(entry.args.some(arg => arg.includes(DIRECTORY_TOKEN))).toBe(true)
    }
  })

  it('belong only to rows whose launch form is the executable', () => {
    for (const entry of DEFAULT_CATALOG) {
      if (entry.args === undefined) continue
      // `open -a` ignores the template, so a row with both would light up on a
      // bundle probe and then open the wrong directory.
      expect(entry.probes.every(probe => probe.kind !== 'mac-app')).toBe(true)
    }
  })
})

describe('planLaunch', () => {
  const entry = { id: 'x', label: 'X', kind: 'code' as const, accent: '#000000', probes: [] }

  it('routes a bundle through open, ignoring any template', () => {
    expect(planLaunch(
      { ...entry, args: ['--ignored'] },
      { kind: 'mac-app', bundle: 'X.app' },
      '/Applications/X.app',
      '/w/p',
    )).toStrictEqual({ command: 'open', args: ['-a', '/Applications/X.app', '/w/p'] })
  })

  it('appends the directory when a row has no template', () => {
    expect(planLaunch(entry, { kind: 'path-bin', bin: 'x' }, '/usr/bin/x', '/w/p'))
      .toStrictEqual({ command: '/usr/bin/x', args: ['/w/p'] })
  })

  it('substitutes every occurrence of the token', () => {
    expect(planLaunch(
      { ...entry, args: ['--a', DIRECTORY_TOKEN, `--b=${DIRECTORY_TOKEN}`] },
      { kind: 'path-bin', bin: 'x' },
      '/usr/bin/x',
      '/w/p',
    )).toStrictEqual({ command: '/usr/bin/x', args: ['--a', '/w/p', '--b=/w/p'] })
  })

  it('leaves a directory that itself looks like the token alone', () => {
    const plan = planLaunch(entry, { kind: 'path-bin', bin: 'x' }, '/usr/bin/x', `/w/${DIRECTORY_TOKEN}`)
    expect(plan.args).toStrictEqual([`/w/${DIRECTORY_TOKEN}`])
  })
})

describe('the macOS app search path', () => {
  it('covers the two Apple locations the shipped rows depend on', () => {
    // Terminal moved out of /Applications in Catalina and Finder has never
    // been there; dropping either directory would silently lose a row.
    expect(MAC_APP_DIRECTORIES).toContain('/System/Applications/Utilities')
    expect(MAC_APP_DIRECTORIES).toContain('/System/Library/CoreServices')
  })

  it('includes the per-user location, unexpanded', () => {
    expect(MAC_APP_DIRECTORIES).toContain('~/Applications')
  })
})
