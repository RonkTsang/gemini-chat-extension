import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createNewChatForChainPrompt,
  openGems,
  openLibrary,
  openNewChat,
  openTemporaryChatByClick,
  toggleSidebar,
} from './chatActions'

describe('chatActions new chat', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('clicks the current SideNav New chat entry', async () => {
    document.body.innerHTML = `
      <side-nav-sparkle-button>
        <a aria-label="New chat" data-test-id="side-nav-sparkle-button" href="/" style="display: none"></a>
      </side-nav-sparkle-button>
      <bard-sidenav>
        <gem-nav-list-item data-test-id="new-chat-button">
          <a aria-label="New chat" href="/app"></a>
        </gem-nav-list-item>
      </bard-sidenav>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const hiddenLink = document.querySelector<HTMLAnchorElement>('[data-test-id="side-nav-sparkle-button"]')!
    const newChatLink = document.querySelector<HTMLAnchorElement>(
      'gem-nav-list-item[data-test-id="new-chat-button"] > a[href="/app"]',
    )!
    const hiddenClickSpy = vi.fn()
    const newChatClickSpy = vi.fn()
    hiddenLink.addEventListener('click', hiddenClickSpy)
    newChatLink.addEventListener('click', newChatClickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(hiddenClickSpy).not.toHaveBeenCalled()
    expect(newChatClickSpy).toHaveBeenCalledTimes(1)
  })

  it('clicks New chat when a confirmation dialog marks Gemini app root aria-hidden', async () => {
    document.body.innerHTML = `
      <chat-app-orchestrator id="app-root" aria-hidden="true">
        <bard-sidenav>
          <gem-nav-list-item data-test-id="new-chat-button">
            <a aria-label="New chat" href="/app"></a>
          </gem-nav-list-item>
        </bard-sidenav>
        <chat-window></chat-window>
        <rich-textarea></rich-textarea>
      </chat-app-orchestrator>
    `
    const newChatLink = document.querySelector<HTMLAnchorElement>(
      'gem-nav-list-item[data-test-id="new-chat-button"] > a',
    )!
    const clickSpy = vi.fn()
    newChatLink.addEventListener('click', clickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('recognizes the SideNav aria-label contract without an /app href', async () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <a aria-label="New chat" href="/different-route"></a>
      </bard-sidenav>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const newChatLink = document.querySelector<HTMLAnchorElement>('bard-sidenav a')!
    const clickSpy = vi.fn((event: MouseEvent) => event.preventDefault())
    newChatLink.addEventListener('click', clickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('recognizes the SideNav data-test-id contract without New chat link attributes', async () => {
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="new-chat-button">
          <a href="/different-route"></a>
        </gem-nav-list-item>
      </bard-sidenav>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const newChatLink = document.querySelector<HTMLAnchorElement>(
      'gem-nav-list-item[data-test-id="new-chat-button"] > a',
    )!
    const clickSpy = vi.fn((event: MouseEvent) => event.preventDefault())
    newChatLink.addEventListener('click', clickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('recognizes the unscoped aria-label fallback when SideNav is unavailable', async () => {
    document.body.innerHTML = `
      <a aria-label="New chat" href="/different-route"></a>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const newChatLink = document.querySelector<HTMLAnchorElement>('a[aria-label="New chat"]')!
    const clickSpy = vi.fn((event: MouseEvent) => event.preventDefault())
    newChatLink.addEventListener('click', clickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('recognizes the unscoped data-test-id fallback when SideNav is unavailable', async () => {
    document.body.innerHTML = `
      <gem-nav-list-item data-test-id="new-chat-button">
        <a href="/different-route"></a>
      </gem-nav-list-item>
      <chat-window></chat-window>
      <rich-textarea></rich-textarea>
    `
    const newChatLink = document.querySelector<HTMLAnchorElement>(
      'gem-nav-list-item[data-test-id="new-chat-button"] > a',
    )!
    const clickSpy = vi.fn((event: MouseEvent) => event.preventDefault())
    newChatLink.addEventListener('click', clickSpy)

    await expect(createNewChatForChainPrompt()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the native control when it moves an existing chat to /app', async () => {
    window.history.replaceState({}, '', '/app/current-chat')
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="new-chat-button">
          <a aria-label="New chat" href="/app"></a>
        </gem-nav-list-item>
      </bard-sidenav>
    `

    const newChatButton = document.querySelector<HTMLAnchorElement>(
      '[data-test-id="new-chat-button"] > a[href="/app"]',
    )!
    const clickSpy = vi.fn(() => {
      window.history.pushState({}, '', '/app')
    })
    newChatButton.addEventListener('click', clickSpy)

    await expect(openNewChat()).resolves.toBeUndefined()

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/app')
  })

  it('does nothing when already on the blank chat route', async () => {
    window.history.replaceState({}, '', '/app')
    document.body.innerHTML = '<a aria-label="New chat" href="/app"></a>'

    const newChatButton = document.querySelector<HTMLAnchorElement>('a[aria-label="New chat"]')!
    const clickSpy = vi.fn()
    newChatButton.addEventListener('click', clickSpy)

    await expect(openNewChat()).resolves.toBeUndefined()

    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('falls back to a SPA route transition when no native control is available', async () => {
    window.history.replaceState({}, '', '/app/current-chat')
    const popStateSpy = vi.fn()
    window.addEventListener('popstate', popStateSpy, { once: true })

    await expect(openNewChat()).resolves.toBeUndefined()

    expect(window.location.pathname).toBe('/app')
    expect(popStateSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to a SPA route transition when the native control does not change routes', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/app/current-chat')
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="new-chat-button">
          <a aria-label="New chat" href="/app"></a>
        </gem-nav-list-item>
      </bard-sidenav>
    `
    const newChatButton = document.querySelector<HTMLAnchorElement>(
      '[data-test-id="new-chat-button"] > a[href="/app"]',
    )!
    newChatButton.addEventListener('click', (event) => event.preventDefault())
    const popStateSpy = vi.fn()
    window.addEventListener('popstate', popStateSpy, { once: true })

    const navigation = openNewChat()
    await vi.advanceTimersByTimeAsync(1000)
    await expect(navigation).resolves.toBeUndefined()

    expect(window.location.pathname).toBe('/app')
    expect(popStateSpy).toHaveBeenCalledTimes(1)
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

  it('clicks the temporary chat control directly from an existing conversation', async () => {
    document.body.innerHTML = `
      <temp-chat-button>
        <gem-icon-button></gem-icon-button>
      </temp-chat-button>
    `
    window.history.replaceState({}, '', '/app/current-chat')

    const temporaryChatButton = document.querySelector<HTMLElement>(
      'temp-chat-button > gem-icon-button',
    )!
    const clickSpy = vi.fn()
    temporaryChatButton.addEventListener('click', clickSpy)

    await expect(openTemporaryChatByClick()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('opens New chat, waits for the Temporary chat control, then clicks it', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/app/current-chat')
    document.body.innerHTML = `
      <bard-sidenav>
        <gem-nav-list-item data-test-id="new-chat-button">
          <a aria-label="New chat" href="/app"></a>
        </gem-nav-list-item>
      </bard-sidenav>
    `
    const newChatButton = document.querySelector<HTMLAnchorElement>(
      'gem-nav-list-item[data-test-id="new-chat-button"] > a',
    )!
    const temporaryChatClickSpy = vi.fn()
    const newChatClickSpy = vi.fn(() => {
      window.history.pushState({}, '', '/app')
      window.setTimeout(() => {
        document.body.insertAdjacentHTML('beforeend', `
          <temp-chat-button>
            <gem-icon-button></gem-icon-button>
          </temp-chat-button>
        `)
        document.querySelector<HTMLElement>('temp-chat-button > gem-icon-button')!
          .addEventListener('click', temporaryChatClickSpy)
      }, 100)
    })
    newChatButton.addEventListener('click', newChatClickSpy)

    const opening = openTemporaryChatByClick()
    await vi.advanceTimersByTimeAsync(150)

    await expect(opening).resolves.toBe(true)
    expect(newChatClickSpy).toHaveBeenCalledTimes(1)
    expect(temporaryChatClickSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the SPA route fallback before waiting for the Temporary chat control', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/app/current-chat')
    const popStateSpy = vi.fn()
    const temporaryChatClickSpy = vi.fn()
    window.addEventListener('popstate', popStateSpy, { once: true })
    window.setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', `
        <temp-chat-button>
          <gem-icon-button></gem-icon-button>
        </temp-chat-button>
      `)
      document.querySelector<HTMLElement>('temp-chat-button > gem-icon-button')!
        .addEventListener('click', temporaryChatClickSpy)
    }, 100)

    const opening = openTemporaryChatByClick()
    await vi.advanceTimersByTimeAsync(150)

    await expect(opening).resolves.toBe(true)
    expect(window.location.pathname).toBe('/app')
    expect(popStateSpy).toHaveBeenCalledTimes(1)
    expect(temporaryChatClickSpy).toHaveBeenCalledTimes(1)
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
