import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import { startTopBarAction, stopTopBarAction } from './index'

vi.mock('@/utils/eventbus', () => ({
  eventBus: {
    emitSync: vi.fn(),
  },
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

const ENTRY_SELECTOR = '[data-test-id="gemini-power-kit-theme-top-bar-container"]'
const BUTTON_SELECTOR = '[data-test-id="gemini-power-kit-theme-top-bar-button"]'

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
    stopTopBarAction()
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
    expect(button?.getAttribute('title')).toBe('Theme')
    expect(button?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')

    button?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('theme-floating-panel:open', {
      source: 'top-bar-action',
    })
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
    const rightSection = document.querySelector('.right-section')
    rightSection?.appendChild(document.createElement('div'))

    stopTopBarAction()
    await flushReconcile()

    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
    expect(document.getElementById('gpk-theme-top-bar-action-style')).toBeNull()

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
