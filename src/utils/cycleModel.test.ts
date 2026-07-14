import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cycleGeminiModel } from './cycleModel'

function renderModeMenu(options: { visible?: boolean, selectedModeId?: string } = {}): void {
  const { visible = true, selectedModeId = 'flash' } = options

  document.body.innerHTML = `
    <button
      data-test-id="bard-mode-menu-button"
      aria-controls="gem-mode-menu"
      aria-disabled="false"
    >Flash</button>
    <div
      id="gem-mode-menu"
      role="menu"
      data-test-id="gem-mode-menu"
      data-visible="${visible}"
    >
      <gem-menu-item role="menuitem" data-mode-id="flash-lite" data-active="true">3.1 Flash-Lite</gem-menu-item>
      <gem-menu-item role="menuitem" data-mode-id="flash" class="${selectedModeId === 'flash' ? 'selected' : ''}">3.5 Flash</gem-menu-item>
      <gem-menu-item role="menuitem" data-mode-id="pro" class="${selectedModeId === 'pro' ? 'selected' : ''}">3.1 Pro</gem-menu-item>
      <gem-menu-item role="menuitem">Extended thinking</gem-menu-item>
    </div>
  `
}

describe('cycleGeminiModel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks the next selected model and excludes Extended thinking', async () => {
    renderModeMenu()
    const pro = document.querySelector<HTMLElement>('[data-mode-id="pro"]')!
    const proClick = vi.fn()
    const extendedThinkingClick = vi.fn()
    pro.addEventListener('click', proClick)
    document.querySelector<HTMLElement>('[role="menuitem"]:last-child')!
      .addEventListener('click', extendedThinkingClick)

    await expect(cycleGeminiModel()).resolves.toBe(true)

    expect(proClick).toHaveBeenCalledTimes(1)
    expect(extendedThinkingClick).not.toHaveBeenCalled()
  })

  it('waits for the menu to become visible after opening the picker', async () => {
    renderModeMenu({ visible: false })
    const trigger = document.querySelector<HTMLElement>('[data-test-id="bard-mode-menu-button"]')!
    const menu = document.querySelector<HTMLElement>('[data-test-id="gem-mode-menu"]')!
    const pro = document.querySelector<HTMLElement>('[data-mode-id="pro"]')!
    const proClick = vi.fn()
    pro.addEventListener('click', proClick)
    trigger.addEventListener('click', () => {
      menu.dataset.visible = 'true'
    })

    await expect(cycleGeminiModel()).resolves.toBe(true)

    expect(proClick).toHaveBeenCalledTimes(1)
  })

  it('wraps from the final model to the first model', async () => {
    renderModeMenu({ selectedModeId: 'pro' })
    const flashLite = document.querySelector<HTMLElement>('[data-mode-id="flash-lite"]')!
    const flashLiteClick = vi.fn()
    flashLite.addEventListener('click', flashLiteClick)

    await expect(cycleGeminiModel()).resolves.toBe(true)

    expect(flashLiteClick).toHaveBeenCalledTimes(1)
  })

  it('does not click when no selected model can be confirmed', async () => {
    renderModeMenu({ selectedModeId: 'unknown' })
    const itemClick = vi.fn()
    document.querySelector<HTMLElement>('[data-mode-id="flash-lite"]')!
      .addEventListener('click', itemClick)

    await expect(cycleGeminiModel()).resolves.toBe(false)

    expect(itemClick).not.toHaveBeenCalled()
  })
})
