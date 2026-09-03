// @vitest-environment jsdom
/** The picker component: what each state renders, and what each press does. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { EditorPicker, PLACEHOLDER_PREFIX, buildItems, directoryOf } from '../src/client/EditorPicker.tsx'
import type { EditorPickerProps, EditorPickerState } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'
import type { EditorDescriptor } from '../src/shared.ts'

afterEach(cleanup)

const SESSION = 's1' as SessionId
const VSCODE: EditorDescriptor = { id: 'vscode', label: 'VS Code', kind: 'code', accent: '#3b8eea', icon: true }
const ITERM: EditorDescriptor = { id: 'iterm2', label: 'iTerm2', kind: 'terminal', accent: '#3ecf5c', icon: true }

/**
 * The English dictionary as a translate function, `{name}` params substituted.
 * @param key - the dictionary key.
 * @param params - template values.
 * @returns the rendered copy.
 */
const t = ((key: string, params?: Record<string, unknown>) => {
  const text = (en as Record<string, string>)[key] ?? key
  return params === undefined
    ? text
    : text.replaceAll(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole))
}) as EditorPickerProps['t']

/**
 * Mount the picker over a fixed state.
 * @param state - what the store holds.
 * @param workspaces - the workspace list the directory is derived from.
 * @returns the gesture spies.
 */
function mount(state: Partial<EditorPickerState>, workspaces: readonly { path: string; sessionIds: string[] }[] = []) {
  const snapshot: EditorPickerState = {
    status: 'ready',
    editors: [],
    platform: 'darwin',
    preferredId: undefined,
    openingId: undefined,
    error: undefined,
    ...state,
  }
  const spies = { list: vi.fn(), open: vi.fn(), dismissError: vi.fn() }
  const props = {
    sessionId: SESSION,
    useEditorPicker: (select: (value: EditorPickerState) => unknown) => select(snapshot),
    useWorkspaces: (select: (value: WorkspaceSnapshot) => unknown) =>
      select({ items: workspaces } as unknown as WorkspaceSnapshot),
    t,
    ...spies,
  } as unknown as EditorPickerProps
  render(<EditorPicker {...props} />)
  return spies
}

describe('the trigger', () => {
  it('opens the preferred application on the primary press, with no menu', async () => {
    const { open } = mount({ editors: [VSCODE, ITERM], preferredId: 'iterm2' }, [
      { path: '/w/proj', sessionIds: ['s1'] },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Open /w/proj in iTerm2' }))
    expect(open).toHaveBeenCalledWith(SESSION, 'iterm2', '/w/proj')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens its tooltip below, where a path-long bubble covers nothing', () => {
    // The capsule sits in the session header's right-aligned utility row, so
    // the primitive's default right-hand bubble opens over whatever holds the
    // end of that row.
    mount({ editors: [VSCODE], preferredId: 'vscode' }, [{ path: '/w/proj', sessionIds: ['s1'] }])
    fireEvent.focus(screen.getByRole('button', { name: 'Open /w/proj in VS Code' }))
    const bubble = screen.getByRole('tooltip')
    expect(bubble.getAttribute('data-side')).toBe('bottom')
    expect(bubble.textContent).toBe('Open /w/proj in VS Code')
  })

  it('names the editor without a path when no workspace claims the session', async () => {
    const { open } = mount({ editors: [VSCODE], preferredId: 'vscode' }, [
      { path: '/w/other', sessionIds: ['s2'] },
    ])
    const button = screen.getByRole('button', { name: 'Open in VS Code' })
    fireEvent.click(button)
    // Still openable: the host resolves the session's own directory, and the
    // browser's derivation is only ever a fallback.
    expect(open).toHaveBeenCalledWith(SESSION, 'vscode', undefined)
  })

  it('opens the menu instead when nothing has been listed yet', async () => {
    const { list, open } = mount({ status: 'idle' })
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }))
    expect(open).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalled()
    expect(screen.getByText('Looking for installed editors…')).toBeTruthy()
  })

  it('disables both halves while an application is starting', () => {
    mount({ editors: [VSCODE], preferredId: 'vscode', openingId: 'vscode' })
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

describe('the menu', () => {
  it('lists the applications and opens the chosen one', async () => {
    const { list, open } = mount({ editors: [VSCODE, ITERM], preferredId: 'vscode' }, [
      { path: '/w/proj', sessionIds: ['s1'] },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Choose an editor' }))
    expect(list).toHaveBeenCalled()
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('VS Code')).toBeTruthy()
    fireEvent.click(within(menu).getByText('iTerm2'))
    expect(open).toHaveBeenCalledWith(SESSION, 'iterm2', '/w/proj')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('dismisses a stale failure when it opens', async () => {
    const { dismissError } = mount({ editors: [VSCODE], preferredId: 'vscode', error: 'spawn ENOENT' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose an editor' }))
    expect(dismissError).toHaveBeenCalled()
  })

  it('shows the last failure while it is still recorded', async () => {
    mount({ editors: [VSCODE], preferredId: 'vscode', error: '"/w/gone" is not a directory' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose an editor' }))
    expect(screen.getByText('Could not open: "/w/gone" is not a directory')).toBeTruthy()
  })

  it('closes on a second press of the chevron', async () => {
    mount({ editors: [VSCODE], preferredId: 'vscode' })
    const chevron = screen.getByRole('button', { name: 'Choose an editor' })
    fireEvent.click(chevron)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(chevron)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('buildItems', () => {
  it('says it is still looking while the sweep is in flight', () => {
    expect(buildItems({ status: 'loading', editors: [], platform: '', t })).toStrictEqual([
      { id: `${PLACEHOLDER_PREFIX}loading`, label: 'Looking for installed editors…', disabled: true },
    ])
  })

  it('names the host platform when it found nothing, so the fix is obvious', () => {
    const [row] = buildItems({ status: 'ready', editors: [], platform: 'linux', t })
    expect(row).toMatchObject({ label: 'No editor found on the machine running dsh (linux)', disabled: true })
  })

  it('falls back to the plain empty message before a platform is known', () => {
    const [row] = buildItems({ status: 'ready', editors: [], platform: '', t })
    expect(row).toMatchObject({ label: 'No editor found on this machine' })
  })

  it('gives every application row the id an open request names', () => {
    const rows = buildItems({ status: 'ready', editors: [VSCODE, ITERM], platform: 'darwin', t })
    expect(rows.map(row => row.id)).toStrictEqual(['vscode', 'iterm2'])
  })

  it('keeps placeholder ids out of the id space a real application could claim', () => {
    const placeholders = [
      ...buildItems({ status: 'loading', editors: [], platform: '', t }),
      ...buildItems({ status: 'ready', editors: [], platform: 'darwin', t }),
    ]
    // A catalog id is a bare identifier, so a prefixed one can never be
    // mistaken for choosing an application.
    for (const row of placeholders) expect(row.id.startsWith(PLACEHOLDER_PREFIX)).toBe(true)
  })
})

describe('directoryOf', () => {
  it('finds the workspace accounting for the session', () => {
    const state = {
      items: [
        { path: '/w/a', sessionIds: ['s9'] },
        { path: '/w/b', sessionIds: ['s1', 's2'] },
      ],
    } as unknown as WorkspaceSnapshot
    expect(directoryOf(state, SESSION)).toBe('/w/b')
  })

  it('reports nothing when no workspace claims it', () => {
    const state = { items: [{ path: '/w/a', sessionIds: ['s9'] }] } as unknown as WorkspaceSnapshot
    expect(directoryOf(state, SESSION)).toBeUndefined()
  })
})
