/**
 * The real icon of an installed application, read off the user's own disk.
 *
 * The picker draws each row with the product's actual mark rather than an
 * approximation of it. That is a deliberate choice about WHERE the artwork
 * comes from: nothing is redrawn and nothing is redistributed — the bytes are
 * the ones already in the application bundle on this machine, rendered locally,
 * exactly as the platform's own "Open With" menu renders them. A package that
 * shipped a dozen vendors' logos would be a licensing question; reading the
 * copy the user installed is not.
 *
 * The extraction is pure Node. An `.icns` is a flat type-length-value
 * container, and every modern one carries its large variants as embedded PNG,
 * so the icon is a scan and a slice — no `sips`, no subprocess, nothing to go
 * wrong on a host where a command line tool moved.
 * @module @omdsh-plugins/omdsh-editor/src/app-icon
 */
/**
 * Smallest edge worth serving. The mark renders at 16–18 CSS px, so 64 is
 * crisp at 2x and still a couple of kilobytes; below this the browser would be
 * upscaling on a retina display.
 */
export declare const PREFERRED_ICON_EDGE = 64;
/** One PNG variant found inside an `.icns`. */
export interface IcnsVariant {
    /** The four-character entry type, for diagnostics. */
    type: string;
    /** Pixel width, read from the PNG's own IHDR. */
    width: number;
    /** The PNG bytes, ready to serve verbatim. */
    png: Buffer;
}
/**
 * Every PNG variant an `.icns` carries, in container order.
 *
 * Entries that are not PNG — the old raw and RLE bitmaps, the JPEG 2000
 * variants, the table of contents — are skipped rather than decoded: the
 * point is to find bytes a browser already understands.
 * @param icns - the whole `.icns` file.
 * @returns the PNG variants; empty when the file carries none.
 */
export declare function icnsVariants(icns: Buffer): IcnsVariant[];
/**
 * The variant to serve: the smallest one that is still crisp, or the largest
 * available when every variant is below that.
 * @param variants - what the container carried.
 * @returns the chosen PNG, or undefined when there were none.
 */
export declare function pickVariant(variants: readonly IcnsVariant[]): Buffer | undefined;
/** Reading a bundle, as this module needs it (a spec supplies its own). */
export interface BundleReader {
    /**
     * Read one file whole.
     * @param path - absolute path.
     * @returns its bytes; rejects when it is not there.
     */
    readFile: (path: string) => Promise<Buffer>;
    /**
     * List one directory.
     * @param path - absolute path.
     * @returns the entry names; rejects when it is not there.
     */
    readdir: (path: string) => Promise<string[]>;
}
/** The real filesystem. */
export declare const hostBundleReader: BundleReader;
/**
 * The icon file named by a bundle's `Info.plist`.
 *
 * Only the XML form is read, with a regex rather than a plist parser: this is
 * one string out of one well-known key, and carrying a binary-plist decoder to
 * reach it would be a lot of surface for the handful of bundles that use one.
 * Those fall through to {@link resolveIconPath}'s naming fallbacks, which is
 * how Xcode — binary plist, icon named after the app — is still found.
 * @param plist - the raw `Info.plist` bytes.
 * @returns the `CFBundleIconFile` value, or undefined.
 */
export declare function iconFileFromPlist(plist: Buffer): string | undefined;
/**
 * Where one bundle keeps its icon.
 *
 * Three chances, because no single rule covers every bundle: the declared
 * name, the app's own name (which is what an application with a binary
 * `Info.plist` almost always uses), and — only when the directory holds
 * exactly one — the sole `.icns` there. The last is deliberately not a
 * "pick the first" guess: VS Code's Resources holds sixty of them, one per
 * file type it claims, and any of those would be the wrong picture.
 * @param bundle - absolute path of the `.app`.
 * @param reader - filesystem access.
 * @returns the absolute icon path, or undefined when none was identified.
 */
export declare function resolveIconPath(bundle: string, reader: BundleReader): Promise<string | undefined>;
/**
 * One application's icon as PNG bytes.
 * @param bundle - absolute path of the `.app`.
 * @param reader - filesystem access.
 * @returns the PNG, or undefined when the bundle yielded none.
 */
export declare function readAppIcon(bundle: string, reader?: BundleReader): Promise<Buffer | undefined>;
/**
 * Icons already extracted, held for the process's life.
 *
 * An application's icon changes only when the application is replaced, and a
 * replaced application restarts the runtime often enough in practice; the
 * browser's own cache means this is consulted about once per page anyway. A
 * miss is remembered too — re-scanning a 300 KB container on every menu open
 * to conclude "no icon" again is the one case worth caching hardest.
 */
export declare class IconCache {
    private readonly reader;
    private readonly icons;
    /**
     * @param reader - filesystem access.
     */
    constructor(reader?: BundleReader);
    /**
     * One bundle's icon.
     * @param key - cache key; the editor id.
     * @param bundle - absolute path of the `.app`.
     * @returns the PNG, or undefined when there is none to serve.
     */
    get(key: string, bundle: string): Promise<Buffer | undefined>;
    /** Forget everything, so the next read goes back to disk. */
    clear(): void;
}
//# sourceMappingURL=app-icon.d.ts.map