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

import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutline14, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { CatalogStatus, EditorPickerProps } from './contract.ts'
import type { EditorDescriptor } from '../shared.ts'
import { EditorGlyph } from './EditorGlyph.tsx'
import { EditorMark } from './EditorMark.tsx'
import css from './EditorPicker.module.css'

/**
 * What a non-selectable row's id begins with.
 *
 * The picker's `onSelect` already refuses anything the listed applications do
 * not claim, so this is the second lock rather than the first: a catalog id is
 * a bare identifier, so no application can ever collide with one of these and
 * a placeholder can never be mistaken for a choice.
 */
export const PLACEHOLDER_PREFIX = 'placeholder:'

/**
 * The workspace directory this session is accounted under.
 * @param workspaces - the live workspace list.
 * @param sessionId - the current conversation.
 * @returns the absolute path, or undefined when no workspace claims it.
 */
export function directoryOf(workspaces: WorkspaceListState, sessionId: SessionId): string | undefined {
  return workspaces.items.find(item => item.sessionIds.includes(sessionId))?.path
}

/**
 * Render the picker.
 * @param props - composed slot props (contract.ts).
 * @returns the split capsule and its menu.
 */
export function EditorPicker({
  sessionId, useEditorPicker, useWorkspaces, list, open, dismissError, t,
}: EditorPickerProps): ReactNode {
  const { status, editors, platform, preferredId, openingId, error } = useEditorPicker(state => state)
  const directory = useWorkspaces(state => directoryOf(state, sessionId))
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)

  const preferred = editors.find(editor => editor.id === preferredId)
  const busy = openingId !== undefined

  /** Open the menu, asking the host for its list if that has not settled. */
  const openMenu = (): void => {
    dismissError()
    list()
    setMenuOpen(true)
  }

  /**
   * Run one application and close the menu.
   * @param editorId - which application.
   */
  const choose = (editorId: string): void => {
    setMenuOpen(false)
    open(sessionId, editorId, directory)
  }

  const items = useMemo<readonly MenuEntry[]>(
    () => buildItems({ status, editors, platform, t }),
    [status, editors, platform, t],
  )

  /**
   * One application's mark, or the neutral glyph before the host has said
   * anything at all.
   * @param editor - the application, when known.
   * @returns the mark.
   */
  const markOf = (editor: EditorDescriptor | undefined): ReactNode =>
    editor === undefined
      ? <EditorGlyph kind="code" />
      : <EditorMark id={editor.id} kind={editor.kind} accent={editor.accent} icon={editor.icon} size={18} />

  // Before the host has answered there is nothing to open, so the left half
  // becomes a second way into the menu rather than a button that would fail.
  const primaryLabel = preferred === undefined
    ? t('trigger.aria')
    : directory === undefined
      ? t('open', { editor: preferred.label })
      : t('open.in', { editor: preferred.label, path: directory })

  const trigger = (
    <div className={clsx(css.capsule, error !== undefined && css.faulted)} ref={triggerRef}>
      {/*
        Below the capsule, not the primitive's default right: this sits inside
        the session header's right-aligned utility row, so a bubble to its
        right opens over whatever holds the end of that row — and this label
        carries a full path, which makes it a wide one.
      */}
      <Tooltip
        label={busy ? t('opening', { editor: preferred?.label ?? '' }) : primaryLabel}
        side="bottom"
        delayMs={400}
      >
        <button
          type="button"
          className={css.primary}
          aria-label={primaryLabel}
          disabled={busy}
          aria-busy={busy}
          onClick={() => { preferred === undefined ? openMenu() : choose(preferred.id) }}
        >
          {markOf(preferred)}
        </button>
      </Tooltip>
      <button
        type="button"
        className={css.chevron}
        aria-label={t('trigger.menu.aria')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        onClick={() => { menuOpen ? setMenuOpen(false) : openMenu() }}
      >
        <IconChevronDownOutline14 />
      </button>
    </div>
  )

  return (
    <Menu
      open={menuOpen}
      anchor={trigger}
      items={items}
      // Only a real choice is selectable; the placeholder rows carry ids no
      // editor can have, so a stray select is a no-op rather than a bad open.
      onSelect={(id) => { if (editors.some(editor => editor.id === id)) choose(id) }}
      onClose={() => { setMenuOpen(false) }}
      align="end"
      // The header is inside the conversation column's own clipping context,
      // and a list this far right would be cropped by it.
      portal
      getAnchorRect={() => triggerRef.current?.getBoundingClientRect() ?? null}
      {...error === undefined
        ? {}
        : { footer: [{ type: 'label', id: 'error', text: t('failed', { reason: error }) }] as const }}
    />
  )
}

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
export function buildItems({ status, editors, platform, t }: {
  status: CatalogStatus
  editors: readonly EditorDescriptor[]
  platform: string
  t: EditorPickerProps['t']
}): readonly MenuEntry[] {
  if (status === 'idle' || status === 'loading') {
    return [{ id: `${PLACEHOLDER_PREFIX}loading`, label: t('loading'), disabled: true }]
  }
  if (editors.length > 0) {
    return editors.map(editor => ({
      id: editor.id,
      label: editor.label,
      icon: <EditorMark id={editor.id} kind={editor.kind} accent={editor.accent} icon={editor.icon} />,
    }))
  }
  // An empty list means two different things, and the fix differs: install an
  // editor, or realize the runtime is not on this desk.
  return [{
    id: `${PLACEHOLDER_PREFIX}empty`,
    label: platform === '' ? t('empty') : t('empty.remote', { platform }),
    disabled: true,
  }]
}
