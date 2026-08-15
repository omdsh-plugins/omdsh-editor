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
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { CatalogStatus, EditorPickerState } from './contract.ts';
/** Where the remembered choice is kept. */
export declare const PREFERENCE_KEY = "omdsh-editor:preferred";
/** The browser capabilities this controller uses, so a spec can supply its own. */
export interface EditorPickerDeps {
    /**
     * Fetch one of this plugin's routes.
     * @param path - the route path.
     * @param init - request options.
     * @returns the response.
     */
    fetch: (path: string, init?: RequestInit) => Promise<Response>;
    /** Reading the remembered choice; absent storage (private mode) reads undefined. */
    readPreference: () => string | undefined;
    /** Writing it; failures are ignored, since a forgotten preference is not a fault. */
    writePreference: (id: string) => void;
}
/**
 * The real browser's capabilities.
 * @returns deps backed by `fetch` and `localStorage`.
 */
export declare function browserDeps(): EditorPickerDeps;
/** Holds the picker's state and talks to the host half. */
export declare class EditorPickerController {
    private readonly deps;
    /** The snapshot the picker renders from. */
    readonly store: SnapshotStore<EditorPickerState>;
    /** True once a list has been asked for, so opening the menu again is free. */
    private requested;
    /** @param deps - see {@link EditorPickerDeps}. */
    constructor(deps: EditorPickerDeps);
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
    list(): Promise<void>;
    /**
     * Ask the host again, whatever was asked before.
     * @returns completion once the list settled, successfully or not.
     */
    refresh(): Promise<void>;
    /**
     * Open one application on a directory, and remember the choice.
     * @param sessionId - the conversation whose directory is opened.
     * @param editorId - which application.
     * @param cwd - the directory the browser derived; the host's fallback only.
     * @returns completion once the host answered.
     */
    open(sessionId: SessionId, editorId: string, cwd: string | undefined): Promise<void>;
    /** Dismiss the last failure without retrying. */
    dismissError(): void;
    /**
     * Which application the button itself opens.
     * @param editors - the applications the host listed.
     * @returns the remembered choice when it is still installed, else the first
     * listed — which is the top editor, and the right guess for someone who has
     * never used this control.
     */
    private resolvePreferred;
    /**
     * Merge a partial state into the store.
     * @param next - the fields that changed.
     */
    private patch;
}
/** Re-exported for the spec that pins the status vocabulary. */
export type { CatalogStatus };
//# sourceMappingURL=controller.d.ts.map