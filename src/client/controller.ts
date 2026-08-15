/**
 * The picker's state: what the host has, what the user last chose, and what is
 * being started right now.
 *
 * Two things are worth naming here. The list is fetched ONCE PER PAGE, at
 * plugin mount rather than per header or per menu opening: the sweep is a few
 * dozen `stat` calls the host caches anyway, and paying for it up front is
 * what lets the button carry the right icon and open the right editor on the
 * first press instead of after the user has opened the menu once. And the last
 * choice is REMEMBERED across reloads, because this control's whole shape (one
 * button that opens, one chevron that picks) only pays off if pressing the
 * button does what the user did last time.
 * @module @omdsh-plugins/omdsh-editor/src/client/controller
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EditorPickerState } from './contract.ts'
import type { EditorCatalogBody, EditorDescriptor, EditorErrorBody, OpenRequestBody } from '../shared.ts'
import { EDITORS_PATH, OPEN_PATH } from '../shared.ts'

/** Where the remembered choice is kept. */
export const PREFERENCE_KEY = 'omdsh-editor:preferred'

const INITIAL: EditorPickerState = {
  status: 'idle',
  editors: [],
  platform: '',
  preferredId: undefined,
  openingId: undefined,
  error: undefined,
}

/** The browser capabilities this controller uses, so a spec can supply its own. */
export interface EditorPickerDeps {
  /**
   * Fetch one of this plugin's routes.
   * @param path - the route path.
   * @param init - request options.
   * @returns the response.
   */
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  /** Reading the remembered choice; absent storage (private mode) reads undefined. */
  readPreference: () => string | undefined
  /** Writing it; failures are ignored, since a forgotten preference is not a fault. */
  writePreference: (id: string) => void
}

/**
 * The real browser's capabilities.
 * @returns deps backed by `fetch` and `localStorage`.
 */
export function browserDeps(): EditorPickerDeps {
  return {
    // Same-origin relative paths: the routes are served by the very server
    // that served this page, and the trust fence wants the browser's own
    // same-origin markers on the request.
    fetch: (path, init) => fetch(path, { ...init, credentials: 'same-origin' }),
    readPreference: () => {
      try {
        return localStorage.getItem(PREFERENCE_KEY) ?? undefined
      } catch {
        return undefined
      }
    },
    writePreference: (id) => {
      try {
        localStorage.setItem(PREFERENCE_KEY, id)
      } catch {
        // Storage disabled or full. The choice holds for this page's life and
        // is forgotten on reload, which is a smaller loss than a thrown error
        // in the middle of opening an editor.
      }
    },
  }
}

/**
 * Read the error message out of a refused response, falling back to the
 * status when the body is not this plugin's envelope.
 * @param response - the refused response.
 * @returns human text for the picker.
 */
async function refusalText(response: Response): Promise<string> {
  try {
    const body = await response.json() as EditorErrorBody
    const message = body.error?.message
    if (typeof message === 'string' && message !== '') return message
  } catch {
    // Not our envelope — a proxy's own error page, most likely.
  }
  return `HTTP ${response.status}`
}

/** Message text of an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Holds the picker's state and talks to the host half. */
export class EditorPickerController {
  /** The snapshot the picker renders from. */
  readonly store: SnapshotStore<EditorPickerState> = createSnapshotStore(INITIAL)

  /** True once a list has been asked for, so opening the menu again is free. */
  private requested = false

  /** @param deps - see {@link EditorPickerDeps}. */
  constructor(private readonly deps: EditorPickerDeps) {}

  /**
   * Ask the host for its applications, once — plus one retry per opening after
   * a failure.
   *
   * Idempotent for the successful case, because the menu calls this every time
   * it opens and a settled list is not worth re-fetching. A FAILED list is,
   * though: the usual cause is a runtime that was restarting, and opening the
   * menu again is exactly when the user wants another attempt.
   * @returns completion once the list settled, successfully or not.
   */
  async list(): Promise<void> {
    const { status } = this.store.getSnapshot()
    if (this.requested && status !== 'error') return
    this.requested = true
    await this.refresh()
  }

  /**
   * Ask the host again, whatever was asked before.
   * @returns completion once the list settled, successfully or not.
   */
  async refresh(): Promise<void> {
    this.patch({ status: 'loading', error: undefined })
    try {
      const response = await this.deps.fetch(EDITORS_PATH)
      if (!response.ok) {
        this.patch({ status: 'error', error: await refusalText(response) })
        return
      }
      const body = await response.json() as EditorCatalogBody
      const editors = Array.isArray(body.editors) ? body.editors : []
      this.patch({
        status: 'ready',
        editors,
        platform: typeof body.platform === 'string' ? body.platform : '',
        preferredId: this.resolvePreferred(editors),
      })
    } catch (error) {
      // The runtime went away mid-request, which the connection banner is
      // already saying; the picker only has to stop looking like it is loading.
      this.patch({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Open one application on a directory, and remember the choice.
   * @param sessionId - the conversation whose directory is opened.
   * @param editorId - which application.
   * @param cwd - the directory the browser derived; the host's fallback only.
   * @returns completion once the host answered.
   */
  async open(sessionId: SessionId, editorId: string, cwd: string | undefined): Promise<void> {
    // The choice is remembered before the attempt, not after: the user did
    // choose it, and a launch that failed for a reason they will fix (a moved
    // folder) should not also lose their editor.
    this.deps.writePreference(editorId)
    this.patch({ preferredId: editorId, openingId: editorId, error: undefined })
    const request: OpenRequestBody = {
      sessionId: String(sessionId),
      editorId,
      ...cwd === undefined ? {} : { cwd },
    }
    try {
      const response = await this.deps.fetch(OPEN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        const error = await refusalText(response)
        this.patch({ openingId: undefined, error })
        // The application is gone from the host: re-listing is what makes the
        // row disappear rather than fail again on the next press.
        if (response.status === 404) void this.refresh()
        return
      }
      this.patch({ openingId: undefined })
    } catch (error) {
      this.patch({ openingId: undefined, error: messageOf(error) })
    }
  }

  /** Dismiss the last failure without retrying. */
  dismissError(): void {
    if (this.store.getSnapshot().error === undefined) return
    this.patch({ error: undefined })
  }

  /**
   * Which application the button itself opens.
   * @param editors - the applications the host listed.
   * @returns the remembered choice when it is still installed, else the first
   * listed — which is the top editor, and the right guess for someone who has
   * never used this control.
   */
  private resolvePreferred(editors: readonly EditorDescriptor[]): string | undefined {
    const remembered = this.store.getSnapshot().preferredId ?? this.deps.readPreference()
    if (remembered !== undefined && editors.some(editor => editor.id === remembered)) return remembered
    return editors[0]?.id
  }

  /**
   * Merge a partial state into the store.
   * @param next - the fields that changed.
   */
  private patch(next: Partial<EditorPickerState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...next })
  }
}
