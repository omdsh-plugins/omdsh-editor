/**
 * What the picker is handed, and the vocabulary it renders from.
 *
 * The surface lives in `conversation.session.header.utilities` — the
 * right-aligned utility row ui-conversation already declares — so no SlotMap
 * merge belongs here: this package contributes one entry and declares nothing.
 * @module @omdsh-plugins/omdsh-editor/src/client/contract
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls ui-conversation's SlotMap merge (the target slot) into this
// program. A value import would be a client-bundle purity error.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls `ctx.slots` (moved out of dsh-client-runtime onto the renderer).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls sessionId, useSession, and useSessions standard-kit merges.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { EditorDescriptor } from '../shared.ts'

/** How far the picker has got with the host's list of installed applications. */
export type CatalogStatus =
  /** Nothing asked for yet — the picker has not been opened. */
  | 'idle'
  /** The sweep is in flight. */
  | 'loading'
  /** The list arrived (possibly empty). */
  | 'ready'
  /** The request itself failed; {@link EditorPickerState.error} says how. */
  | 'error'

/** Everything the picker renders from. */
export interface EditorPickerState {
  /** How far the catalog request has got. */
  status: CatalogStatus
  /** The applications this host has, in the host's listing order. */
  editors: readonly EditorDescriptor[]
  /** `process.platform` of the host that would run them; empty until listed. */
  platform: string
  /**
   * The application the button itself opens: the last one the user chose here,
   * else the first listed. Undefined while the list is empty.
   */
  preferredId: string | undefined
  /** The application currently being started, if any — the button's busy state. */
  openingId: string | undefined
  /** The last failure, shown under the button until the next attempt. */
  error: string | undefined
}

/** Injected face of the picker: the live state, and the two gestures. */
export interface EditorPickerInjected {
  /** Framework-bound sources: the state above. */
  hooks: { editorPicker: ObservableSnapshot<EditorPickerState> }
  /**
   * Ask the host which applications it has. Settles once per page; calling it
   * again after a failure retries, which is what opening the menu does.
   */
  list: () => void
  /**
   * Open one application on this session's directory.
   * @param sessionId - the conversation whose directory is opened.
   * @param editorId - {@link EditorDescriptor.id} of the application.
   * @param cwd - the directory the browser derived, sent as the host's fallback.
   */
  open: (sessionId: SessionId, editorId: string, cwd: string | undefined) => void
  /** Dismiss the last failure without retrying. */
  dismissError: () => void
}

/** Full picker props: the utility seat, the injected face, and copy. */
export type EditorPickerProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<EditorPickerInjected>
  & PropsLocale<'editor'>
