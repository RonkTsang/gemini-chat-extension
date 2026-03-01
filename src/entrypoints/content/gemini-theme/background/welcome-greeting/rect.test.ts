import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWelcomeGreetingRect } from './rect'

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
    writable: true,
  })
}

describe('welcome-greeting rect', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('uses greeting title rect when greeting DOM exists', () => {
    document.body.innerHTML = `
      <greeting>
        <div class="greeting-title"></div>
      </greeting>
    `

    const greetingTitle = document.querySelector('greeting div.greeting-title') as HTMLElement
    vi.spyOn(greetingTitle, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 120,
      width: 360,
      height: 90,
      right: 460,
      bottom: 210,
      x: 100,
      y: 120,
      toJSON: () => ({}),
    })

    const rect = getWelcomeGreetingRect()

    expect(rect).toEqual({
      left: 100,
      top: 120,
      width: 360,
      height: 90,
    })
  })

  it('falls back to formula when greeting DOM is absent', () => {
    setViewportSize(1400, 900)
    document.body.innerHTML = `
      <bard-sidenav-container>
        <bard-sidenav></bard-sidenav>
      </bard-sidenav-container>
    `
    const sideNav = document.querySelector(
      'bard-sidenav-container > bard-sidenav',
    ) as HTMLElement
    vi.spyOn(sideNav, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 120,
      height: 900,
      right: 120,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const rect = getWelcomeGreetingRect()

    expect(rect.width).toBe(350)
    expect(rect.height).toBe(80)
    expect(rect.left).toBe((1400 - 120 - 760) / 2 + 120)
    expect(rect.top).toBe((900 - 48) / 2 - 80 * 2 - 24 + 48)
  })
})
