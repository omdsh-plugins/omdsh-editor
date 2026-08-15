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

import type { ReactNode } from 'react'
import type { EditorKind } from '../shared.ts'
import css from './EditorGlyph.module.css'

/** One glyph's path data, drawn on a 16×16 grid with a 1.5px stroke. */
const PATHS: Record<EditorKind, ReactNode> = {
  // Angle brackets: the universal "this is where code is edited".
  code: <path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5" />,
  // A prompt and a cursor rule.
  terminal: <path d="M3.5 5 6.5 8l-3 3M8.5 11.5h4" />,
  // A folder, opened.
  files: <path d="M2.5 12.5v-9h4l1.5 2h5.5v7z" />,
}

/**
 * Render one application's mark.
 * @param props.kind - which glyph to draw.
 * @param props.accent - the product's accent color, as the glyph is tinted.
 * @param props.size - square edge in px (default 16).
 * @returns the glyph element.
 */
export function EditorGlyph({ kind, accent, size = 16 }: {
  kind: EditorKind
  /** Absent inherits the surrounding text color — the neutral, pre-catalog mark. */
  accent?: string | undefined
  size?: number
}): ReactNode {
  return (
    <svg
      className={css.glyph}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      // The accent is host data, so it rides as a value rather than a class:
      // a stylesheet cannot enumerate colors it has never seen. `color` (not
      // `stroke`) so the paths inherit it and a disabled row can override the
      // whole glyph with one rule.
      {...accent === undefined ? {} : { style: { color: accent } }}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[kind]}
    </svg>
  )
}
