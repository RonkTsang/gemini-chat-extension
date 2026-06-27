import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaItemStatus, type MediaItem } from '@/utils/stuffMediaParser'
import { stuffDataCache } from './dataCache'
import { reconcileOpenInNewTabButtons, stopButtonInjector, tryInjectButton } from './buttonInjector'

vi.mock('@/utils/i18n', () => ({
  t: (id: string) => id,
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve()),
    },
  },
}))

function createMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    conversationId: 'c_abc123',
    responseId: 'r_def456',
    timestamp: 1781940312,
    timestampNano: 0,
    status: MediaItemStatus.Normal,
    resourceId: 'rc_test',
    hasImage: true,
    date: new Date(1781940312 * 1000),
    ...overrides,
  }
}

function renderLibraryCard(): Element {
  document.body.innerHTML = `
    <library-sections-overview-page>
      <div class="media-container">
        <library-item-card jslog="299880;data:[1,[1781940312,603866744]]">
          <div class="library-item-card">
            <div class="header">
              <div class="title">Image title</div>
            </div>
          </div>
        </library-item-card>
      </div>
    </library-sections-overview-page>
  `

  const card = document.querySelector('library-item-card')
  if (!card) {
    throw new Error('Failed to render card')
  }
  return card
}

function getButtons(card: Element): NodeListOf<Element> {
  return card.querySelectorAll('.gem-ext-open-new-tab-btn')
}

describe('buttonInjector', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/library')
    document.body.innerHTML = ''
    stuffDataCache.clear()
    stopButtonInjector()
  })

  afterEach(() => {
    stopButtonInjector()
    document.body.innerHTML = ''
    stuffDataCache.clear()
  })

  it('does not inject a button when cache data is missing', () => {
    const card = renderLibraryCard()

    expect(tryInjectButton(card)).toBe(false)
    expect(getButtons(card)).toHaveLength(0)
  })

  it('injects a button when cache data is available', () => {
    const card = renderLibraryCard()
    stuffDataCache.addItems([createMediaItem()])

    expect(tryInjectButton(card)).toBe(true)

    const button = card.querySelector<HTMLElement>('.gem-ext-open-new-tab-btn')
    expect(button).not.toBeNull()
    expect(button?.dataset.openUrl).toBe(`${window.location.origin}/app/abc123#def456`)
  })

  it('does not inject duplicate buttons during repeated reconciliation', () => {
    const card = renderLibraryCard()
    stuffDataCache.addItems([createMediaItem()])

    reconcileOpenInNewTabButtons()
    reconcileOpenInNewTabButtons()

    expect(getButtons(card)).toHaveLength(1)
  })

  it('reconciles cards that rendered before cache data arrived', () => {
    const card = renderLibraryCard()

    expect(tryInjectButton(card)).toBe(false)
    expect(getButtons(card)).toHaveLength(0)

    stuffDataCache.addItems([createMediaItem()])
    reconcileOpenInNewTabButtons()

    expect(getButtons(card)).toHaveLength(1)
  })
})
