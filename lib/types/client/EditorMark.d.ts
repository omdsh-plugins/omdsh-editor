/**
 * The mark one listed application is drawn with: its own icon, or the glyph of
 * its kind when the host has no icon to give.
 *
 * The real icon is the point — six rows of coloured squares are told apart at
 * a glance the way a Dock is, and an approximation never quite is. It comes
 * from the copy of the application installed on the host, served by this
 * plugin's own icon route; nothing is bundled here.
 *
 * The glyph stays as the fallback rather than being deleted, because two cases
 * still reach it: a host whose applications are not macOS bundles, and a
 * bundle whose icon cannot be identified. It also covers the moment before the
 * image has loaded, so a menu never opens onto blank space where marks go.
 */
import type { ReactNode } from 'react';
import type { EditorKind } from '../shared.ts';
/**
 * Where one application's icon is fetched from.
 * @param id - the editor id.
 * @returns the icon route with its query.
 */
export declare function iconUrl(id: string): string;
/**
 * Render one application's mark.
 * @param props.id - the editor id, naming the icon to fetch.
 * @param props.kind - the fallback glyph's kind.
 * @param props.accent - the fallback glyph's tint.
 * @param props.icon - whether the host has an icon for this application.
 * @param props.size - square edge in px (default 16).
 * @returns the icon, or the glyph.
 */
export declare function EditorMark({ id, kind, accent, icon, size }: {
    id: string;
    kind: EditorKind;
    accent?: string | undefined;
    icon?: boolean | undefined;
    size?: number;
}): ReactNode;
//# sourceMappingURL=EditorMark.d.ts.map