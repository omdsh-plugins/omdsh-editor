/**
 * `editor` namespace dictionaries.
 *
 * Product names are absent on purpose: "VS Code" and "iTerm2" are what their
 * vendors call them in every language, and they arrive from the host's catalog
 * rather than from here. Only the harness's own words are translated.
 */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "editor";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'trigger.aria': string;
    'trigger.menu.aria': string;
    open: string;
    'open.in': string;
    opening: string;
    loading: string;
    empty: string;
    'empty.remote': string;
    'remote.note': string;
    retry: string;
    failed: string;
};
/** The editor namespace key union. */
export type EditorKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'trigger.aria': string;
    'trigger.menu.aria': string;
    open: string;
    'open.in': string;
    opening: string;
    loading: string;
    empty: string;
    'empty.remote': string;
    'remote.note': string;
    retry: string;
    failed: string;
};
//# sourceMappingURL=locales.d.ts.map