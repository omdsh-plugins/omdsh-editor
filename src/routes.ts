/**
 * The two routes: what is installed, and open one of them.
 *
 * Both are written against injected capabilities rather than against the
 * process, so the whole surface — including the refusals, which are most of
 * the behavior worth pinning — is drivable from a spec with no editor
 * installed and nothing spawned.
 * @module @omdsh-plugins/omdsh-editor/src/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { EditorRegistry } from './detect.ts'
import { normalizeDirectory, describe, planFor } from './detect.ts'
import type { Spawner } from './launch.ts'
import { EDITORS_PATH, ICON_PATH, OPEN_PATH, type EditorCatalogBody, type OpenResultBody } from './shared.ts'
import {
  EditorError, optionalString, parseJsonObject, readBody, requireString, writeError, writeJson,
} from './wire.ts'

/** What the routes reach outside themselves. */
export interface RouteDeps {
  /** The installed applications, swept and cached. */
  registry: EditorRegistry
  /** Starting the chosen one. */
  spawner: Spawner
  /**
   * One application's own icon.
   * @param id - the editor id, used as the cache key.
   * @param bundle - absolute path of its `.app`.
   * @returns the PNG, or undefined when the bundle yielded none.
   */
  readIcon: (id: string, bundle: string) => Promise<Buffer | undefined>
  /** `process.platform` of this host, as the catalog answer reports it. */
  platform: string
  /**
   * The authoritative directory of one conversation.
   * @param sessionId - the conversation named by the request.
   * @param clientCwd - what the browser believes it is; advisory.
   * @returns the absolute directory.
   * @throws {EditorError} no-directory when neither source names one.
   */
  resolveRoot: (sessionId: string, clientCwd: string | undefined) => string
  /**
   * Whether one absolute path is a directory that still exists.
   * @param path - the resolved root.
   * @returns true when it is openable.
   */
  isDirectory: (path: string) => Promise<boolean>
}

/**
 * Answer the catalog request.
 * @param res - the response being written.
 * @param deps - see {@link RouteDeps}.
 */
async function handleEditors(res: ServerResponse, deps: RouteDeps): Promise<void> {
  const editors = await deps.registry.list()
  const body: EditorCatalogBody = { editors: editors.map(describe), platform: deps.platform }
  writeJson(res, body)
}

/**
 * Answer an icon request with the application's own artwork.
 * @param url - the parsed request target, carrying `?id=`.
 * @param res - the response being written.
 * @param deps - see {@link RouteDeps}.
 */
async function handleIcon(url: URL, res: ServerResponse, deps: RouteDeps): Promise<void> {
  const id = url.searchParams.get('id')
  if (id === null || id === '') throw new EditorError('bad-request', 'missing "id"')

  const editor = await deps.registry.find(id)
  if (editor === undefined) {
    throw new EditorError('unknown-editor', `no installed application named ${JSON.stringify(id)}`, 404)
  }
  // Only the bundle form has artwork to read; a CLI shim is just a file.
  const icon = editor.probe.kind !== 'mac-app'
    ? undefined
    : await deps.readIcon(id, editor.located)
  if (icon === undefined) {
    // Not an error the picker should show — it simply draws the kind glyph
    // instead, which is what an absent icon means.
    throw new EditorError('unknown-editor', `no icon for ${JSON.stringify(id)}`, 404)
  }

  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': String(icon.byteLength),
    // Bytes off this user's own disk, and they change only when the
    // application is replaced. Private, because a shared cache has no
    // business holding what is installed on someone's machine.
    'cache-control': 'private, max-age=3600',
  })
  res.end(icon)
}

/**
 * Answer an open request: resolve the directory, find the application, run it.
 * @param req - the request being read.
 * @param res - the response being written.
 * @param deps - see {@link RouteDeps}.
 */
async function handleOpen(req: IncomingMessage, res: ServerResponse, deps: RouteDeps): Promise<void> {
  const body = parseJsonObject(await readBody(req))
  const sessionId = requireString(body, 'sessionId')
  const editorId = requireString(body, 'editorId')

  const root = deps.resolveRoot(sessionId, optionalString(body, 'cwd'))
  const directory = normalizeDirectory(root)
  if (directory === undefined) {
    throw new EditorError('bad-directory', `working directory "${root}" is not absolute`)
  }
  // Checked before the application is found rather than after, because a
  // workspace whose directory was moved or deleted is the common failure and
  // "that folder is gone" is a better answer than an editor opening empty.
  if (!await deps.isDirectory(directory)) {
    throw new EditorError('bad-directory', `"${directory}" is not a directory`)
  }

  const editor = await deps.registry.find(editorId)
  if (editor === undefined) {
    // Either the id is not in the catalog at all, or the application it names
    // was uninstalled since the picker last listed it. Same answer: the
    // browser half re-lists and the row disappears.
    throw new EditorError('unknown-editor', `no installed application named ${JSON.stringify(editorId)}`, 404)
  }

  // The editor is started IN the directory as well as pointed at it: a CLI
  // shim that ignores its argument still lands in the right place, and a
  // relative path an editor derives resolves the way the user expects.
  await deps.spawner.run(planFor(editor, directory), directory)
  const result: OpenResultBody = { editorId, path: directory }
  writeJson(res, result)
}

/**
 * Route one request that arrived under this plugin's prefix.
 * @param req - the request.
 * @param res - the response.
 * @param deps - see {@link RouteDeps}.
 * @returns completion once the response is written.
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDeps,
): Promise<void> {
  try {
    // Query strings and trailing slashes are not part of either route; the
    // pathname alone decides, so a stray `?t=1` cannot 404 the picker.
    const url = new URL(req.url ?? '/', 'http://omdsh-editor.invalid')
    const { pathname } = url
    if (pathname === EDITORS_PATH) {
      if (req.method !== 'GET') throw new EditorError('bad-request', 'the editor list is read with GET', 405)
      await handleEditors(res, deps)
      return
    }
    if (pathname === ICON_PATH) {
      if (req.method !== 'GET') throw new EditorError('bad-request', 'an icon is read with GET', 405)
      await handleIcon(url, res, deps)
      return
    }
    if (pathname === OPEN_PATH) {
      if (req.method !== 'POST') throw new EditorError('bad-request', 'an open is posted', 405)
      await handleOpen(req, res, deps)
      return
    }
    throw new EditorError('bad-request', `no route at ${pathname}`, 404)
  } catch (error) {
    writeError(res, error)
  }
}
