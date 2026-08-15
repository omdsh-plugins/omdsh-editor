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
 * @module @omdsh-plugins/omdsh-editor/src/client/EditorMark
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { EditorKind } from '../shared.ts'
import { ICON_PATH } from '../shared.ts'
import { EditorGlyph } from './EditorGlyph.tsx'
import css from './EditorMark.module.css'

/**
 * Where one application's icon is fetched from.
 * @param id - the editor id.
 * @returns the icon route with its query.
 */
export function iconUrl(id: string): string {
  return `${ICON_PATH}?id=${encodeURIComponent(id)}`
}

/**
 * Render one application's mark.
 * @param props.id - the editor id, naming the icon to fetch.
 * @param props.kind - the fallback glyph's kind.
 * @param props.accent - the fallback glyph's tint.
 * @param props.icon - whether the host has an icon for this application.
 * @param props.size - square edge in px (default 16).
 * @returns the icon, or the glyph.
 */
export function EditorMark({ id, kind, accent, icon, size = 16 }: {
  id: string
  kind: EditorKind
  accent?: string | undefined
  icon?: boolean | undefined
  size?: number
}): ReactNode {
  const [failed, setFailed] = useState(false)

  // A row can be re-used for another application as the list refreshes; a
  // stale failure would then hide an icon that does exist.
  useEffect(() => { setFailed(false) }, [id])

  if (icon !== true || failed) return <EditorGlyph kind={kind} accent={accent} size={size} />

  return (
    <img
      className={css.icon}
      src={iconUrl(id)}
      width={size}
      height={size}
      // The label beside it already names the application, so the icon is
      // decoration and a second reading of the name would be noise.
      alt=""
      aria-hidden="true"
      draggable={false}
      // 404 is the ordinary answer for an application whose icon could not be
      // read, not an exception — the glyph is what that means.
      onError={() => { setFailed(true) }}
    />
  )
}
