import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { system } from '@/components/ui/system'
import {
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from '@/services/chatSettings'
import { ChatLayoutSettings } from './index'

const mocks = vi.hoisted(() => ({
  getChatSettings: vi.fn(),
  setValue: vi.fn(),
  unwatch: vi.fn(),
  watchCallback: undefined as
    | ((settings: ChatSettings) => void)
    | undefined,
  applyChatSettingsStyles: vi.fn(),
  createToast: vi.fn(),
}))

vi.mock('@/services/chatSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/chatSettings')>()
  return {
    ...actual,
    getChatSettings: mocks.getChatSettings,
    chatSettingsStorage: {
      watch: vi.fn((callback: (settings: ChatSettings) => void) => {
        mocks.watchCallback = callback
        return mocks.unwatch
      }),
      setValue: mocks.setValue,
    },
  }
})

vi.mock('@/entrypoints/content/chat-settings/styleController', () => ({
  applyChatSettingsStyles: mocks.applyChatSettingsStyles,
}))

vi.mock('@/components/ui/toaster', () => ({
  toaster: {
    create: mocks.createToast,
  },
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

describe('ChatLayoutSettings', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    mocks.getChatSettings.mockResolvedValue(DEFAULT_CHAT_SETTINGS)
    mocks.setValue.mockResolvedValue(undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    mocks.watchCallback = undefined
    vi.clearAllMocks()
  })

  const renderSettings = async (
    props: React.ComponentProps<typeof ChatLayoutSettings> = {},
  ) => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatLayoutSettings {...props} />
        </ChakraProvider>,
      )
      await Promise.resolve()
    })
  }

  it('renders as a titled default Theme section', async () => {
    await renderSettings()

    expect(container.querySelector('h2')?.textContent).toBe('Chat layout')
    expect(
      container.querySelector('[data-chat-layout-section-separator]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-chat-layout-settings]')
        ?.getAttribute('data-variant'),
    ).toBe('default')
  })

  it('supports the compact title-free shortcut presentation', async () => {
    await renderSettings({
      variant: 'compact',
      showHeading: false,
    })

    expect(container.querySelector('h2')).toBeNull()
    expect(
      container.querySelector('[data-chat-layout-section-separator]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-chat-layout-settings]')
        ?.getAttribute('data-variant'),
    ).toBe('compact')
  })

  it('persists synchronized width changes through the existing storage', async () => {
    await renderSettings()

    const pixelOptions = container.querySelectorAll<HTMLElement>(
      '[aria-label="Pixels"]',
    )
    expect(pixelOptions).toHaveLength(2)

    act(() => {
      pixelOptions[1]?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.setValue).toHaveBeenLastCalledWith(expect.objectContaining({
      chatWidthMode: 'px',
      inputWidthMode: 'px',
    }))
  })

  it('updates from storage changes made by another mounted surface', async () => {
    await renderSettings()

    await act(async () => {
      mocks.watchCallback?.({
        ...DEFAULT_CHAT_SETTINGS,
        chatWidthMode: 'px',
        inputWidthMode: 'px',
      })
      await Promise.resolve()
    })

    const pixelOptions = container.querySelectorAll<HTMLElement>(
      '[aria-label="Pixels"]',
    )
    expect(
      pixelOptions[0]?.querySelector<HTMLInputElement>('input')?.checked,
    ).toBe(true)
    expect(
      pixelOptions[1]?.querySelector<HTMLInputElement>('input')?.checked,
    ).toBe(true)
  })

  it('restores stored settings when persistence fails', async () => {
    mocks.setValue.mockRejectedValueOnce(new Error('Storage failed'))
    await renderSettings()

    act(() => {
      container.querySelectorAll<HTMLElement>(
        '[aria-label="Pixels"]',
      )[0]?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.createToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'Storage failed',
    })
    expect(mocks.applyChatSettingsStyles).toHaveBeenLastCalledWith(
      DEFAULT_CHAT_SETTINGS,
    )
  })
})
