/**
 * Browser-trust fence for this plugin's routes, behaviorally identical to the
 * /api gateway's fence in `@deepseek-ai/dsh-client-connection`
 * (src/api-request-trust.ts + src/loopback-hostname.ts, BSD-3-Clause,
 * restated here because that package exports neither helper and a plugin must
 * not reach into another package's internals).
 *
 * These routes start a native application on the host, so they must be
 * exactly as reachable as `/api` and no more: a Host header naming us
 * (loopback, or an authority this deployment was told to serve) plus
 * same-origin browser markers. This is a DNS-rebinding and cross-site
 * defense, not authentication — a deployment that publishes `/api` to a
 * network publishes these with it.
 * @module @omdsh-plugins/omdsh-editor/src/trust-fence
 */
import type { IncomingHttpHeaders } from 'node:http';
/** The request facts the fence reads (structural subset of IncomingMessage). */
export interface TrustRequest {
    headers: IncomingHttpHeaders;
}
/**
 * Whether a normalized hostname names the local loopback authority.
 * @param hostname - the URL-normalized hostname.
 * @returns true for localhost, [::1], and the whole 127.0.0.0/8 literal range.
 */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Decide whether one request may reach this plugin's routes.
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours and the browser markers are same-origin.
 */
export declare function isTrustedRequest(request: TrustRequest, trustedHosts: readonly string[]): boolean;
//# sourceMappingURL=trust-fence.d.ts.map