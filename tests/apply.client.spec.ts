// @vitest-environment jsdom
/** The browser plugin's composition: one slot entry, one dictionary, no declarations. */

import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { EditorPicker } from '../src/client/EditorPicker.tsx'
import { NS, en, zh } from '../src/client/locales.ts'
import { EDITORS_PATH } from '../src/shared.ts'

/** One slot registration, as the fake registry recorded it. */
interface Recorded {
  entry: { name: string; id: string; order?: number; locale?: string; inject?: () => unknown; children?: unknown }
  component: unknown
}

/**
 * A client context carrying just the two services this plugin injects.
 * @returns the context and everything it recorded.
 */
function context() {
  const registered: Recorded[] = []
  const dictionaries: { ns: string; dicts: Record<string, unknown> }[] = []
  const injected: string[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    slots: {
      inject: (slot: string, setup: () => () => void) => {
        injected.push(slot)
        disposers.push(setup())
      },
      register: (entry: Recorded['entry'], component: unknown) => {
        const record = { entry, component }
        registered.push(record)
        return () => { registered.splice(registered.indexOf(record), 1) }
      },
    },
    locale: {
      register: (ns: string, dicts: Record<string, unknown>) => {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
    },
    effect: (setup: () => () => void) => { disposers.push(setup()) },
  }
  return { ctx, registered, dictionaries, injected, disposers }
}

describe('the plugin declaration', () => {
  it('needs only the slot registry and the locale service', () => {
    expect(inject).toStrictEqual(['slots', 'locale'])
  })
})

describe('mounting', () => {
  it('registers the picker into the session header\'s utility row', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { ctx, registered, injected } = context()
    apply(ctx as never)
    expect(injected).toStrictEqual(['conversation.session.header.utilities'])
    expect(registered).toHaveLength(1)
    expect(registered[0]?.component).toBe(EditorPicker)
    expect(registered[0]?.entry).toMatchObject({
      name: 'conversation.session.header.utilities',
      id: 'omdsh-editor-picker',
      locale: NS,
    })
    vi.unstubAllGlobals()
  })

  it('declares no slot of its own, so unloading leaves the header as it shipped', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { ctx, registered, disposers } = context()
    apply(ctx as never)
    expect(registered[0]?.entry.children).toBeUndefined()
    for (const dispose of disposers) dispose()
    expect(registered).toStrictEqual([])
    vi.unstubAllGlobals()
  })

  it('registers both dictionaries under this package\'s namespace', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { ctx, dictionaries } = context()
    apply(ctx as never)
    expect(dictionaries).toStrictEqual([{ ns: 'editor', dicts: { zh, en } }])
    vi.unstubAllGlobals()
  })

  it('sweeps for editors once, at mount', () => {
    const fetchSpy = vi.fn((_path: string) => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchSpy)
    const { ctx } = context()
    apply(ctx as never)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(EDITORS_PATH)
    vi.unstubAllGlobals()
  })

  it('survives a host that refuses the sweep, rather than taking the fiber down', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const { ctx } = context()
    expect(() => { apply(ctx as never) }).not.toThrow()
    // The rejection is handled inside the controller; nothing escapes as an
    // unhandled rejection either.
    await new Promise(resolve => setTimeout(resolve, 10))
    vi.unstubAllGlobals()
  })
})

describe('the injected face', () => {
  it('hands the picker its store and the three gestures', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { ctx, registered } = context()
    apply(ctx as never)
    const face = registered[0]?.entry.inject?.() as Record<string, unknown>
    expect(Object.keys(face).sort()).toStrictEqual(['dismissError', 'hooks', 'list', 'open'])
    expect(typeof (face['hooks'] as Record<string, { getSnapshot: unknown }>)['editorPicker']?.getSnapshot)
      .toBe('function')
    vi.unstubAllGlobals()
  })
})

describe('the dictionaries', () => {
  it('cover the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toStrictEqual(Object.keys(zh).sort())
  })

  it('name no product, because a product name is not copy', () => {
    const copy = [...Object.values(en), ...Object.values(zh)].join(' ')
    for (const product of ['VS Code', 'Cursor', 'Finder', 'iTerm', 'Xcode']) {
      expect(copy).not.toContain(product)
    }
  })
})
