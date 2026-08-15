/**
 * The two routes: what is installed, and open one of them.
 *
 * Both are written against injected capabilities rather than against the
 * process, so the whole surface — including the refusals, which are most of
 * the behavior worth pinning — is drivable from a spec with no editor
 * installed and nothing spawned.
 * @module @omdsh-plugins/omdsh-editor/src/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EditorRegistry } from './detect.ts';
import type { Spawner } from './launch.ts';
/** What the routes reach outside themselves. */
export interface RouteDeps {
    /** The installed applications, swept and cached. */
    registry: EditorRegistry;
    /** Starting the chosen one. */
    spawner: Spawner;
    /**
     * One application's own icon.
     * @param id - the editor id, used as the cache key.
     * @param bundle - absolute path of its `.app`.
     * @returns the PNG, or undefined when the bundle yielded none.
     */
    readIcon: (id: string, bundle: string) => Promise<Buffer | undefined>;
    /** `process.platform` of this host, as the catalog answer reports it. */
    platform: string;
    /**
     * The authoritative directory of one conversation.
     * @param sessionId - the conversation named by the request.
     * @param clientCwd - what the browser believes it is; advisory.
     * @returns the absolute directory.
     * @throws {EditorError} no-directory when neither source names one.
     */
    resolveRoot: (sessionId: string, clientCwd: string | undefined) => string;
    /**
     * Whether one absolute path is a directory that still exists.
     * @param path - the resolved root.
     * @returns true when it is openable.
     */
    isDirectory: (path: string) => Promise<boolean>;
}
/**
 * Route one request that arrived under this plugin's prefix.
 * @param req - the request.
 * @param res - the response.
 * @param deps - see {@link RouteDeps}.
 * @returns completion once the response is written.
 */
export declare function handleRequest(req: IncomingMessage, res: ServerResponse, deps: RouteDeps): Promise<void>;
//# sourceMappingURL=routes.d.ts.map