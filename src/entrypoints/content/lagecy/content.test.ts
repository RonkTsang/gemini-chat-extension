import { afterEach, expect, it, vi } from 'vitest'
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

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('skips image composers and cleans up an existing outline when the URL changes to Images', async () => {
  vi.stubGlobal('requestIdleCallback', vi.fn())
  history.replaceState({}, '', '/app')
  const chatWindow = document.createElement('chat-window')
  const imagePage = document.createElement('discovery-images-page')
  const imageChatWindow = document.createElement('chat-window')
  imagePage.append(imageChatWindow)
  document.body.append(imagePage, chatWindow)

  await import('./content')
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
