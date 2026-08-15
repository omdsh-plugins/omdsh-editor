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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type EditorKey } from './locales.ts';
export type { CatalogStatus, EditorPickerInjected, EditorPickerProps, EditorPickerState } from './contract.ts';
export { EditorPickerController, PREFERENCE_KEY, browserDeps } from './controller.ts';
export type { EditorPickerDeps } from './controller.ts';
export { EditorPicker, buildItems, directoryOf } from './EditorPicker.tsx';
export { EditorGlyph } from './EditorGlyph.tsx';
export { EditorMark, iconUrl } from './EditorMark.tsx';
export { NS, en, zh } from './locales.ts';
export type { EditorKey } from './locales.ts';
export type { EditorDescriptor, EditorKind } from '../shared.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The picker's copy. */
        editor: EditorKey;
    }
}
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the picker.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map