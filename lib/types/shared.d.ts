/**
 * The contract between this plugin's two halves: the route paths and the JSON
 * shapes they carry.
 *
 * Node-free on purpose. The browser half imports this module for real (the
 * client bundle inlines it), so one `node:` import here would put the
 * filesystem and `child_process` in the browser bundle's module graph.
 * Everything that touches a disk or spawns anything lives in
 * [detect](./detect.ts) and [launch](./launch.ts) instead.
 * @module @omdsh-plugins/omdsh-editor/src/shared
 */
/** Path prefix every route of this plugin lives under. */
export declare const ROUTE_PREFIX = "/omdsh-editor";
/** The editors this host actually has, as the picker lists them. */
export declare const EDITORS_PATH = "/omdsh-editor/editors";
/** Launch one of them on a session's directory. */
export declare const OPEN_PATH = "/omdsh-editor/open";
/**
 * One application's own icon, as PNG. Takes `?id=<editorId>`.
 *
 * A route rather than bytes inlined into the catalog answer: the icons are a
 * few kilobytes each and the browser caches them, so paying for them once and
 * lazily beats making every list request carry all of them.
 */
export declare const ICON_PATH = "/omdsh-editor/icon";
/**
 * The kind of an application, which decides the fallback mark.
 *
 * A row is drawn with the product's REAL icon, read from the copy installed on
 * the host ({@link EditorDescriptor.icon}). Where that is not available — a
 * host whose applications are not macOS bundles, a bundle whose icon cannot be
 * identified — the row falls back to the glyph of its kind, tinted with the
 * product's accent, which is still enough to tell six rows apart at a glance.
 */
export type EditorKind = 
/** An editor or IDE: it is handed the directory as a project root. */
'code'
/** A terminal emulator: it opens a shell whose working directory is the project. */
 | 'terminal'
/** The desktop file manager: it reveals the directory. */
 | 'files';
/** One application the picker offers, as the browser half sees it. */
export interface EditorDescriptor {
    /** Stable identity; what an open request names. Never shown. */
    id: string;
    /** What the row reads as — the vendor's own product name, untranslated. */
    label: string;
    /** Which glyph the row falls back to (see {@link EditorKind}). */
    kind: EditorKind;
    /** CSS color the fallback glyph is tinted with: the product's accent. */
    accent: string;
    /**
     * True when {@link ICON_PATH} can serve this application's own icon, so the
     * picker should ask for it. False means the fallback glyph is the mark —
     * asking anyway would be a guaranteed 404 per row.
     */
    icon: boolean;
}
/** What the catalog route answers with. */
export interface EditorCatalogBody {
    /**
     * Every application found on this host, in the order the picker lists them:
     * editors, then the file manager, then terminals.
     */
    editors: EditorDescriptor[];
    /**
     * `process.platform` of the host that would run the editor. The picker says
     * so when the list is empty, because "nothing installed" and "this host is
     * not your desktop" are different problems with different fixes.
     */
    platform: string;
}
/** What the browser half posts to open a directory. */
export interface OpenRequestBody {
    /** The conversation whose directory is opened. */
    sessionId: string;
    /** {@link EditorDescriptor.id} of the application to launch. */
    editorId: string;
    /**
     * The directory the browser believes the session is in. Advisory only: the
     * host resolves the session's own working directory first and uses this
     * only when the session carries none (see the host half's `resolveRoot`).
     */
    cwd?: string;
}
/** What a successful open answers with. */
export interface OpenResultBody {
    /** The application that was launched. */
    editorId: string;
    /** The directory it was handed — the host's resolution, not the browser's. */
    path: string;
}
/** Machine-routable failure kinds the browser half branches on. */
export type EditorErrorCode = 
/** The request is missing a field, or one of them is malformed. */
'bad-request'
/** No installed application answers to that id. */
 | 'unknown-editor'
/** The session has no directory, and none was offered. */
 | 'no-directory'
/** The directory is gone, or is not a directory. */
 | 'bad-directory'
/** The application was found but would not start. */
 | 'launch-failed';
/** The failure envelope every route answers a refusal with. */
export interface EditorErrorBody {
    error: {
        code: EditorErrorCode;
        message: string;
    };
}
//# sourceMappingURL=shared.d.ts.map