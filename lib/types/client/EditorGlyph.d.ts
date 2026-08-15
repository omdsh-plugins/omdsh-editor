/**
 * The mark one listed application is drawn with.
 *
 * Three glyphs, one per {@link EditorKind}, tinted with the product's accent —
 * not the vendor's logo. Redrawing a dozen trademarks is a licensing question
 * this plugin has no answer to, and an approximate logo reads worse than an
 * honest glyph. What a row actually has to do is be distinguishable at 16px in
 * a list of six, and a kind glyph in the product's own color does that: the
 * blue square is VS Code, the grey one is Cursor, the green one is iTerm2.
 *
 * The glyphs are drawn here rather than taken from ui-primitives because the
 * shipped set has no terminal mark, and three hand-drawn paths that agree with
 * each other beat two borrowed ones and an odd third.
 */
import type { ReactNode } from 'react';
import type { EditorKind } from '../shared.ts';
/**
 * Render one application's mark.
 * @param props.kind - which glyph to draw.
 * @param props.accent - the product's accent color, as the glyph is tinted.
 * @param props.size - square edge in px (default 16).
 * @returns the glyph element.
 */
export declare function EditorGlyph({ kind, accent, size }: {
    kind: EditorKind;
    /** Absent inherits the surrounding text color — the neutral, pre-catalog mark. */
    accent?: string | undefined;
    size?: number;
}): ReactNode;
//# sourceMappingURL=EditorGlyph.d.ts.map