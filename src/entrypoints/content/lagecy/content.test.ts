import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { eventBus } from '@/utils/eventbus'

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: { get: async () => ({ enableChatOutline: true }) },
      onChanged: { addListener: vi.fn() },
    },
  },
}))

vi.mock('@/utils/i18nCache', () => ({
  i18nCache: { get: (key: string) => key, preCache: vi.fn() },
}))

vi.mock('../quick-follow-up/cards', () => ({ getOutlineSummary: vi.fn() }))

beforeAll(async () => {
  vi.stubGlobal('requestIdleCallback', vi.fn())
  await import('./content')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('skips image composers and cleans up an existing outline when the URL changes to Images', async () => {
  history.replaceState({}, '', '/app')
  const chatWindow = document.createElement('chat-window')
  const imagePage = document.createElement('discovery-images-page')
  const imageChatWindow = document.createElement('chat-window')
  imagePage.append(imageChatWindow)
  document.body.append(imagePage, chatWindow)

  const controlsSelector = '#gemini-toc-controls'
  const popoverSelector = '#gemini-toc-popover'
  await vi.waitFor(() => expect(chatWindow.querySelector(controlsSelector)).not.toBeNull())
  expect(imageChatWindow.querySelector(controlsSelector)).toBeNull()

  async function navigate(pathname: string) {
    history.replaceState({}, '', pathname)
    await eventBus.emit('urlchange', { url: location.href, timestamp: Date.now() })
  }

  await navigate('/images')
  expect(chatWindow.querySelector(controlsSelector)).toBeNull()
  expect(chatWindow.querySelector(popoverSelector)).toBeNull()

  await navigate('/app')
  expect(chatWindow.querySelectorAll(controlsSelector)).toHaveLength(1)
  expect(imageChatWindow.querySelector(controlsSelector)).toBeNull()

  await navigate('/images')
})

it('toggles only the arrows and restores them when the stored setting is cleared', async () => {
  history.replaceState({}, '', '/app')
  const chatWindow = document.createElement('chat-window')
  document.body.append(chatWindow)
  const selector = '.gemini-toc-jump-button'
  await vi.waitFor(() => expect(chatWindow.querySelectorAll(selector)).toHaveLength(2))

  const popover = chatWindow.querySelector('#gemini-toc-popover')
  const onChange = vi.mocked(browser.storage.onChanged.addListener).mock.calls[0][0]
  onChange({ enableChatOutlinePromptNavigation: { newValue: false } }, 'sync')
  expect(chatWindow.querySelectorAll(selector)).toHaveLength(0)
  expect(chatWindow.querySelector('#gemini-toc-popover')).toBe(popover)
  expect(chatWindow.querySelector('#gemini-entry-icon')).not.toBeNull()

  onChange({ enableChatOutline: { newValue: false } }, 'sync')
  expect(chatWindow.querySelector('#gemini-toc-popover')).toBeNull()
  onChange({ enableChatOutline: { newValue: true } }, 'sync')
  expect(chatWindow.querySelector('#gemini-toc-popover')).not.toBeNull()
  expect(chatWindow.querySelectorAll(selector)).toHaveLength(0)

  onChange({ enableChatOutlinePromptNavigation: { oldValue: false } }, 'sync')
  expect(chatWindow.querySelectorAll(selector)).toHaveLength(2)
})
