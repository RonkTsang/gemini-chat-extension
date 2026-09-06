import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLatestChatRows } from './dom'

vi.mock('@/utils/i18n', () => ({
  t: (id: string) => id,
}))

function conversationRow(index: number): string {
  const id = String(index).padStart(8, '0')
  return `<gem-nav-list-item data-test-id="conversation"><a href="/app/${id}">Chat ${index}</a></gem-nav-list-item>`
}

function renderSidenav(rowCount = 1, withSpinner = false): HTMLElement {
  document.body.innerHTML = `
    <bard-sidenav role="navigation">
      <side-navigation-content>
        <infinite-scroller>
          <expandable-section storagekey="chats" data-test-id="chats-expandable-section">
            <button data-test-id="expandable-section-toggle" aria-expanded="true">Chats</button>
            <div class="history-region">
              <conversations-list data-test-id="all-conversations">
                ${Array.from({ length: rowCount }, (_, index) => conversationRow(index + 1)).join('')}
              </conversations-list>
              ${withSpinner ? '<div class="loading-history-spinner-container is-loading"><mat-progress-spinner data-test-id="loading-history-spinner"></mat-progress-spinner></div>' : ''}
            </div>
          </expandable-section>
        </infinite-scroller>
      </side-navigation-content>
    </bard-sidenav>
    <chat-window>
      <gem-icon-button><button aria-label="Show more options">Show more options</button></gem-icon-button>
    </chat-window>
  `

  const scroller = document.querySelector<HTMLElement>('infinite-scroller')!
  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 1000 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  })
  scroller.scrollTo = (({ top }: ScrollToOptions) => {
    scroller.scrollTop = top ?? 0
  }) as typeof scroller.scrollTo
  return scroller
}

function appendConversation(index: number): void {
  document.querySelector('conversations-list')?.insertAdjacentHTML('beforeend', conversationRow(index))
}

function appendConversationOutsideList(index: number): void {
  document.querySelector('.history-region')?.insertAdjacentHTML('afterbegin', conversationRow(index))
}

describe('Bulk Delete history loading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('does not click chat-window Show more options while using the no-spinner fallback', async () => {
    const scroller = renderSidenav()
    const chatWindowMoreButton = document.querySelector<HTMLButtonElement>('chat-window button')!
    const clickSpy = vi.spyOn(chatWindowMoreButton, 'click')
    scroller.addEventListener('scroll', () => {
      window.setTimeout(() => appendConversation(2), 200)
    }, { once: true })

    const loading = loadLatestChatRows(2, new Set(), vi.fn())
    await vi.advanceTimersByTimeAsync(600)

    await expect(loading).resolves.toEqual({ completed: true })
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('uses the scroller conversations-list to wait for a delayed SideNav spinner', async () => {
    const scroller = renderSidenav()
    scroller.addEventListener('scroll', () => {
      window.setTimeout(() => {
        document.querySelector('.history-region')?.insertAdjacentHTML(
          'beforeend',
          '<div class="loading-history-spinner-container is-loading"><mat-progress-spinner data-test-id="loading-history-spinner"></mat-progress-spinner></div>',
        )
      }, 100)
      window.setTimeout(() => {
        appendConversation(2)
        document.querySelector('.loading-history-spinner-container')?.remove()
      }, 200)
    }, { once: true })

    const loading = loadLatestChatRows(2, new Set(), vi.fn())
    await vi.advanceTimersByTimeAsync(300)

    await expect(loading).resolves.toEqual({ completed: true })
  })

  it('ignores a non-adjacent spinner in the same SideNav region', async () => {
    const scroller = renderSidenav()
    document.querySelector('.history-region')?.insertAdjacentHTML(
      'beforeend',
      '<div class="unrelated-content"></div><div class="loading-history-spinner-container is-loading"><mat-progress-spinner data-test-id="loading-history-spinner"></mat-progress-spinner></div>',
    )
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')
    scroller.addEventListener('scroll', () => {
      window.setTimeout(() => appendConversation(2), 200)
    }, { once: true })

    const loading = loadLatestChatRows(2, new Set(), vi.fn())
    await vi.advanceTimersByTimeAsync(600)

    await expect(loading).resolves.toEqual({ completed: true })
    expect(disconnectSpy).not.toHaveBeenCalled()
  })

  it('does not treat a generic conversation row as a loading list', async () => {
    const scroller = renderSidenav()
    const conversationsList = document.querySelector('conversations-list')!
    conversationsList.replaceWith(...Array.from(conversationsList.children))
    document.querySelector('.history-region')?.insertAdjacentHTML(
      'beforeend',
      '<div class="loading-history-spinner-container is-loading"><mat-progress-spinner data-test-id="loading-history-spinner"></mat-progress-spinner></div>',
    )
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')
    scroller.addEventListener('scroll', () => {
      window.setTimeout(() => appendConversationOutsideList(2), 200)
    }, { once: true })

    const loading = loadLatestChatRows(2, new Set(), vi.fn())
    await vi.advanceTimersByTimeAsync(600)

    await expect(loading).resolves.toEqual({ completed: true })
    expect(disconnectSpy).not.toHaveBeenCalled()
  })

  it('disconnects the loading observer when the operation is aborted', async () => {
    renderSidenav(1, true)
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const controller = new AbortController()
    const loading = loadLatestChatRows(2, new Set(), vi.fn(), controller.signal)

    await vi.advanceTimersByTimeAsync(150)
    controller.abort()

    await expect(loading).rejects.toThrow('aborted')
    expect(disconnectSpy).toHaveBeenCalledOnce()
  })

  it('disconnects the loading observer when its timeout expires', async () => {
    renderSidenav(1, true)
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const controller = new AbortController()
    const loading = loadLatestChatRows(2, new Set(), vi.fn(), controller.signal)

    await vi.advanceTimersByTimeAsync(7150)

    expect(disconnectSpy).toHaveBeenCalledOnce()
    controller.abort()
    await expect(loading).rejects.toThrow('aborted')
  })
})
