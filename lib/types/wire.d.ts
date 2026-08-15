/**
 * What the host routes answer with: one error class carrying a machine code
 * and an HTTP status, and the writers every route ends in — so a route body
 * reads as its own logic and never as response plumbing.
 * @module @omdsh-plugins/omdsh-editor/src/wire
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EditorErrorCode } from './shared.ts';
/** A failure a route can answer with verbatim. */
export declare class EditorError extends Error {
    readonly code: EditorErrorCode;
    readonly status: number;
    /**
     * @param code - machine-routable kind the browser half branches on.
     * @param message - human text; safe to show in the picker.
     * @param status - HTTP status to answer with.
     */
    constructor(code: EditorErrorCode, message: string, status?: number);
}
/** Message text of an unknown thrown value. */
export declare function messageOf(error: unknown): string;
/**
 * Answer with one JSON value.
 * @param res - the response being written.
 * @param value - JSON-serializable payload.
 * @param status - HTTP status (default 200).
 */
export declare function writeJson(res: ServerResponse, value: unknown, status?: number): void;
/**
 * Answer with a failure. An {@link EditorError} keeps its code and status;
 * anything else is an internal fault and says so without leaking its text.
 * @param res - the response being written.
 * @param error - the thrown value.
 */
export declare function writeError(res: ServerResponse, error: unknown): void;
/**
 * Read one request body, bounded so a runaway upload cannot hold memory.
 * @param req - the request to drain.
 * @param limit - the largest body accepted, in bytes.
 * @returns the body text.
 * @throws {EditorError} bad-request when it exceeded the limit.
 */
export declare function readBody(req: IncomingMessage, limit?: number): Promise<string>;
/**
 * Parse one JSON request body into its named string fields.
 * @param body - the drained request body.
 * @returns the object it carried.
 * @throws {EditorError} bad-request when it is not a JSON object.
 */
export declare function parseJsonObject(body: string): Record<string, unknown>;
/**
 * Read one required string field.
 * @param body - the parsed request object.
 * @param name - the field name.
 * @returns its non-blank value.
 * @throws {EditorError} bad-request when absent or blank.
 */
export declare function requireString(body: Record<string, unknown>, name: string): string;
/**
 * Read one optional string field.
 * @param body - the parsed request object.
 * @param name - the field name.
 * @returns its non-blank value, or undefined.
 */
export declare function optionalString(body: Record<string, unknown>, name: string): string | undefined;
//# sourceMappingURL=wire.d.ts.map