import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import { startPowerKitEntry, stopPowerKitEntry } from './index'

vi.mock('@/utils/eventbus', () => ({
  eventBus: {
    emitSync: vi.fn(),
  },
}))

vi.mock('tippy.js', () => ({
  default: vi.fn((reference: Element) => ({
    destroy: vi.fn(),
    hide: vi.fn(),
    reference,
    setContent: vi.fn(),
    setProps: vi.fn(),
  })),
}))

vi.mock('./badge', () => ({
  dismissBadge: vi.fn(() => Promise.resolve()),
  shouldShowBadge: vi.fn(() => Promise.resolve(false)),
}))

function renderMavatarFooter(): void {
  document.body.innerHTML = `
    <chat-app>
      <bard-sidenav>
        <side-navigation-content>
          <mat-action-list class="desktop-controls">
            <sidenav-mavatar-footer>
              <div class="mavatar-footer-row">
                <a class="mavatar-footer-left" aria-label="Google Account: Test User">
                  <div class="mavatar-container"></div>
                  <div class="mavatar-user-info">
                    <span class="mavatar-user-name">Test User</span>
                  </div>
                </a>
                <div class="mavatar-footer-right">
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

  it('injects before the current Gemini mavatar gem-icon-button settings control', () => {
    startPowerKitEntry()

    const settingsButton = document.querySelector(
      'gem-icon-button[data-test-id="mavatar-footer-settings-button"]'
    )
    const powerKitButton = document.querySelector<HTMLElement>(
      'gem-icon-button[data-test-id="gemini-power-kit-button"], button[data-test-id="gemini-power-kit-button"]'
    )

    expect(powerKitButton).not.toBeNull()
    expect(powerKitButton?.nextElementSibling).toBe(settingsButton)
    const actionButton = powerKitButton?.matches('button')
      ? powerKitButton
      : powerKitButton?.querySelector('button')
    expect(actionButton?.getAttribute('aria-label')).toBe('Gemini Power kit')
    expect(actionButton?.hasAttribute('aria-haspopup')).toBe(false)

    powerKitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(eventBus.emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'prompt-entrance',
      module: 'theme',
      open: true,
    })
  })

  it('renders a fallback entry as the penultimate child of the footer right container', () => {
    renderMavatarFooterWithoutSettings()

    startPowerKitEntry()

    const footerRight = document.querySelector('.mavatar-footer-right')
    const powerKitButton = document.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    const lastItem = document.querySelector('[data-test-id="last-right-item"]')

    expect(powerKitButton).not.toBeNull()
    expect(powerKitButton?.parentElement).toBe(footerRight)
    expect(powerKitButton?.nextElementSibling).toBe(lastItem)
    expect(powerKitButton?.style.width).toBe('36px')
    expect(powerKitButton?.style.height).toBe('36px')
    expect(powerKitButton?.querySelector('svg')?.getAttribute('data-gpk-icon-size')).toBe('18')

    powerKitButton?.click()

    expect(eventBus.emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'prompt-entrance',
      module: 'theme',
      open: true,
    })
  })

  it('renders a fallback entry as the penultimate child of the footer row when the right container is missing', () => {
    renderMavatarFooterWithoutRightContainer()

    startPowerKitEntry()

    const footerRow = document.querySelector('.mavatar-footer-row')
    const powerKitButton = document.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    const lastItem = document.querySelector('[data-test-id="last-row-item"]')

    expect(powerKitButton).not.toBeNull()
    expect(powerKitButton?.parentElement).toBe(footerRow)
    expect(powerKitButton?.nextElementSibling).toBe(lastItem)
    expect(powerKitButton?.style.width).toBe('36px')
    expect(powerKitButton?.style.height).toBe('36px')
  })

  it('does not move the fallback entry again when it is already penultimate', async () => {
    renderMavatarFooterWithoutSettings()
    startPowerKitEntry()

    const footerRight = document.querySelector('.mavatar-footer-right')
    const powerKitButton = document.querySelector<HTMLButtonElement>(
      'button[data-test-id="gemini-power-kit-button"]'
    )
    if (!footerRight || !powerKitButton) {
      throw new Error('fallback entry did not render')
    }

    const records: MutationRecord[] = []
    const observer = new MutationObserver((mutations) => {
      records.push(...mutations)
    })
    observer.observe(footerRight, { childList: true })

    const trigger = document.createElement('span')
    trigger.setAttribute('data-test-id', 'before-power-kit-trigger')
    footerRight.insertBefore(trigger, powerKitButton)

    await flushAnimationFrame()
    await flushAnimationFrame()
    observer.disconnect()

    const powerKitMoved = records.some((record) => {
      const changedNodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
      return changedNodes.includes(powerKitButton)
    })

    expect(powerKitButton.nextElementSibling?.getAttribute('data-test-id')).toBe('last-right-item')
    expect(powerKitMoved).toBe(false)
  })
})
