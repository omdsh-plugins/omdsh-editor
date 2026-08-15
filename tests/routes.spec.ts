/** The two routes, including every refusal — which is most of the behavior. */

import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CATALOG, EDITORS_PATH, EditorRegistry, ICON_PATH, OPEN_PATH, handleRequest,
} from '../src/index.ts'
import type { DetectionEnv, EditorEntry, LaunchPlan, RouteDeps } from '../src/index.ts'
import { EditorError } from '../src/wire.ts'

const VSCODE = DEFAULT_CATALOG.find(entry => entry.id === 'vscode') as EditorEntry
const TERMINAL = DEFAULT_CATALOG.find(entry => entry.id === 'terminal') as EditorEntry

/**
 * A host with a fixed set of application paths present.
 * @param present - the paths that exist.
 * @returns the detection environment.
 */
function macHost(present: readonly string[]): DetectionEnv {
  const set = new Set(present)
  return {
    platform: 'darwin',
    appDirectories: ['/Applications', '/System/Applications/Utilities'],
    pathEntries: [],
    windowsRoots: {},
    exists: path => Promise.resolve(set.has(path)),
    executable: () => Promise.resolve(false),
  }
}

/** A recording response that captures what a route wrote. */
function response() {
  const written = { status: 0, headers: {} as Record<string, string>, body: '' }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      written.status = status
      written.headers = headers
      return res
    },
    end(body?: string | Buffer) {
      written.body = body === undefined ? '' : String(body)
    },
  }
  return { res: res as unknown as Parameters<typeof handleRequest>[1], written }
}

/**
 * A request carrying one JSON body.
 * @param method - the HTTP method.
 * @param url - the request target.
 * @param body - the body text, when there is one.
 * @returns the request.
 */
function request(method: string, url: string, body?: string) {
  const stream = Readable.from(body === undefined ? [] : [body])
  return Object.assign(stream, { method, url }) as unknown as Parameters<typeof handleRequest>[0]
}

/**
 * Deps over a host with VS Code and Terminal installed, in `/w/proj`.
 * @param overrides - anything the case changes.
 * @returns the route deps and the plans the spawner recorded.
 */
function deps(overrides: Partial<RouteDeps> = {}) {
  const launched: { plan: LaunchPlan; cwd: string }[] = []
  const base: RouteDeps = {
    registry: new EditorRegistry(
      macHost(['/Applications/Visual Studio Code.app', '/System/Applications/Utilities/Terminal.app']),
      [VSCODE, TERMINAL],
    ),
    spawner: {
      run: (plan, cwd) => {
        launched.push({ plan, cwd })
        return Promise.resolve()
      },
    },
    readIcon: () => Promise.resolve(undefined),
    platform: 'darwin',
    resolveRoot: () => '/w/proj',
    isDirectory: () => Promise.resolve(true),
    ...overrides,
  }
  return { deps: base, launched }
}

/**
 * Drive one request through the router.
 * @param method - the HTTP method.
 * @param url - the request target.
 * @param body - the request body, when there is one.
 * @param routeDeps - the deps to use.
 * @returns status and the parsed JSON answer.
 */
async function call(method: string, url: string, body: string | undefined, routeDeps: RouteDeps) {
  const { res, written } = response()
  await handleRequest(request(method, url, body), res, routeDeps)
  return { status: written.status, headers: written.headers, json: JSON.parse(written.body) as Record<string, unknown> }
}

describe('the editor list', () => {
  it('answers the installed applications and the host platform', async () => {
    const { deps: routeDeps } = deps()
    const { status, json } = await call('GET', EDITORS_PATH, undefined, routeDeps)
    expect(status).toBe(200)
    expect(json['platform']).toBe('darwin')
    expect(json['editors']).toStrictEqual([
      { id: 'vscode', label: 'VS Code', kind: 'code', accent: VSCODE.accent, icon: true },
      { id: 'terminal', label: 'Terminal', kind: 'terminal', accent: TERMINAL.accent, icon: true },
    ])
  })

  it('is never cached — the answer is live host state', async () => {
    const { deps: routeDeps } = deps()
    const { headers } = await call('GET', EDITORS_PATH, undefined, routeDeps)
    expect(headers['cache-control']).toBe('no-store')
  })

  it('ignores a query string', async () => {
    const { deps: routeDeps } = deps()
    const { status } = await call('GET', `${EDITORS_PATH}?t=1`, undefined, routeDeps)
    expect(status).toBe(200)
  })

  it('refuses a method that is not GET', async () => {
    const { deps: routeDeps } = deps()
    const { status, json } = await call('POST', EDITORS_PATH, '{}', routeDeps)
    expect(status).toBe(405)
    expect((json['error'] as { code: string }).code).toBe('bad-request')
  })
})

describe('opening a directory', () => {
  it('launches the chosen application in the resolved directory', async () => {
    const { deps: routeDeps, launched } = deps()
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(200)
    expect(json).toStrictEqual({ editorId: 'vscode', path: '/w/proj' })
    expect(launched).toStrictEqual([{
      plan: { command: 'open', args: ['-a', '/Applications/Visual Studio Code.app', '/w/proj'] },
      cwd: '/w/proj',
    }])
  })

  it('answers the host resolution, not the path the browser sent', async () => {
    const resolveRoot = vi.fn(() => '/w/real')
    const { deps: routeDeps, launched } = deps({ resolveRoot })
    const { json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode', cwd: '/w/claimed' }), routeDeps,
    )
    expect(resolveRoot).toHaveBeenCalledWith('s1', '/w/claimed')
    expect(json['path']).toBe('/w/real')
    expect(launched[0]?.cwd).toBe('/w/real')
  })

  it('normalizes the resolved directory before handing it over', async () => {
    const { deps: routeDeps, launched } = deps({ resolveRoot: () => '/w/proj/sub/..' })
    await call('POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps)
    expect(launched[0]?.cwd).toBe('/w/proj')
  })

  it('refuses a session with no directory', async () => {
    const { deps: routeDeps, launched } = deps({
      resolveRoot: () => { throw new EditorError('no-directory', 'session "s1" is not working in a directory', 404) },
    })
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(404)
    expect((json['error'] as { code: string }).code).toBe('no-directory')
    expect(launched).toStrictEqual([])
  })

  it('refuses a directory that is not absolute', async () => {
    const { deps: routeDeps, launched } = deps({ resolveRoot: () => 'proj' })
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(400)
    expect((json['error'] as { code: string }).code).toBe('bad-directory')
    expect(launched).toStrictEqual([])
  })

  it('refuses a directory that is gone, before looking for the application', async () => {
    const registry = new EditorRegistry(macHost([]), [VSCODE])
    const find = vi.spyOn(registry, 'find')
    const { deps: routeDeps } = deps({ registry, isDirectory: () => Promise.resolve(false) })
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(400)
    expect((json['error'] as { code: string }).code).toBe('bad-directory')
    expect(find).not.toHaveBeenCalled()
  })

  it('refuses an application this host does not have', async () => {
    const { deps: routeDeps, launched } = deps()
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'cursor' }), routeDeps,
    )
    expect(status).toBe(404)
    expect((json['error'] as { code: string }).code).toBe('unknown-editor')
    expect(launched).toStrictEqual([])
  })

  it('reports a spawn that failed', async () => {
    const { deps: routeDeps } = deps({
      spawner: { run: () => Promise.reject(new EditorError('launch-failed', 'spawn ENOENT', 500)) },
    })
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(500)
    expect(json['error']).toStrictEqual({ code: 'launch-failed', message: 'spawn ENOENT' })
  })

  it('does not leak the text of an unexpected internal fault', async () => {
    const { deps: routeDeps } = deps({
      spawner: { run: () => Promise.reject(new Error('/Users/ada/.ssh/id_ed25519 unreadable')) },
    })
    const { status, json } = await call(
      'POST', OPEN_PATH, JSON.stringify({ sessionId: 's1', editorId: 'vscode' }), routeDeps,
    )
    expect(status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('id_ed25519')
  })

  it.each([
    ['not JSON at all', 'nonsense'],
    ['a JSON array', '[]'],
    ['a JSON scalar', '"vscode"'],
    ['an object missing sessionId', '{"editorId":"vscode"}'],
    ['an object missing editorId', '{"sessionId":"s1"}'],
    ['an object whose editorId is blank', '{"sessionId":"s1","editorId":"  "}'],
    ['an object whose editorId is not a string', '{"sessionId":"s1","editorId":7}'],
  ])('refuses %s', async (_name, body) => {
    const { deps: routeDeps, launched } = deps()
    const { status, json } = await call('POST', OPEN_PATH, body, routeDeps)
    expect(status).toBe(400)
    expect((json['error'] as { code: string }).code).toBe('bad-request')
    expect(launched).toStrictEqual([])
  })

  it('refuses a body past the size bound', async () => {
    const { deps: routeDeps } = deps()
    const { status } = await call('POST', OPEN_PATH, 'x'.repeat(32 * 1024), routeDeps)
    expect(status).toBe(413)
  })

  it('refuses a method that is not POST', async () => {
    const { deps: routeDeps } = deps()
    const { status } = await call('GET', OPEN_PATH, undefined, routeDeps)
    expect(status).toBe(405)
  })
})

describe('an application icon', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])

  /**
   * Fetch one icon, keeping the raw body (it is bytes, not JSON).
   * @param url - the request target.
   * @param routeDeps - the deps to use.
   * @returns the status, headers, and body.
   */
  async function icon(url: string, routeDeps: RouteDeps) {
    const { res, written } = response()
    await handleRequest(request('GET', url), res, routeDeps)
    return written
  }

  it('answers the application\'s own PNG', async () => {
    const readIcon = vi.fn(() => Promise.resolve(PNG))
    const { deps: routeDeps } = deps({ readIcon })
    const written = await icon(`${ICON_PATH}?id=vscode`, routeDeps)
    expect(written.status).toBe(200)
    expect(written.headers['content-type']).toBe('image/png')
    expect(written.headers['content-length']).toBe(String(PNG.byteLength))
    // Keyed by the editor id, over the bundle detection resolved.
    expect(readIcon).toHaveBeenCalledWith('vscode', '/Applications/Visual Studio Code.app')
  })

  it('is cached privately — it is bytes off this user\'s own disk', async () => {
    const { deps: routeDeps } = deps({ readIcon: () => Promise.resolve(PNG) })
    const written = await icon(`${ICON_PATH}?id=vscode`, routeDeps)
    expect(written.headers['cache-control']).toBe('private, max-age=3600')
  })

  it('404s when the bundle yielded no icon, so the picker draws its glyph', async () => {
    const { deps: routeDeps } = deps({ readIcon: () => Promise.resolve(undefined) })
    const written = await icon(`${ICON_PATH}?id=vscode`, routeDeps)
    expect(written.status).toBe(404)
  })

  it('never reads an icon for a non-bundle application', async () => {
    const readIcon = vi.fn(() => Promise.resolve(PNG))
    // A CLI shim on PATH is a file, not artwork; asking would be nonsense.
    const registry = new EditorRegistry(
      {
        platform: 'linux',
        appDirectories: [],
        pathEntries: ['/usr/bin'],
        windowsRoots: {},
        exists: () => Promise.resolve(false),
        executable: path => Promise.resolve(path === '/usr/bin/code'),
      },
      [VSCODE],
    )
    const { deps: routeDeps } = deps({ registry, readIcon })
    const written = await icon(`${ICON_PATH}?id=vscode`, routeDeps)
    expect(written.status).toBe(404)
    expect(readIcon).not.toHaveBeenCalled()
  })

  it('404s for an application this host does not have', async () => {
    const { deps: routeDeps } = deps({ readIcon: () => Promise.resolve(PNG) })
    expect((await icon(`${ICON_PATH}?id=cursor`, routeDeps)).status).toBe(404)
  })

  it('refuses a request naming no application', async () => {
    const { deps: routeDeps } = deps()
    expect((await icon(ICON_PATH, routeDeps)).status).toBe(400)
    expect((await icon(`${ICON_PATH}?id=`, routeDeps)).status).toBe(400)
  })

  it('refuses a method that is not GET', async () => {
    const { deps: routeDeps } = deps()
    const { res, written } = response()
    await handleRequest(request('POST', `${ICON_PATH}?id=vscode`, '{}'), res, routeDeps)
    expect(written.status).toBe(405)
  })
})

describe('an unknown path under the prefix', () => {
  it('is a 404 rather than a silent 200', async () => {
    const { deps: routeDeps } = deps()
    const { status } = await call('GET', '/omdsh-editor/whatever', undefined, routeDeps)
    expect(status).toBe(404)
  })
})
