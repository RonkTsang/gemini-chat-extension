import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createNewChatByClick,
  openGems,
  openLibrary,
  openTemporaryChatByClick,
  toggleSidebar,
} from './chatActions'

describe('chatActions new chat', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks the visible compact entry when the SideNav is collapsed', async () => {
    document.body.innerHTML = `
      <side-nav-sparkle-button>
        <a aria-label="New chat" data-test-id="side-nav-sparkle-button" href="/" style="display: none"></a>
      </side-nav-sparkle-button>
      <bard-sidenav class="collapsed">
        <gem-icon-button>
          <a aria-label="New chat" href="/app"></a>
        </gem-icon-button>
      </bard-sidenav>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const hiddenLink = document.querySelector<HTMLAnchorElement>('[data-test-id="side-nav-sparkle-button"]')!
    const compactLink = document.querySelector<HTMLAnchorElement>('gem-icon-button > a[href="/app"]')!
    const hiddenClickSpy = vi.fn()
    const compactClickSpy = vi.fn()
    hiddenLink.addEventListener('click', hiddenClickSpy)
    compactLink.addEventListener('click', compactClickSpy)

    await expect(createNewChatByClick()).resolves.toBe(true)

    expect(hiddenClickSpy).not.toHaveBeenCalled()
    expect(compactClickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('chatActions temporary chat', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/')
  })

  it('clicks the temporary chat control immediately on the blank chat route', async () => {
    document.body.innerHTML = `
      <temp-chat-button>
        <gem-icon-button></gem-icon-button>
      </temp-chat-button>
    `
    window.history.replaceState({}, '', '/app')

    const temporaryChatButton = document.querySelector<HTMLElement>(
      'temp-chat-button > gem-icon-button',
    )!
    const clickSpy = vi.fn()
    temporaryChatButton.addEventListener('click', clickSpy)

    await expect(openTemporaryChatByClick()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('chatActions sidebar toggle', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks the close button when the sidebar is open', () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <button class="close-sidenav-button"></button>
      </bard-sidenav>
      <side-nav-sparkle-button>
        <button></button>
      </side-nav-sparkle-button>
    `
    const closeButton = document.querySelector<HTMLButtonElement>('button.close-sidenav-button')!
    const openButton = document.querySelector<HTMLButtonElement>('side-nav-sparkle-button > button')!
    const closeClickSpy = vi.fn()
    const openClickSpy = vi.fn()
    closeButton.addEventListener('click', closeClickSpy)
    openButton.addEventListener('click', openClickSpy)

    expect(toggleSidebar()).toBe(true)
    expect(closeClickSpy).toHaveBeenCalledTimes(1)
    expect(openClickSpy).not.toHaveBeenCalled()
  })

  it('clicks the open button when the sidebar is closed', () => {
    document.body.innerHTML = `
      <side-nav-sparkle-button>
        <button></button>
      </side-nav-sparkle-button>
    `
    const openButton = document.querySelector<HTMLButtonElement>('side-nav-sparkle-button > button')!
    const openClickSpy = vi.fn()
    openButton.addEventListener('click', openClickSpy)

    expect(toggleSidebar()).toBe(true)
    expect(openClickSpy).toHaveBeenCalledTimes(1)
  })
})

describe('chatActions side navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks the native Library entry', () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="my-stuff-side-nav-entry-button">
          <a href="library">Library</a>
        </gem-nav-list-item>
      </bard-sidenav>
    `
    const libraryLink = document.querySelector<HTMLAnchorElement>('a[href="library"]')!
    const clickSpy = vi.fn()
    libraryLink.addEventListener('click', clickSpy)

    expect(openLibrary()).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('clicks the native Gems entry', () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="gems-side-nav-entry-button">
          <a href="/gems/view">Gems</a>
        </gem-nav-list-item>
      </bard-sidenav>
    `
    const gemsLink = document.querySelector<HTMLAnchorElement>('a[href="/gems/view"]')!
    const clickSpy = vi.fn()
    gemsLink.addEventListener('click', clickSpy)

    expect(openGems()).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
