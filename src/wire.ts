/**
 * What the host routes answer with: one error class carrying a machine code
 * and an HTTP status, and the writers every route ends in — so a route body
 * reads as its own logic and never as response plumbing.
 * @module @omdsh-plugins/omdsh-editor/src/wire
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { EditorErrorCode } from './shared.ts'

/** A failure a route can answer with verbatim. */
export class EditorError extends Error {
  /**
   * @param code - machine-routable kind the browser half branches on.
   * @param message - human text; safe to show in the picker.
   * @param status - HTTP status to answer with.
   */
  constructor(
    readonly code: EditorErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'EditorError'
  }
}

/** Message text of an unknown thrown value. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Answer with one JSON value.
 * @param res - the response being written.
 * @param value - JSON-serializable payload.
 * @param status - HTTP status (default 200).
 */
export function writeJson(res: ServerResponse, value: unknown, status = 200): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    // Both answers are derived from live host state — which applications are
    // installed, and where a session is working. A cached one would offer an
    // editor the user has since removed.
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Answer with a failure. An {@link EditorError} keeps its code and status;
 * anything else is an internal fault and says so without leaking its text.
 * @param res - the response being written.
 * @param error - the thrown value.
 */
export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof EditorError) {
    writeJson(res, { error: { code: error.code, message: error.message } }, error.status)
    return
  }
  writeJson(res, { error: { code: 'launch-failed', message: 'the editor request failed' } }, 500)
}

/**
 * Read one request body, bounded so a runaway upload cannot hold memory.
 * @param req - the request to drain.
 * @param limit - the largest body accepted, in bytes.
 * @returns the body text.
 * @throws {EditorError} bad-request when it exceeded the limit.
 */
export async function readBody(req: IncomingMessage, limit = 16 * 1024): Promise<string> {
  let body = ''
  for await (const chunk of req) {
    body += String(chunk)
    if (body.length > limit) throw new EditorError('bad-request', 'the request body is too large', 413)
  }
  return body
}

/**
 * Parse one JSON request body into its named string fields.
 * @param body - the drained request body.
 * @returns the object it carried.
 * @throws {EditorError} bad-request when it is not a JSON object.
 */
export function parseJsonObject(body: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new EditorError('bad-request', 'the request is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new EditorError('bad-request', 'the request is not a JSON object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Read one required string field.
 * @param body - the parsed request object.
 * @param name - the field name.
 * @returns its non-blank value.
 * @throws {EditorError} bad-request when absent or blank.
 */
export function requireString(body: Record<string, unknown>, name: string): string {
  const value = body[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EditorError('bad-request', `missing "${name}"`)
  }
  return value
}

/**
 * Read one optional string field.
 * @param body - the parsed request object.
 * @param name - the field name.
 * @returns its non-blank value, or undefined.
 */
export function optionalString(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
