import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { system } from '@/components/ui/system'
import { eventBus } from '@/utils/eventbus'
import { ChatSettingsPanel } from './index'

const { watch, setValue } = vi.hoisted(() => ({
  watch: vi.fn(() => vi.fn()),
  setValue: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/services/chatSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/chatSettings')>()
  return {
    ...actual,
    getChatSettings: vi.fn(() =>
      Promise.resolve(actual.DEFAULT_CHAT_SETTINGS)),
    chatSettingsStorage: {
      watch,
      setValue,
    },
  }
})

vi.mock('@/entrypoints/content/chat-settings/styleController', () => ({
  applyChatSettingsStyles: vi.fn(),
}))

vi.mock('@/components/ui/toaster', () => ({
  toaster: {
    create: vi.fn(),
  },
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

let root: Root
let container: HTMLDivElement
let shortcut: HTMLButtonElement

describe('ChatSettingsPanel', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    shortcut = document.createElement('button')
    shortcut.dataset.testId =
      'gemini-power-kit-chat-settings-top-bar-button'
    shortcut.getBoundingClientRect = () => ({
      x: 200,
      y: 10,
      top: 10,
      right: 236,
      bottom: 46,
      left: 200,
      width: 36,
      height: 36,
      toJSON: () => ({}),
    })
    document.body.append(shortcut, container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    shortcut.remove()
    container.remove()
    vi.clearAllMocks()
  })

  it('opens as a compact anchored dialog without a header', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatSettingsPanel />
        </ChakraProvider>,
      )
    })

    act(() => {
      eventBus.emitSync('chat-settings-panel:toggle', {
        source: 'top-bar-action',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const panel = container.querySelector('[data-chat-settings-panel]')
    expect(panel?.getAttribute('role')).toBe('dialog')
    expect(panel?.getAttribute('aria-label')).toBe('Chat layout')
    expect(panel?.querySelector('header')).toBeNull()
    expect(panel?.querySelector('[aria-label*="Close"]')).toBeNull()
  })

  it('closes when the user clicks outside', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatSettingsPanel />
        </ChakraProvider>,
      )
    })
    act(() => {
      eventBus.emitSync('chat-settings-panel:toggle', {
        source: 'top-bar-action',
      })
    })

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      )
    })

    expect(container.querySelector('[data-chat-settings-panel]')).toBeNull()
  })

  it('stays open for a click whose composed path includes the Shadow DOM panel', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatSettingsPanel />
        </ChakraProvider>,
      )
    })
    act(() => {
      eventBus.emitSync('chat-settings-panel:toggle', {
        source: 'top-bar-action',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const panel = container.querySelector('[data-chat-settings-panel]')
    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      composed: true,
    })
    Object.defineProperty(pointerDown, 'composedPath', {
      value: () => [panel, container, document.body, document],
    })

    act(() => {
      document.dispatchEvent(pointerDown)
    })

    expect(container.querySelector('[data-chat-settings-panel]')).not.toBeNull()
  })

  it('keeps Input Width editable and updates both widths while synced', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatSettingsPanel />
        </ChakraProvider>,
      )
    })
    act(() => {
      eventBus.emitSync('chat-settings-panel:toggle', {
        source: 'top-bar-action',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const pixelOptions = container.querySelectorAll<HTMLElement>(
      '[aria-label="Pixels"]',
    )
    const inputWidthPixelsOption = pixelOptions[1]
    const hiddenInput =
      inputWidthPixelsOption?.querySelector<HTMLInputElement>('input')

    expect(pixelOptions).toHaveLength(2)
    expect(hiddenInput?.disabled).toBe(false)

    act(() => {
      inputWidthPixelsOption.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(setValue).toHaveBeenLastCalledWith(expect.objectContaining({
      chatWidthMode: 'px',
      inputWidthMode: 'px',
    }))
  })

  it('closes when Theme opens', async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <ChatSettingsPanel />
        </ChakraProvider>,
      )
    })
    act(() => {
      eventBus.emitSync('chat-settings-panel:toggle', {
        source: 'top-bar-action',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      eventBus.emitSync('theme-floating-panel:open', {
        source: 'top-bar-action',
      })
    })

    expect(container.querySelector('[data-chat-settings-panel]')).toBeNull()
  })
})
