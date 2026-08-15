/**
 * The editor picker: one split capsule in the session header's utility row.
 *
 * Two affordances in one control, which is the whole design. The left half is
 * the verb — press it and the project opens in the editor you used last, no
 * menu, no decision. The right half is the chooser, and it is only needed the
 * first time and when you want a different one. A plain menu-only button would
 * make the common case two clicks; a plain button with no menu would make the
 * uncommon case impossible.
 *
 * The directory it opens is the session's, resolved on the host. What this
 * component derives from the workspace list is only what the tooltip says —
 * showing the user which folder is about to open is worth a lookup, and being
 * wrong about it costs nothing, because the host never takes the browser's
 * word for the path.
 */
import type { ReactNode } from 'react';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SessionId, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client';
import type { CatalogStatus, EditorPickerProps } from './contract.ts';
import type { EditorDescriptor } from '../shared.ts';
/**
 * What a non-selectable row's id begins with.
 *
 * The picker's `onSelect` already refuses anything the listed applications do
 * not claim, so this is the second lock rather than the first: a catalog id is
 * a bare identifier, so no application can ever collide with one of these and
 * a placeholder can never be mistaken for a choice.
 */
export declare const PLACEHOLDER_PREFIX = "placeholder:";
/**
 * The workspace directory this session is accounted under.
 * @param workspaces - the live workspace list.
 * @param sessionId - the current conversation.
 * @returns the absolute path, or undefined when no workspace claims it.
 */
export declare function directoryOf(workspaces: WorkspaceListState, sessionId: SessionId): string | undefined;
/**
 * Render the picker.
 * @param props - composed slot props (contract.ts).
 * @returns the split capsule and its menu.
 */
export declare function EditorPicker({ sessionId, useEditorPicker, useWorkspaces, list, open, dismissError, t, }: EditorPickerProps): ReactNode;
/**
 * The menu's rows: the applications, or the one line saying why there are
 * none. Every placeholder is a disabled row rather than an empty list, because
 * a menu that opens onto nothing reads as broken.
 * @param input.status - how far the catalog request got.
 * @param input.editors - the applications the host listed.
 * @param input.platform - the host's platform, named when the list is empty.
 * @param input.t - the namespace's translate.
 * @returns the rows to render.
 */
export declare function buildItems({ status, editors, platform, t }: {
    status: CatalogStatus;
    editors: readonly EditorDescriptor[];
    platform: string;
    t: EditorPickerProps['t'];
}): readonly MenuEntry[];
//# sourceMappingURL=EditorPicker.d.ts.map