/**
 * The host plugin's composition: what it registers, what it withdraws, how it
 * resolves a directory, and who it lets in.
 */

import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name, ROUTE_PREFIX, isTrustedRequest } from '../src/index.ts'

/** One registered route, as the fake carrier recorded it. */
interface Recorded {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => void | Promise<void>
}

/**
 * A cordis context carrying just the three services this plugin injects.
 * @param cwd - the working directory the session store reports, if any.
 * @param trustedHosts - the web runtime's trust list.
 * @returns the context, the routes it registered, and the effect disposers.
 */
function context(cwd?: string, trustedHosts: readonly string[] = []) {
  const routes: Recorded[] = []
  const disposers: (() => void)[] = []
  const services: Record<string, unknown> = {
    sessions: { get: () => cwd === undefined ? undefined : { header: { cwd } } },
    webRuntime: { trustedHosts },
  }
  const ctx = {
    get: (key: string) => services[key],
    webServer: {
      register: (route: Recorded) => {
        routes.push(route)
        return () => { routes.splice(routes.indexOf(route), 1) }
      },
    },
    effect: (setup: () => () => void) => { disposers.push(setup()) },
  }
  return { ctx, routes, disposers }
}

/** A recording response. */
function response() {
  const written = { status: 0, body: '' }
  const res = {
    writeHead(status: number) {
      written.status = status
      return res
    },
    end(body?: string) { written.body = body ?? '' },
  }
  return { res, written }
}

describe('the plugin declaration', () => {
  it('names itself and the services it needs', () => {
    expect(name).toBe('omdsh-editor')
    expect(inject).toStrictEqual(['webServer', 'sessions', 'webRuntime'])
  })
})

describe('mounting', () => {
  it('registers one prefix route and takes it away on unmount', () => {
    const { ctx, routes, disposers } = context('/w/proj')
    apply(ctx as never)
    expect(routes).toStrictEqual([expect.objectContaining({ kind: 'prefix', path: ROUTE_PREFIX })])
    for (const dispose of disposers) dispose()
    expect(routes).toStrictEqual([])
  })
})

describe('the trust fence', () => {
  it('refuses a request whose Host is not ours, without reaching a route', async () => {
    const { ctx, routes } = context('/w/proj')
    apply(ctx as never)
    const { res, written } = response()
    await routes[0]?.handler({ method: 'GET', url: `${ROUTE_PREFIX}/editors`, headers: { host: 'evil.test' } }, res)
    expect(written.status).toBe(403)
    expect(written.body).toBe('forbidden')
  })

  it('lets a loopback request through to the routes', async () => {
    const { ctx, routes } = context('/w/proj')
    apply(ctx as never)
    const { res, written } = response()
    await routes[0]?.handler({ method: 'GET', url: `${ROUTE_PREFIX}/editors`, headers: { host: '127.0.0.1:7777' } }, res)
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toMatchObject({ platform: process.platform })
  })

  it('is the same fence the /api gateway applies', () => {
    // Pinned here rather than only in its own spec, because the whole posture
    // of this plugin rests on the two being identical.
    expect(isTrustedRequest({ headers: { host: 'localhost:1' } }, [])).toBe(true)
    expect(isTrustedRequest({ headers: { host: 'lan.example:1' } }, ['lan.example:1'])).toBe(true)
    expect(isTrustedRequest({ headers: { host: 'lan.example:1' } }, [])).toBe(false)
    expect(isTrustedRequest({ headers: { host: 'localhost:1', 'sec-fetch-site': 'cross-site' } }, [])).toBe(false)
    expect(isTrustedRequest({ headers: { host: 'localhost:1', origin: 'http://evil.test' } }, [])).toBe(false)
  })
})

describe('resolving a directory', () => {
  /**
   * Post one open request through the mounted route.
   * @param cwd - the session store's working directory, if any.
   * @param body - the request body.
   * @returns the status and parsed answer.
   */
  async function open(cwd: string | undefined, body: Record<string, unknown>) {
    const { ctx, routes } = context(cwd)
    apply(ctx as never)
    const { res, written } = response()
    const req = Object.assign(
      (async function* () { yield JSON.stringify(body) })(),
      { method: 'POST', url: `${ROUTE_PREFIX}/open`, headers: { host: 'localhost:1' } },
    )
    await routes[0]?.handler(req, res)
    return { status: written.status, json: JSON.parse(written.body) as Record<string, unknown> }
  }

  it('refuses a session with no directory rather than opening the harness\'s own', async () => {
    const { status, json } = await open(undefined, { sessionId: 's1', editorId: 'vscode' })
    expect(status).toBe(404)
    expect((json['error'] as { code: string }).code).toBe('no-directory')
    // process.cwd() would be a plausible-looking fallback and a bad surprise.
    expect(JSON.stringify(json)).not.toContain(process.cwd())
  })

  it('falls back to the browser\'s directory only when the session has none', async () => {
    const { status, json } = await open(undefined, { sessionId: 's1', editorId: 'nope', cwd: '/nonexistent/dir' })
    // Got past resolution (no `no-directory`) and failed on the directory
    // itself, which is what proves the fallback was consulted.
    expect(status).toBe(400)
    expect((json['error'] as { code: string }).code).toBe('bad-directory')
  })

  it('refuses a browser-supplied directory that is not absolute', async () => {
    const { status, json } = await open(undefined, { sessionId: 's1', editorId: 'vscode', cwd: 'relative/dir' })
    expect(status).toBe(400)
    expect((json['error'] as { code: string }).code).toBe('bad-directory')
  })
})

describe('configuration', () => {
  it('narrows the catalog to the rows a deployment named', async () => {
    const { ctx, routes } = context('/w/proj')
    apply(ctx as never, { editors: [] })
    const { res, written } = response()
    await routes[0]?.handler({ method: 'GET', url: `${ROUTE_PREFIX}/editors`, headers: { host: 'localhost:1' } }, res)
    expect(JSON.parse(written.body)).toMatchObject({ editors: [] })
  })

  it('accepts a detection TTL without tripping over the default', () => {
    const { ctx } = context('/w/proj')
    expect(() => { apply(ctx as never, { detectionTtlMs: 1 }) }).not.toThrow()
  })
})

describe('the harness services', () => {
  it('reads them by name rather than off the ambient context', () => {
    // The two-programs-merged hazard the sibling plugins document: a value
    // read off `ctx.sessions` would be whichever declaration the compiler saw
    // first, so this plugin must go through `get`.
    const { ctx } = context('/w/proj')
    const get = vi.spyOn(ctx, 'get')
    apply(ctx as never)
    expect(get.mock.calls.map(call => call[0])).toStrictEqual(['sessions', 'webRuntime'])
  })
})
