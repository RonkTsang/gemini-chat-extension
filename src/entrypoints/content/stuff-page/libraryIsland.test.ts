import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/library-query.json'
import html from './__fixtures__/library-island.html?raw'
import declaredHtml from './__fixtures__/library-declared-island.html?raw'
import preload from './__fixtures__/library-preload.json'
import { GEM_EXT_EVENTS } from '@/common/event'
import { startLibraryMonitor } from '@/entrypoints/main-world/library-monitor'
import { inspectLibraryPage } from './dom'
import { parseLibraryMediaResponse } from '@/utils/library/mediaParser'
import { startLibraryAdapters, stopLibraryAdapters } from './libraryAdapters'
import { clearLibraryMediaCache, receiveLibraryMediaData, reconcileIslandButtons } from './libraryIsland'
import { stuffDataCache } from './dataCache'
import { MediaItemStatus } from '@/utils/stuffMediaParser'

vi.mock('@/utils/i18n', () => ({ t: (id: string) => id }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: vi.fn(() => Promise.resolve()) } } }))

const items = parseLibraryMediaResponse(JSON.stringify(fixture))!
const buttonSelector = '.gem-ext-open-new-tab-btn'

function receive(): void {
  receiveLibraryMediaData({ items, timestamp: Date.now() })
}

beforeEach(() => {
  document.body.innerHTML = html
  window.history.replaceState(null, '', '/app')
})
afterEach(() => {
  stopLibraryAdapters()
  clearLibraryMediaCache()
  stuffDataCache.clear()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Library island adapter with the captured music and image DOM', () => {
  it('injects buttons from initial HTML via the late-listener replay without a media request', () => {
    document.body.innerHTML = declaredHtml
    const script = document.createElement('script')
    script.type = 'application/json'
    script.setAttribute('data-bg3-relay-preload', '')
    script.textContent = JSON.stringify(preload)
    document.body.appendChild(script)
    const stopMonitor = startLibraryMonitor()
    const listener = (event: Event): void => {
      receiveLibraryMediaData((event as CustomEvent).detail)
    }
    window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
    try {
      startLibraryAdapters()
      expect(document.querySelectorAll(buttonSelector)).toHaveLength(0)
      window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
      const buttons = document.querySelectorAll<HTMLElement>(buttonSelector)
      expect(buttons).toHaveLength(2)
      expect(buttons[0].dataset.openUrl).toBe(`${window.location.origin}/app/abc123#111aaa`)
      expect(buttons[1].dataset.openUrl).toBe(`${window.location.origin}/app/def456#222bbb`)
      window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
      expect(document.querySelectorAll(buttonSelector)).toHaveLength(2)
    } finally {
      window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
      stopMonitor()
    }
  })

  it('uses the island adapter for the declared route Library and excludes Documents', () => {
    document.body.innerHTML = declaredHtml
    expect(inspectLibraryPage().page?.kind).toBe('island')
    startLibraryAdapters()
    receive()
    receive()
    const buttons = document.querySelectorAll<HTMLElement>(buttonSelector)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].dataset.openUrl).toBe(`${window.location.origin}/app/abc123#111aaa`)
    expect(buttons[1].dataset.openUrl).toBe(`${window.location.origin}/app/def456#222bbb`)
    expect(document.querySelector('section')?.querySelector(buttonSelector)).toBeNull()
  })

  it('ignores unrelated declared route islands', () => {
    document.body.innerHTML = '<declared-route-island-page><div data-root-style="light"></div></declared-route-island-page>'
    expect(inspectLibraryPage().reason).toBe('no-library-page')
    document.body.insertAdjacentHTML('beforeend', declaredHtml)
    expect(inspectLibraryPage().page?.kind).toBe('island')
    startLibraryAdapters()
    receive()
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(2)
  })

  it('rejects multiple declared Library pages or multiple Library roots', () => {
    document.body.innerHTML = declaredHtml + declaredHtml
    expect(inspectLibraryPage().reason).toBe('ambiguous-island-page')
    document.body.innerHTML = declaredHtml
    document.querySelector('declared-route-island-page')!
      .insertAdjacentHTML('beforeend', '<div data-library-island-root></div>')
    expect(inspectLibraryPage().reason).toBe('invalid-island-root-count')
    startLibraryAdapters()
    receive()
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(0)
  })

  it('handles DOM before data, injects each media button once, and excludes Documents', () => {
    startLibraryAdapters()
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(0)
    receive()
    receive()
    const buttons = document.querySelectorAll<HTMLElement>(buttonSelector)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].dataset.openUrl).toBe(`${window.location.origin}/app/abc123#111aaa`)
    expect(buttons[1].dataset.openUrl).toBe(`${window.location.origin}/app/def456#222bbb`)
    expect(document.querySelector('section')?.querySelector(buttonSelector)).toBeNull()
    expect(buttons[0].parentElement?.tagName).toBe('DIV')
  })

  it('handles data before DOM and late root mounting', async () => {
    document.body.innerHTML = ''
    receive()
    startLibraryAdapters()
    document.body.innerHTML = html
    await vi.waitFor(() => expect(document.querySelectorAll(buttonSelector)).toHaveLength(2))
  })

  it('keeps existing buttons functional after a long idle period without new API data', () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    startLibraryAdapters()
    receive()
    clock.mockReturnValue(now + 24 * 60 * 60_000)
    reconcileIslandButtons()
    const buttons = document.querySelectorAll<HTMLElement>(buttonSelector)
    expect(buttons).toHaveLength(2)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    buttons[0].click()
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/app/abc123#111aaa`, '_blank')
  })

  it('updates a reused card and uses the current destination for click and keyboard activation', async () => {
    startLibraryAdapters()
    receive()
    const image = document.querySelector<HTMLImageElement>('img')!
    const button = image.parentElement!.parentElement!.querySelector<HTMLElement>(buttonSelector)!
    const cardClick = vi.fn()
    button.parentElement!.addEventListener('click', cardClick)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    image.src = `${items[1].thumbnailUrl}=w640-h640-c`
    await vi.waitFor(() => expect(button.dataset.openUrl).toContain('/app/def456#222bbb'))
    button.click()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(open).toHaveBeenNthCalledWith(1, `${window.location.origin}/app/def456#222bbb`, '_blank')
    expect(open).toHaveBeenNthCalledWith(2, `${window.location.origin}/app/def456#222bbb`, '_blank')
    expect(cardClick).not.toHaveBeenCalled()
    image.src = 'https://lh3.googleusercontent.com/gg/unknown=w320'
    await vi.waitFor(() => expect(image.parentElement!.parentElement!.querySelector(buttonSelector)).toBeNull())
  })

  it('preserves a button when native logging attributes change', async () => {
    startLibraryAdapters()
    receive()
    const card = document.querySelector('[jslog^="279444;"]')!
    card.setAttribute('jslog', 'other')
    reconcileIslandButtons()
    expect(card.querySelector(buttonSelector)).not.toBeNull()
  })

  it('rejects ambiguous data while tolerating additional native buttons', () => {
    startLibraryAdapters()
    receive()
    receiveLibraryMediaData({ items: [{ ...items[0], responseId: 'rc_duplicate' }], timestamp: Date.now() })
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(1)
    const imageCard = document.querySelectorAll('[jslog^="279444;"]')[1]
    imageCard.appendChild(document.createElement('button'))
    reconcileIslandButtons()
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(1)
  })

  it('switches to the legacy adapter and back while preserving legacy navigation', async () => {
    startLibraryAdapters()
    receive()
    stuffDataCache.addItems([{
      conversationId: 'c_old', responseId: 'r_old', timestamp: 123,
      timestampNano: 0, status: MediaItemStatus.Normal, resourceId: 'old',
      hasImage: true, date: new Date(),
    }])
    document.body.innerHTML = '<library-sections-overview-page><library-item-card jslog="data:[1,[123,0]]"></library-item-card></library-sections-overview-page>'
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>(buttonSelector)?.dataset.openUrl).toContain('/app/old#old'))
    document.body.innerHTML = html
    await vi.waitFor(() => expect(document.querySelectorAll(buttonSelector)).toHaveLength(2))
    stopLibraryAdapters()
    expect(document.querySelectorAll(buttonSelector)).toHaveLength(0)
  })
})
