import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import tippy from 'tippy.js'
import { startPowerKitEntry, stopPowerKitEntry } from './index'

vi.mock('@/utils/eventbus', () => ({
  eventBus: {
    emitSync: vi.fn(),
  },
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

vi.mock('./badge', () => ({
  dismissBadge: vi.fn(() => Promise.resolve()),
  shouldShowBadge: vi.fn(() => Promise.resolve(false)),
}))

function renderMavatarFooter(collapsed = false): void {
  document.body.innerHTML = `
    <chat-app>
      <bard-sidenav>
        <side-navigation-content>
          <mat-action-list class="desktop-controls">
            <sidenav-mavatar-footer>
              <div class="mavatar-footer-row${collapsed ? ' collapsed' : ''}">
                <a class="mavatar-footer-left" aria-label="Google Account: Test User">
                  <div class="mavatar-container"></div>
                  <div class="mavatar-user-info">
                    <span class="mavatar-user-name">Test User</span>
                  </div>
                </a>
                <div class="mavatar-footer-right">
                  <div class="mavatar-settings-button-wrapper">
                    <gem-icon-button
                      class="mavatar-settings-button gem-button"
                      data-test-id="mavatar-footer-settings-button"
                      fonticonname="settings"
                    >
                      <button aria-label="Settings" aria-haspopup="menu" aria-expanded="false">
                        <gem-icon>
                          <mat-icon data-mat-icon-name="settings" fonticon="settings"></mat-icon>
                        </gem-icon>
                      </button>
                    </gem-icon-button>
                  </div>
                </div>
              </div>
            </sidenav-mavatar-footer>
          </mat-action-list>
        </side-navigation-content>
      </bard-sidenav>
    </chat-app>
  `
}

function renderMavatarFooterWithoutSettings(): void {
  document.body.innerHTML = `
    <chat-app>
      <bard-sidenav>
        <side-navigation-content>
          <mat-action-list class="desktop-controls">
            <sidenav-mavatar-footer>
              <div class="mavatar-footer-row">
                <a class="mavatar-footer-left" aria-label="Google Account: Test User">Test User</a>
                <div class="mavatar-footer-right">
                  <span data-test-id="first-right-item"></span>
                  <span data-test-id="last-right-item"></span>
                </div>
              </div>
            </sidenav-mavatar-footer>
          </mat-action-list>
        </side-navigation-content>
      </bard-sidenav>
    </chat-app>
  `
}

function renderMavatarFooterWithoutRightContainer(): void {
  document.body.innerHTML = `
    <chat-app>
      <bard-sidenav>
        <side-navigation-content>
          <mat-action-list class="desktop-controls">
            <sidenav-mavatar-footer>
              <div class="mavatar-footer-row">
                <a class="mavatar-footer-left" aria-label="Google Account: Test User">Test User</a>
                <span data-test-id="last-row-item"></span>
              </div>
            </sidenav-mavatar-footer>
          </mat-action-list>
        </side-navigation-content>
      </bard-sidenav>
    </chat-app>
  `
}

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
  await Promise.resolve()
}

describe('power kit entry', () => {
  beforeEach(() => {
    renderMavatarFooter()
  })

  afterEach(() => {
    stopPowerKitEntry()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('renders an owned light-DOM entry before Settings in expanded mode', () => {
    startPowerKitEntry()

    const settingsButton = document.querySelector(
      'gem-icon-button[data-test-id="mavatar-footer-settings-button"]'
    )
    const container = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    const powerKitButton = container?.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )

    expect(container?.getAttribute('data-gpk-variant')).toBe('expanded')
    expect(container?.nextElementSibling).toBe(settingsButton)
    expect(container?.className).toBe('')
    expect(container?.querySelector('gem-icon-button, mat-icon')).toBeNull()
    expect(powerKitButton).not.toBeNull()
    expect(powerKitButton?.getAttribute('aria-label')).toBe('Gemini Power kit')
    expect(powerKitButton?.hasAttribute('aria-haspopup')).toBe(false)
    expect(document.getElementById('gpk-side-nav-entry-style')?.textContent)
      .toContain('[data-gpk-mavatar-entry-button]')

    powerKitButton?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'prompt-entrance',
      module: 'enhancements',
      open: true,
    })
  })

  it('refreshes stale injected CSS and removes all owned styles on stop', () => {
    const staleEntryStyle = document.createElement('style')
    staleEntryStyle.id = 'gpk-side-nav-entry-style'
    staleEntryStyle.textContent = 'stale entry styles'
    document.head.appendChild(staleEntryStyle)

    const staleBadgeStyle = document.createElement('style')
    staleBadgeStyle.id = 'gpk-badge-style'
    document.head.appendChild(staleBadgeStyle)

    startPowerKitEntry()

    expect(staleEntryStyle.textContent).toContain('[data-gpk-mavatar-entry-button]')
    expect(staleEntryStyle.textContent).not.toContain('stale entry styles')
    expect(document.getElementById('gpk-tooltip-style')).not.toBeNull()

    stopPowerKitEntry()

    expect(document.getElementById('gpk-side-nav-entry-style')).toBeNull()
    expect(document.getElementById('gpk-tooltip-style')).toBeNull()
    expect(document.getElementById('gpk-badge-style')).toBeNull()
  })

  it('renders a self-contained aligned entry above Settings in collapsed mode', () => {
    renderMavatarFooter(true)

    startPowerKitEntry()

    const footerRow = document.querySelector('.mavatar-footer-row')
    const footerRight = document.querySelector('.mavatar-footer-right')
    const container = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    const powerKitButton = container?.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )

    expect(container?.parentElement).toBe(footerRow)
    expect(container?.previousElementSibling).toBe(footerRight)
    expect(container?.getAttribute('data-gpk-variant')).toBe('collapsed')
    expect(container?.getAttribute('data-gpk-mavatar-entry')).toBe('1')
    expect(powerKitButton?.style.cssText).toBe('')

    powerKitButton?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'prompt-entrance',
      module: 'enhancements',
      open: true,
    })
  })

  it('moves the same owned entry when Gemini changes between collapsed and expanded', async () => {
    renderMavatarFooter(true)
    startPowerKitEntry()

    const tooltip = vi.mocked(tippy).mock.results[0]?.value as {
      setProps: ReturnType<typeof vi.fn>
    } | undefined

    const footerRow = document.querySelector('.mavatar-footer-row')
    const settingsButton = document.querySelector(
      'gem-icon-button[data-test-id="mavatar-footer-settings-button"]'
    )
    const initialContainer = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )

    footerRow?.classList.remove('collapsed')
    await flushAnimationFrame()
    await flushAnimationFrame()

    const currentContainer = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    expect(currentContainer).toBe(initialContainer)
    expect(currentContainer?.nextElementSibling).toBe(settingsButton)
    expect(currentContainer?.getAttribute('data-gpk-variant')).toBe('expanded')
    expect(tooltip?.setProps).toHaveBeenCalledWith({ placement: 'top' })
  })

  it('portals the owned tooltip to document.body', () => {
    renderMavatarFooter(true)
    startPowerKitEntry()

    const powerKitButton = document.querySelector(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    const tippyMock = vi.mocked(tippy)
    const ownEntryCall = tippyMock.mock.calls.find(
      ([reference]) => (reference as unknown) === powerKitButton
    )
    const options = ownEntryCall?.[1] as { appendTo?: () => Element; placement?: string } | undefined

    expect(options?.placement).toBe('right')
    expect(options?.appendTo?.()).toBe(document.body)
  })

  it('renders a fallback entry as the penultimate child of the footer right container', () => {
    renderMavatarFooterWithoutSettings()

    startPowerKitEntry()

    const footerRight = document.querySelector('.mavatar-footer-right')
    const container = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    const powerKitButton = container?.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    const lastItem = document.querySelector('[data-test-id="last-right-item"]')

    expect(powerKitButton).not.toBeNull()
    expect(container?.parentElement).toBe(footerRight)
    expect(container?.nextElementSibling).toBe(lastItem)
    expect(container?.getAttribute('data-gpk-variant')).toBe('expanded')
    expect(powerKitButton?.querySelector('svg')?.getAttribute('data-gpk-icon-size')).toBe('18')

    powerKitButton?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'prompt-entrance',
      module: 'enhancements',
      open: true,
    })
  })

  it('renders a fallback entry as the penultimate child of the footer row when the right container is missing', () => {
    renderMavatarFooterWithoutRightContainer()

    startPowerKitEntry()

    const footerRow = document.querySelector('.mavatar-footer-row')
    const container = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    const powerKitButton = container?.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    const lastItem = document.querySelector('[data-test-id="last-row-item"]')

    expect(powerKitButton).not.toBeNull()
    expect(container?.parentElement).toBe(footerRow)
    expect(container?.nextElementSibling).toBe(lastItem)
  })

  it('does not move the fallback entry again when it is already penultimate', async () => {
    renderMavatarFooterWithoutSettings()
    startPowerKitEntry()

    const footerRight = document.querySelector('.mavatar-footer-right')
    const container = document.querySelector<HTMLElement>(
      'div[data-test-id="gemini-power-kit-mavatar-container"]'
    )
    if (!footerRight || !container) {
      throw new Error('fallback entry did not render')
    }

    const records: MutationRecord[] = []
    const observer = new MutationObserver((mutations) => {
      records.push(...mutations)
    })
    observer.observe(footerRight, { childList: true })

    const trigger = document.createElement('span')
    trigger.setAttribute('data-test-id', 'before-power-kit-trigger')
    footerRight.insertBefore(trigger, container)

    await flushAnimationFrame()
    await flushAnimationFrame()
    observer.disconnect()

    const powerKitMoved = records.some((record) => {
      const changedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
      return changedNodes.includes(container)
    })

    expect(container.nextElementSibling?.getAttribute('data-test-id')).toBe('last-right-item')
    expect(powerKitMoved).toBe(false)
  })
})
