/**
 * Open the project in an editor, browser half: one entry into a slot the
 * harness already declares.
 *
 * `conversation.session.header.utilities` is the right-aligned utility row of
 * the session header — the seat for a per-session control that is not session
 * context and not part of the title's action group. That is exactly what this
 * is: an optional way out of the conversation and into the files, which should
 * sit beside the panel toggles and never reorder anything around them.
 *
 * Nothing here is a harness change. The registration goes through
 * `slots.inject()` (which waits for the declaration, withdraws with it, and
 * re-registers if it returns), the package declares no slot of its own, and
 * removing this plugin's row removes the control with it.
 * @module @omdsh-plugins/omdsh-editor/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls `ctx.slots` (moved out of dsh-client-runtime onto the renderer).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { EditorPickerInjected } from './contract.ts'
import { EditorPickerController, browserDeps } from './controller.ts'
import { EditorPicker } from './EditorPicker.tsx'
import { en, NS, zh, type EditorKey } from './locales.ts'

export type { CatalogStatus, EditorPickerInjected, EditorPickerProps, EditorPickerState } from './contract.ts'
export { EditorPickerController, PREFERENCE_KEY, browserDeps } from './controller.ts'
export type { EditorPickerDeps } from './controller.ts'
export { EditorPicker, buildItems, directoryOf } from './EditorPicker.tsx'
export { EditorGlyph } from './EditorGlyph.tsx'
export { EditorMark, iconUrl } from './EditorMark.tsx'
export { NS, en, zh } from './locales.ts'
export type { EditorKey } from './locales.ts'
export type { EditorDescriptor, EditorKind } from '../shared.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The picker's copy. */
    editor: EditorKey
  }
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Mount the picker.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'omdsh-editor: dictionaries')

  const controller = new EditorPickerController(browserDeps())

  // One sweep per page, started here rather than on first menu open: the
  // button carries the last-used editor's mark and opens it on the first
  // press, and neither is possible before the list has arrived. A failure is
  // not raised — the picker renders the reason itself, and a plugin that
  // threw here would take the whole client fiber with it.
  ctx.effect(() => {
    void controller.list()
    return () => {}
  }, 'omdsh-editor: initial editor sweep')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'omdsh-editor-picker',
    // After the harness's own utilities: this is an exit from the
    // conversation, and an exit belongs at the end of a row.
    order: 100,
    locale: NS,
    inject: (): EditorPickerInjected => ({
      hooks: { editorPicker: controller.store },
      list: () => { void controller.list() },
      open: (sessionId: SessionId, editorId: string, cwd: string | undefined) => {
        void controller.open(sessionId, editorId, cwd)
      },
      dismissError: () => { controller.dismissError() },
    }),
  }, EditorPicker))
}
