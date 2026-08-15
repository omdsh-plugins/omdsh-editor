/**
 * Open the project in an editor, host half: find the applications this machine
 * has, and start one of them on a conversation's directory.
 *
 * It lives in the runtime rather than in the desktop shell because the runtime
 * is where the project directory IS. The harness's own model is that a session
 * works in a directory on the host that runs the runtime, so that is the host
 * whose editors are worth offering and the only one where opening the folder
 * means anything. A shell-side implementation would also make the capability
 * exclusive to the packaged application, when `dsh web` in a terminal wants it
 * just as much.
 *
 * The consequence is stated rather than hidden: reaching a runtime over the
 * network and pressing an editor opens that editor on the machine running the
 * runtime, next to the files, and not on the machine holding the browser.
 * The browser half says so — the picker names the host platform when it has
 * nothing to offer — and the trust fence keeps the route exactly as reachable
 * as `/api` and no more.
 * @module @omdsh-plugins/omdsh-editor
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { IconCache } from './app-icon.ts'
import { DEFAULT_CATALOG, type EditorEntry } from './catalog.ts'
import { EditorRegistry, hostEnv } from './detect.ts'
import { hostSpawner } from './launch.ts'
import { handleRequest } from './routes.ts'
import { ROUTE_PREFIX } from './shared.ts'
import { isTrustedRequest } from './trust-fence.ts'
import { EditorError } from './wire.ts'

export {
  IconCache, PREFERRED_ICON_EDGE, hostBundleReader, iconFileFromPlist, icnsVariants, pickVariant,
  readAppIcon, resolveIconPath,
} from './app-icon.ts'
export type { BundleReader, IcnsVariant } from './app-icon.ts'
export { DEFAULT_CATALOG, DIRECTORY_TOKEN, MAC_APP_DIRECTORIES, planLaunch } from './catalog.ts'
export type { EditorEntry, EditorProbe, LaunchPlan, WindowsRoot } from './catalog.ts'
export {
  DETECTION_TTL_MS, EditorRegistry, describe, detectEditors, detectEntry, expandHome, hostEnv,
  normalizeDirectory, planFor,
} from './detect.ts'
export type { DetectedEditor, DetectionEnv } from './detect.ts'
export { hostSpawner, SPAWN_SETTLE_MS } from './launch.ts'
export type { Spawner } from './launch.ts'
export { handleRequest } from './routes.ts'
export type { RouteDeps } from './routes.ts'
export { EDITORS_PATH, ICON_PATH, OPEN_PATH, ROUTE_PREFIX } from './shared.ts'
export type {
  EditorCatalogBody, EditorDescriptor, EditorErrorBody, EditorErrorCode, EditorKind,
  OpenRequestBody, OpenResultBody,
} from './shared.ts'
export { isTrustedRequest, isLoopbackHostname } from './trust-fence.ts'
export { EditorError } from './wire.ts'

/** Cordis plugin name. */
export const name = 'omdsh-editor'

/**
 * Services required before the routes can mount: the HTTP carrier, the session
 * store the working directory comes from, and the web runtime's bind-derived
 * trust list.
 */
export const inject = ['webServer', 'sessions', 'webRuntime']

/** Host-half configuration. */
export interface Config {
  /**
   * The applications to look for, replacing the shipped table outright. Absent
   * uses {@link DEFAULT_CATALOG}; present is how a deployment adds an editor
   * this package does not know or narrows the list to the two it wants.
   */
  editors?: EditorEntry[]
  /**
   * How long one detection sweep stays fresh, in milliseconds. Absent uses the
   * registry's own default, which is short enough that installing an editor
   * while the harness runs shows up without a restart.
   */
  detectionTtlMs?: number
}

/**
 * The web runtime's bind-derived trust values, as this plugin reads them. A
 * structural mirror rather than an import: the concrete type lives in the
 * `@deepseek-ai/dsh-web-app` BUNDLE package, and a feature plugin depending on
 * a bundle is backwards. Drift is contained to these two lines.
 */
interface WebRuntimeTrust {
  /** LAN literals sampled at bind, followed by explicit `--trusted-host` authorities. */
  trustedHosts: readonly string[]
}

/**
 * Mount the editor routes.
 * @param ctx - host context carrying the webserver, sessions, and web runtime.
 * @param config - see {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  // Resolved by name rather than off the ambient Context: a plugin compiled
  // outside the harness monorepo merges the browser and host `Context`
  // declarations into ONE program, so `ctx.sessions` is whichever the compiler
  // saw first. At runtime cordis publishes exactly one service per name, and
  // in this process it is the host one.
  const sessions = ctx.get('sessions') as unknown as SessionStore
  const webRuntime = ctx.get('webRuntime') as unknown as WebRuntimeTrust

  const registry = new EditorRegistry(hostEnv(), config.editors ?? DEFAULT_CATALOG, config.detectionTtlMs)
  const spawner = hostSpawner()
  const icons = new IconCache()

  /**
   * A conversation's directory. The session's own is authoritative; the
   * browser's value is a fallback for a session that carries none, and is
   * never trusted beyond being absolute (the route checks that, and that it
   * is still a directory, before anything is started).
   */
  const resolveRoot = (sessionId: string, clientCwd: string | undefined): string => {
    const attached = sessions.get(sessionId as SessionId)?.header.cwd
    if (attached !== undefined && attached !== '') return attached
    if (clientCwd !== undefined && clientCwd !== '') return clientCwd
    // Deliberately NOT `process.cwd()`: opening the directory the harness
    // happens to have been started from, because this conversation has none,
    // is a surprise rather than a fallback.
    throw new EditorError('no-directory', `session ${JSON.stringify(sessionId)} is not working in a directory`, 404)
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isTrustedRequest(req, webRuntime.trustedHosts)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('forbidden')
        return
      }
      await handleRequest(req, res, {
        registry,
        spawner,
        readIcon: (id, bundle) => icons.get(id, bundle),
        platform: process.platform,
        resolveRoot,
        isDirectory: async (path) => {
          try {
            return (await stat(path)).isDirectory()
          } catch {
            return false
          }
        },
      })
    },
  }), 'omdsh-editor: editor routes')
}
