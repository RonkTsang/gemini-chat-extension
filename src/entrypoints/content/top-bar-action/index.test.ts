import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import tippy from 'tippy.js'
import {
  startChatSettingsTopBarAction,
  startTopBarAction,
  stopChatSettingsTopBarAction,
  stopTopBarAction,
} from './index'

vi.mock('@/utils/eventbus', () => ({
  eventBus: {
    emitSync: vi.fn(),
  },
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

vi.mock('tippy.js', () => ({
  default: vi.fn((reference: Element, options: unknown) => ({
    destroy: vi.fn(),
    hide: vi.fn(),
    options,
    reference,
    setContent: vi.fn(),
    setProps: vi.fn(),
  })),
}))

const ENTRY_SELECTOR = '[data-test-id="gemini-power-kit-theme-top-bar-container"]'
const BUTTON_SELECTOR = '[data-test-id="gemini-power-kit-theme-top-bar-button"]'
const CHAT_ENTRY_SELECTOR =
  '[data-test-id="gemini-power-kit-chat-settings-top-bar-container"]'
const CHAT_BUTTON_SELECTOR =
  '[data-test-id="gemini-power-kit-chat-settings-top-bar-button"]'

function renderTopBar(children = '<div data-native="last"></div>'): void {
  document.body.innerHTML = `
    <chat-app-orchestrator id="app-root">
      <chat-app>
        <main class="chat-app">
          <top-bar-actions>
            <div class="top-bar-actions">
              <div class="left-section"></div>
              <div class="center-section"></div>
              <div class="right-section">${children}</div>
            </div>
          </top-bar-actions>
        </main>
      </chat-app>
    </chat-app-orchestrator>
  `
}

async function flushReconcile(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
  await Promise.resolve()
}

describe('Theme top bar action', () => {
  beforeEach(() => {
    renderTopBar('<div data-native="first"></div><div data-native="last"></div>')
  })

  afterEach(() => {
    stopChatSettingsTopBarAction()
    stopTopBarAction()
    document.body.classList.remove('light-theme')
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('inserts its buttons container before the last native child', () => {
    startTopBarAction()

    const rightSection = document.querySelector('.right-section')
    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)
    const lastNativeChild = document.querySelector('[data-native="last"]')
    const button = document.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)

    expect(entry?.parentElement).toBe(rightSection)
    expect(entry?.className).toBe('buttons-container')
    expect(entry?.nextElementSibling).toBe(lastNativeChild)
    expect(button?.getAttribute('aria-label')).toBe('Theme')
    expect(button?.hasAttribute('title')).toBe(false)
    expect(button?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')

    const tooltipCall = vi.mocked(tippy).mock.calls[0]
    const tooltipOptions = tooltipCall?.[1] as {
      appendTo?: () => Element
      content?: string
      placement?: string
    } | undefined
    expect(tooltipOptions?.content).toBe('Theme')
    expect(tooltipOptions?.placement).toBe('bottom')
    expect(tooltipOptions?.appendTo?.()).toBe(document.body)

    button?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('theme-floating-panel:open', {
      source: 'top-bar-action',
    })
  })

  it('places Chat layout directly left of Theme and opens its panel', () => {
    startTopBarAction()
    startChatSettingsTopBarAction()

    const chatEntry = document.querySelector(CHAT_ENTRY_SELECTOR)
    const themeEntry = document.querySelector(ENTRY_SELECTOR)
    const chatButton = document.querySelector<HTMLButtonElement>(
      CHAT_BUTTON_SELECTOR,
    )

    expect(chatEntry?.nextElementSibling).toBe(themeEntry)
    expect(chatButton?.getAttribute('aria-label')).toBe('Chat layout')
    expect(chatButton?.querySelector('svg')?.getAttribute('viewBox'))
      .toBe('0 0 24 24')

    chatButton?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith(
      'chat-settings-panel:toggle',
      { source: 'top-bar-action' },
    )
  })

  it('uses black for both shortcuts in Light mode', () => {
    document.body.classList.add('light-theme')
    startTopBarAction()
    startChatSettingsTopBarAction()

    const injectedStyle = document.getElementById(
      'gpk-theme-top-bar-action-style',
    )

    expect(injectedStyle?.textContent).toContain(
      'body.light-theme :is([data-test-id="gemini-power-kit-theme-top-bar-button"], [data-test-id="gemini-power-kit-chat-settings-top-bar-button"])',
    )
    expect(injectedStyle?.textContent).toContain('color: rgb(0, 0, 0);')
  })

  it('keeps Theme active when the Chat layout shortcut is disabled', () => {
    startTopBarAction()
    startChatSettingsTopBarAction()

    stopChatSettingsTopBarAction()

    expect(document.querySelector(CHAT_ENTRY_SELECTOR)).toBeNull()
    expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()
    expect(eventBus.emitSync).toHaveBeenCalledWith(
      'chat-settings-panel:close',
      { source: 'shortcut-hidden' },
    )
  })

  it('appends the entry when the right section has no native children', () => {
    renderTopBar('')

    startTopBarAction()

    const rightSection = document.querySelector('.right-section')
    expect(rightSection?.children).toHaveLength(1)
    expect(rightSection?.lastElementChild?.matches(ENTRY_SELECTOR)).toBe(true)
  })

  it('keeps one entry when started repeatedly', () => {
    startTopBarAction()
    startTopBarAction()

    expect(document.querySelectorAll(ENTRY_SELECTOR)).toHaveLength(1)
  })

  it('rebinds and restores the entry when Gemini replaces the right section', async () => {
    startTopBarAction()

    const initialTooltip = vi.mocked(tippy).mock.results[0]?.value as {
      destroy: ReturnType<typeof vi.fn>
    } | undefined

    const topBar = document.querySelector('top-bar-actions .top-bar-actions')
    const previousRightSection = document.querySelector('.right-section')
    const nextRightSection = document.createElement('div')
    nextRightSection.className = 'right-section'
    nextRightSection.innerHTML = '<div data-native="replacement"></div>'
    previousRightSection?.replaceWith(nextRightSection)

    await flushReconcile()
    await flushReconcile()

    const entry = nextRightSection.querySelector(ENTRY_SELECTOR)
    expect(topBar?.contains(nextRightSection)).toBe(true)
    expect(entry).not.toBeNull()
    expect(entry?.nextElementSibling?.getAttribute('data-native')).toBe('replacement')
    expect(initialTooltip?.destroy).toHaveBeenCalledTimes(1)
  })

  it('repositions the entry when Gemini appends a native action', async () => {
    startTopBarAction()

    const rightSection = document.querySelector('.right-section')
    const appendedAction = document.createElement('div')
    appendedAction.dataset.native = 'appended'
    rightSection?.appendChild(appendedAction)

    await flushReconcile()
    await flushReconcile()

    const entry = document.querySelector(ENTRY_SELECTOR)
    expect(entry?.nextElementSibling).toBe(appendedAction)
  })

  it('restores the entry when it is removed externally', async () => {
    startTopBarAction()
    document.querySelector(ENTRY_SELECTOR)?.remove()

    await flushReconcile()
    await flushReconcile()

    expect(document.querySelectorAll(ENTRY_SELECTOR)).toHaveLength(1)
  })

  it('starts from a temporary bootstrap observer when the Gemini app is late', async () => {
    document.body.innerHTML = ''
    startTopBarAction()

    renderTopBar('<div data-native="late"></div>')
    await flushReconcile()
    await flushReconcile()

    expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()
  })

  it('removes resources and cancels pending work when stopped', async () => {
    startTopBarAction()
    const tooltip = vi.mocked(tippy).mock.results[0]?.value as {
      destroy: ReturnType<typeof vi.fn>
    } | undefined
    const rightSection = document.querySelector('.right-section')
    rightSection?.appendChild(document.createElement('div'))

    stopTopBarAction()
    await flushReconcile()

    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
    expect(document.getElementById('gpk-theme-top-bar-action-style')).toBeNull()
    expect(tooltip?.destroy).toHaveBeenCalledTimes(1)

    rightSection?.appendChild(document.createElement('div'))
    await flushReconcile()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
  })

  it('restarts cleanly after being disabled', () => {
    startTopBarAction()
    stopTopBarAction()
    startTopBarAction()

    expect(document.querySelectorAll(ENTRY_SELECTOR)).toHaveLength(1)
    expect(document.getElementById('gpk-theme-top-bar-action-style')).not.toBeNull()
  })
})
