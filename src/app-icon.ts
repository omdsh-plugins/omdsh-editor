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

import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** Magic at the head of an `.icns` container. */
const ICNS_MAGIC = 'icns'

/**
 * Smallest edge worth serving. The mark renders at 16–18 CSS px, so 64 is
 * crisp at 2x and still a couple of kilobytes; below this the browser would be
 * upscaling on a retina display.
 */
export const PREFERRED_ICON_EDGE = 64

/** One PNG variant found inside an `.icns`. */
export interface IcnsVariant {
  /** The four-character entry type, for diagnostics. */
  type: string
  /** Pixel width, read from the PNG's own IHDR. */
  width: number
  /** The PNG bytes, ready to serve verbatim. */
  png: Buffer
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
export function icnsVariants(icns: Buffer): IcnsVariant[] {
  if (icns.length < 8 || icns.toString('latin1', 0, 4) !== ICNS_MAGIC) return []
  // The header's own length field bounds the walk, but a truncated file must
  // not be walked past its end either.
  const end = Math.min(icns.readUInt32BE(4), icns.length)
  const variants: IcnsVariant[] = []
  let offset = 8
  while (offset + 8 <= end) {
    const type = icns.toString('latin1', offset, offset + 4)
    const length = icns.readUInt32BE(offset + 4)
    // A length that does not advance past its own header would loop forever;
    // one that runs past the end is a truncated file.
    if (length < 8 || offset + length > end) break
    const data = icns.subarray(offset + 8, offset + length)
    // IHDR's width sits at a fixed offset: 8 signature + 4 length + 4 'IHDR'.
    if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
      variants.push({ type, width: data.readUInt32BE(16), png: data })
    }
    offset += length
  }
  return variants
}

/**
 * The variant to serve: the smallest one that is still crisp, or the largest
 * available when every variant is below that.
 * @param variants - what the container carried.
 * @returns the chosen PNG, or undefined when there were none.
 */
export function pickVariant(variants: readonly IcnsVariant[]): Buffer | undefined {
  if (variants.length === 0) return undefined
  const byWidth = [...variants].sort((a, b) => a.width - b.width)
  const crisp = byWidth.find(variant => variant.width >= PREFERRED_ICON_EDGE)
  return (crisp ?? byWidth[byWidth.length - 1])?.png
}

/** Reading a bundle, as this module needs it (a spec supplies its own). */
export interface BundleReader {
  /**
   * Read one file whole.
   * @param path - absolute path.
   * @returns its bytes; rejects when it is not there.
   */
  readFile: (path: string) => Promise<Buffer>
  /**
   * List one directory.
   * @param path - absolute path.
   * @returns the entry names; rejects when it is not there.
   */
  readdir: (path: string) => Promise<string[]>
}

/** The real filesystem. */
export const hostBundleReader: BundleReader = { readFile, readdir }

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
export function iconFileFromPlist(plist: Buffer): string | undefined {
  if (plist.subarray(0, 8).toString('latin1') === 'bplist00') return undefined
  const match = /<key>CFBundleIconFile<\/key>\s*<string>([^<]*)<\/string>/
    .exec(plist.toString('utf8'))
  const value = match?.[1]?.trim()
  if (value === undefined || value === '') return undefined
  // The value names a file inside the bundle's own Resources. Anything that
  // could climb out of it is a malformed bundle, not an icon.
  if (value.includes('/') || value.includes('\\') || value.includes('..')) return undefined
  return value.toLowerCase().endsWith('.icns') ? value : `${value}.icns`
}

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
export async function resolveIconPath(bundle: string, reader: BundleReader): Promise<string | undefined> {
  const resources = join(bundle, 'Contents', 'Resources')

  const declared = await reader.readFile(join(bundle, 'Contents', 'Info.plist'))
    .then(iconFileFromPlist, () => undefined)
  if (declared !== undefined) {
    const path = join(resources, declared)
    if (await reader.readFile(path).then(() => true, () => false)) return path
  }

  const named = join(resources, `${basename(bundle, '.app')}.icns`)
  if (await reader.readFile(named).then(() => true, () => false)) return named

  const entries = await reader.readdir(resources).catch(() => [] as string[])
  const icons = entries.filter(entry => entry.toLowerCase().endsWith('.icns'))
  return icons.length === 1 && icons[0] !== undefined ? join(resources, icons[0]) : undefined
}

/**
 * One application's icon as PNG bytes.
 * @param bundle - absolute path of the `.app`.
 * @param reader - filesystem access.
 * @returns the PNG, or undefined when the bundle yielded none.
 */
export async function readAppIcon(
  bundle: string,
  reader: BundleReader = hostBundleReader,
): Promise<Buffer | undefined> {
  const path = await resolveIconPath(bundle, reader)
  if (path === undefined) return undefined
  const icns = await reader.readFile(path).catch(() => undefined)
  if (icns === undefined) return undefined
  return pickVariant(icnsVariants(icns))
}

/**
 * Icons already extracted, held for the process's life.
 *
 * An application's icon changes only when the application is replaced, and a
 * replaced application restarts the runtime often enough in practice; the
 * browser's own cache means this is consulted about once per page anyway. A
 * miss is remembered too — re-scanning a 300 KB container on every menu open
 * to conclude "no icon" again is the one case worth caching hardest.
 */
export class IconCache {
  private readonly icons = new Map<string, Buffer | undefined>()

  /**
   * @param reader - filesystem access.
   */
  constructor(private readonly reader: BundleReader = hostBundleReader) {}

  /**
   * One bundle's icon.
   * @param key - cache key; the editor id.
   * @param bundle - absolute path of the `.app`.
   * @returns the PNG, or undefined when there is none to serve.
   */
  async get(key: string, bundle: string): Promise<Buffer | undefined> {
    if (this.icons.has(key)) return this.icons.get(key)
    const icon = await readAppIcon(bundle, this.reader)
    this.icons.set(key, icon)
    return icon
  }

  /** Forget everything, so the next read goes back to disk. */
  clear(): void {
    this.icons.clear()
  }
}
