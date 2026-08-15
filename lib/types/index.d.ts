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
import type { Context } from '@deepseek-ai/cordis';
import { type EditorEntry } from './catalog.ts';
export { IconCache, PREFERRED_ICON_EDGE, hostBundleReader, iconFileFromPlist, icnsVariants, pickVariant, readAppIcon, resolveIconPath, } from './app-icon.ts';
export type { BundleReader, IcnsVariant } from './app-icon.ts';
export { DEFAULT_CATALOG, DIRECTORY_TOKEN, MAC_APP_DIRECTORIES, planLaunch } from './catalog.ts';
export type { EditorEntry, EditorProbe, LaunchPlan, WindowsRoot } from './catalog.ts';
export { DETECTION_TTL_MS, EditorRegistry, describe, detectEditors, detectEntry, expandHome, hostEnv, normalizeDirectory, planFor, } from './detect.ts';
export type { DetectedEditor, DetectionEnv } from './detect.ts';
export { hostSpawner, SPAWN_SETTLE_MS } from './launch.ts';
export type { Spawner } from './launch.ts';
export { handleRequest } from './routes.ts';
export type { RouteDeps } from './routes.ts';
export { EDITORS_PATH, ICON_PATH, OPEN_PATH, ROUTE_PREFIX } from './shared.ts';
export type { EditorCatalogBody, EditorDescriptor, EditorErrorBody, EditorErrorCode, EditorKind, OpenRequestBody, OpenResultBody, } from './shared.ts';
export { isTrustedRequest, isLoopbackHostname } from './trust-fence.ts';
export { EditorError } from './wire.ts';
/** Cordis plugin name. */
export declare const name = "omdsh-editor";
/**
 * Services required before the routes can mount: the HTTP carrier, the session
 * store the working directory comes from, and the web runtime's bind-derived
 * trust list.
 */
export declare const inject: string[];
/** Host-half configuration. */
export interface Config {
    /**
     * The applications to look for, replacing the shipped table outright. Absent
     * uses {@link DEFAULT_CATALOG}; present is how a deployment adds an editor
     * this package does not know or narrows the list to the two it wants.
     */
    editors?: EditorEntry[];
    /**
     * How long one detection sweep stays fresh, in milliseconds. Absent uses the
     * registry's own default, which is short enough that installing an editor
     * while the harness runs shows up without a restart.
     */
    detectionTtlMs?: number;
}
/**
 * Mount the editor routes.
 * @param ctx - host context carrying the webserver, sessions, and web runtime.
 * @param config - see {@link Config}.
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map