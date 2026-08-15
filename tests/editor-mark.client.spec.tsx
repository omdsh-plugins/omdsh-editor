// @vitest-environment jsdom
/** The mark: the application's own icon, and every path back to the glyph. */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { EditorMark, iconUrl } from '../src/client/EditorMark.tsx'
import { ICON_PATH } from '../src/shared.ts'

afterEach(cleanup)

describe('iconUrl', () => {
  it('names the icon route and escapes the id', () => {
    expect(iconUrl('vscode')).toBe(`${ICON_PATH}?id=vscode`)
    expect(iconUrl('a b&c')).toBe(`${ICON_PATH}?id=a%20b%26c`)
  })
})

describe('EditorMark', () => {
  it('renders the application\'s own icon when the host has one', () => {
    const { container } = render(<EditorMark id="vscode" kind="code" accent="#3b8eea" icon />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(`${ICON_PATH}?id=vscode`)
    // The row label already names the application; a second reading is noise.
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('draws the kind glyph when the host has no icon for it', () => {
    const { container } = render(<EditorMark id="ghostty" kind="terminal" accent="#c8b6ff" icon={false} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('draws the kind glyph when `icon` was never stated', () => {
    const { container } = render(<EditorMark id="zed" kind="code" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('falls back to the glyph when the icon fails to load', () => {
    const { container } = render(<EditorMark id="vscode" kind="code" accent="#3b8eea" icon />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    // A 404 is the ordinary answer for a bundle whose icon could not be read.
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('tries again for a different application after a failure', () => {
    const { container, rerender } = render(<EditorMark id="vscode" kind="code" icon />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    // The list refreshed and this row now shows another application; a stale
    // failure must not hide an icon that does exist.
    rerender(<EditorMark id="cursor" kind="code" icon />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`${ICON_PATH}?id=cursor`)
  })

  it('tints the fallback glyph with the product accent', () => {
    const { container } = render(<EditorMark id="zed" kind="code" accent="#dd6b20" icon={false} />)
    // The DOM normalizes the hex the component set; 0xdd6b20 is this triple.
    expect((container.querySelector('svg') as SVGElement).style.color).toBe('rgb(221, 107, 32)')
  })

  it('leaves the glyph on the inherited color when no accent is given', () => {
    const { container } = render(<EditorMark id="zed" kind="code" />)
    expect((container.querySelector('svg') as SVGElement).style.color).toBe('')
  })

  it('honours the requested size on both forms', () => {
    const { container: withIcon } = render(<EditorMark id="vscode" kind="code" icon size={18} />)
    expect(withIcon.querySelector('img')?.getAttribute('width')).toBe('18')
    const { container: withGlyph } = render(<EditorMark id="vscode" kind="code" size={18} />)
    expect(withGlyph.querySelector('svg')?.getAttribute('width')).toBe('18')
  })
})
