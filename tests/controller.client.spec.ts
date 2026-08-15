// @vitest-environment jsdom
/**
 * The picker's state machine: listing, remembering, opening, and failing.
 *
 * jsdom rather than node: the store factory comes from the client runtime,
 * whose module graph reaches `window` at import time.
 */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { EDITORS_PATH, OPEN_PATH } from '../src/shared.ts'
import { EditorPickerController } from '../src/client/controller.ts'
import type { EditorPickerDeps } from '../src/client/controller.ts'

const SESSION = 's1' as SessionId

const VSCODE = { id: 'vscode', label: 'VS Code', kind: 'code' as const, accent: '#3b8eea', icon: true }
const CURSOR = { id: 'cursor', label: 'Cursor', kind: 'code' as const, accent: '#a8aab0', icon: true }

/**
 * A JSON response.
 * @param body - the value to answer with.
 * @param status - the HTTP status.
 * @returns the response.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * A controller over a scripted host.
 * @param routes - what each path answers with, in call order per path.
 * @param stored - the remembered choice, if any.
 * @returns the controller, the fetch spy, and the preferences written.
 */
function controllerOver(
  routes: Partial<Record<string, () => Response | Promise<Response>>>,
  stored?: string,
) {
  const written: string[] = []
  const fetchSpy = vi.fn<EditorPickerDeps['fetch']>((path) => {
    const route = routes[path]
    if (route === undefined) return Promise.resolve(json({ error: { code: 'bad-request', message: 'no route' } }, 404))
    return Promise.resolve(route())
  })
  const deps: EditorPickerDeps = {
    fetch: fetchSpy,
    readPreference: () => stored,
    writePreference: (id) => { written.push(id) },
  }
  return { controller: new EditorPickerController(deps), fetchSpy, written }
}

describe('listing', () => {
  it('starts idle and empty', () => {
    const { controller } = controllerOver({})
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'idle', editors: [], preferredId: undefined })
  })

  it('records the applications and the host platform', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE, CURSOR], platform: 'darwin' }),
    })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      editors: [VSCODE, CURSOR],
      platform: 'darwin',
    })
  })

  it('prefers the first listed application when nothing is remembered', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE, CURSOR], platform: 'darwin' }),
    })
    await controller.list()
    expect(controller.store.getSnapshot().preferredId).toBe('vscode')
  })

  it('prefers the remembered application when it is still installed', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE, CURSOR], platform: 'darwin' }),
    }, 'cursor')
    await controller.list()
    expect(controller.store.getSnapshot().preferredId).toBe('cursor')
  })

  it('falls back to the first listed when the remembered one is gone', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE], platform: 'darwin' }),
    }, 'sublime')
    await controller.list()
    expect(controller.store.getSnapshot().preferredId).toBe('vscode')
  })

  it('leaves nothing preferred on a host with no editors', async () => {
    const { controller } = controllerOver({ [EDITORS_PATH]: () => json({ editors: [], platform: 'linux' }) })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', preferredId: undefined, platform: 'linux' })
  })

  it('settles once, however many times it is asked', async () => {
    const { controller, fetchSpy } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE], platform: 'darwin' }),
    })
    await controller.list()
    await controller.list()
    await controller.list()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries after a failure, because opening the menu again is a retry', async () => {
    let attempt = 0
    const { controller, fetchSpy } = controllerOver({
      [EDITORS_PATH]: () => {
        attempt += 1
        return attempt === 1
          ? json({ error: { code: 'bad-request', message: 'runtime restarting' } }, 503)
          : json({ editors: [VSCODE], platform: 'darwin' })
      },
    })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'runtime restarting' })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', editors: [VSCODE] })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('reports a refusal that is not this plugin\'s envelope by its status', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => new Response('<html>proxy error</html>', { status: 502 }),
    })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'HTTP 502' })
  })

  it('reports a transport failure rather than staying on loading', async () => {
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => { throw new Error('NetworkError') },
    })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'NetworkError' })
  })

  it('tolerates a malformed body without throwing', async () => {
    const { controller } = controllerOver({ [EDITORS_PATH]: () => json({ editors: 'nope' }) })
    await controller.list()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', editors: [], platform: '' })
  })
})

describe('opening', () => {
  it('posts the session, the editor, and the derived directory', async () => {
    const { controller, fetchSpy } = controllerOver({
      [EDITORS_PATH]: () => json({ editors: [VSCODE], platform: 'darwin' }),
      [OPEN_PATH]: () => json({ editorId: 'vscode', path: '/w/proj' }),
    })
    await controller.list()
    await controller.open(SESSION, 'vscode', '/w/proj')
    const [path, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    expect(path).toBe(OPEN_PATH)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toStrictEqual({ sessionId: 's1', editorId: 'vscode', cwd: '/w/proj' })
  })

  it('omits the directory rather than sending an empty one', async () => {
    const { controller, fetchSpy } = controllerOver({ [OPEN_PATH]: () => json({ editorId: 'vscode', path: '/w' }) })
    await controller.open(SESSION, 'vscode', undefined)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toStrictEqual({ sessionId: 's1', editorId: 'vscode' })
  })

  it('remembers the choice, and remembers it even when the launch fails', async () => {
    const { controller, written } = controllerOver({
      [OPEN_PATH]: () => json({ error: { code: 'bad-directory', message: '"/w/gone" is not a directory' } }, 400),
    })
    await controller.open(SESSION, 'cursor', '/w/gone')
    expect(written).toStrictEqual(['cursor'])
    expect(controller.store.getSnapshot()).toMatchObject({
      preferredId: 'cursor',
      openingId: undefined,
      error: '"/w/gone" is not a directory',
    })
  })

  it('clears the busy flag on success', async () => {
    const { controller } = controllerOver({ [OPEN_PATH]: () => json({ editorId: 'vscode', path: '/w' }) })
    await controller.open(SESSION, 'vscode', '/w')
    expect(controller.store.getSnapshot()).toMatchObject({ openingId: undefined, error: undefined })
  })

  it('marks the application busy while the host is starting it', async () => {
    let release: (value: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const { controller } = controllerOver({ [OPEN_PATH]: () => pending })
    const opening = controller.open(SESSION, 'vscode', '/w')
    expect(controller.store.getSnapshot().openingId).toBe('vscode')
    release(json({ editorId: 'vscode', path: '/w' }))
    await opening
    expect(controller.store.getSnapshot().openingId).toBeUndefined()
  })

  it('re-lists when the host says the application is gone', async () => {
    let listed = 0
    const { controller } = controllerOver({
      [EDITORS_PATH]: () => {
        listed += 1
        return json({ editors: listed === 1 ? [VSCODE, CURSOR] : [VSCODE], platform: 'darwin' })
      },
      [OPEN_PATH]: () => json({ error: { code: 'unknown-editor', message: 'no installed application' } }, 404),
    })
    await controller.list()
    await controller.open(SESSION, 'cursor', '/w')
    // The refresh is fire-and-forget; let its microtasks run.
    await vi.waitFor(() => { expect(controller.store.getSnapshot().editors).toStrictEqual([VSCODE]) })
  })

  it('reports a transport failure and stops looking busy', async () => {
    const { controller } = controllerOver({ [OPEN_PATH]: () => { throw new Error('offline') } })
    await controller.open(SESSION, 'vscode', '/w')
    expect(controller.store.getSnapshot()).toMatchObject({ openingId: undefined, error: 'offline' })
  })
})

describe('dismissing an error', () => {
  it('clears it, and is a no-op when there is none', () => {
    const { controller } = controllerOver({})
    const before = controller.store.getSnapshot()
    controller.dismissError()
    expect(controller.store.getSnapshot()).toBe(before)
  })

  it('clears a recorded failure', async () => {
    const { controller } = controllerOver({
      [OPEN_PATH]: () => json({ error: { code: 'launch-failed', message: 'spawn ENOENT' } }, 500),
    })
    await controller.open(SESSION, 'vscode', '/w')
    expect(controller.store.getSnapshot().error).toBe('spawn ENOENT')
    controller.dismissError()
    expect(controller.store.getSnapshot().error).toBeUndefined()
  })
})
