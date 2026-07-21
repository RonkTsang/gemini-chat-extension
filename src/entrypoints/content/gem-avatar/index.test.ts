import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDeleteByGemId,
  mockGetByGemId,
  mockPrepare,
  mockResolveObjectUrl,
  mockRevokeActiveObjectUrl,
  mockSavePrepared,
} = vi.hoisted(() => ({
  mockDeleteByGemId: vi.fn(),
  mockGetByGemId: vi.fn(),
  mockPrepare: vi.fn(),
  mockResolveObjectUrl: vi.fn(),
  mockRevokeActiveObjectUrl: vi.fn(),
  mockSavePrepared: vi.fn(),
}))

vi.mock('@/data/repositories', () => ({
  gemAvatarRepository: {
    deleteByGemId: mockDeleteByGemId,
    getByGemId: mockGetByGemId,
    prepare: mockPrepare,
    resolveObjectUrl: mockResolveObjectUrl,
    revokeActiveObjectUrl: mockRevokeActiveObjectUrl,
    savePrepared: mockSavePrepared,
  },
}))

import { eventBus } from '@/utils/eventbus'
import { gemAvatarModule } from './index'

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

function setupChatDom(): void {
  document.body.innerHTML = `
    <sidenav-mavatar-footer>
      <div class="mavatar-footer-row">
        <a>
          <div class="mavatar-container">
            <img class="mavatar-image" src="https://example.com/user.png">
          </div>
        </a>
      </div>
    </sidenav-mavatar-footer>
    <chat-window>
      <bot-logo></bot-logo>
      <div id="chat-history">
        <infinite-scroller data-test-id="chat-history-container">
          <div class="conversation-container">
            <user-query>
              <user-query-content>
                <div class="user-query-container"></div>
              </user-query-content>
            </user-query>
            <model-response>
              <response-container>
                <div class="response-container"></div>
              </response-container>
            </model-response>
          </div>
        </infinite-scroller>
      </div>
    </chat-window>
  `
}

function createConversation(): HTMLElement {
  const conversation = document.createElement('div')
  conversation.className = 'conversation-container'
  conversation.innerHTML = `
    <user-query>
      <user-query-content>
        <div class="user-query-container"></div>
      </user-query-content>
    </user-query>
    <model-response>
      <response-container>
        <div class="response-container"></div>
      </response-container>
    </model-response>
  `
  return conversation
}

describe('gemAvatarModule', () => {
  beforeEach(() => {
    gemAvatarModule.stop()
    mockDeleteByGemId.mockReset()
    mockPrepare.mockReset()
    mockGetByGemId.mockReset()
    mockResolveObjectUrl.mockReset()
    mockRevokeActiveObjectUrl.mockReset()
    mockSavePrepared.mockReset()
    mockResolveObjectUrl.mockResolvedValue('blob:gem-avatar')
    mockGetByGemId.mockResolvedValue(undefined)
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      value: (id: number) => window.clearTimeout(id),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: window.requestAnimationFrame,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      value: window.cancelAnimationFrame,
      configurable: true,
      writable: true,
    })
  })

  it('injects chat avatars into the initial infinite-scroller content and header', async () => {
    setPath('/gem/gem-1/chat-1')
    setupChatDom()

    gemAvatarModule.start()
    await flush()

    expect(document.querySelector('bot-logo gem-avatar.gpk-gem-avatar-header img')?.getAttribute('src'))
      .toBe('blob:gem-avatar')
    expect(document.querySelector('user-query-content > div.user-query-container gem-avatar.gpk-gem-avatar-message-user img')?.getAttribute('src'))
      .toBe('https://example.com/user.png')
    expect(document.querySelector('response-container > div.response-container gem-avatar.gpk-gem-avatar-message-model img')?.getAttribute('src'))
      .toBe('blob:gem-avatar')
  })

  it('removes injected avatars and layout classes when stopped, then restores them when restarted', async () => {
    setPath('/gem/gem-1/chat-1')
    setupChatDom()
    const previewScroller = document.createElement('infinite-scroller')
    previewScroller.classList.add('gpk-gem-avatar-edit-preview-scroller')
    document.body.append(previewScroller)

    gemAvatarModule.start()
    await flush()

    gemAvatarModule.stop()

    expect(document.querySelector('[data-gpk-gem-avatar-injected="true"]')).toBeNull()
    expect(document.querySelector('bot-logo')?.classList.contains('gpk-gem-avatar-logo-anchor'))
      .toBe(false)
    expect(document.querySelector('user-query-content > div.user-query-container')?.classList.contains('gpk-gem-avatar-anchor'))
      .toBe(false)
    expect(previewScroller.classList.contains('gpk-gem-avatar-edit-preview-scroller'))
      .toBe(false)

    gemAvatarModule.start()
    await flush()

    expect(document.querySelector('[data-gpk-gem-avatar-injected="true"]')).not.toBeNull()
    expect(document.querySelector('bot-logo')?.classList.contains('gpk-gem-avatar-logo-anchor'))
      .toBe(true)
    expect(document.querySelector('user-query-content > div.user-query-container')?.classList.contains('gpk-gem-avatar-anchor'))
      .toBe(true)
  })

  it('opens the Gem editor from the chat-page Gem logo avatar', async () => {
    setPath('/gem/gem-1/chat-1')
    setupChatDom()
    const openMock = vi.fn()
    Object.defineProperty(window, 'open', {
      value: openMock,
      configurable: true,
      writable: true,
    })

    gemAvatarModule.start()
    await flush()

    const avatar = document.querySelector<HTMLElement>('bot-logo gem-avatar.gpk-gem-avatar-header')!
    avatar.click()

    expect(avatar.classList.contains('gpk-gem-avatar-logo-clickable'))
      .toBe(true)
    expect(avatar.getAttribute('role'))
      .toBe('link')
    expect(avatar.getAttribute('aria-label'))
      .toBe('Open Gem editor')
    expect(openMock).toHaveBeenCalledWith(
      'http://localhost:3000/gems/edit/gem-1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('opens the Gem editor from the chat-page model message avatar', async () => {
    setPath('/gem/gem-1/chat-1')
    setupChatDom()
    const openMock = vi.fn()
    Object.defineProperty(window, 'open', {
      value: openMock,
      configurable: true,
      writable: true,
    })

    gemAvatarModule.start()
    await flush()

    const avatar = document.querySelector<HTMLElement>(
      'response-container > div.response-container gem-avatar.gpk-gem-avatar-message-model',
    )!
    avatar.click()

    expect(avatar.classList.contains('gpk-gem-avatar-message-clickable'))
      .toBe(true)
    expect(avatar.getAttribute('role'))
      .toBe('link')
    expect(avatar.getAttribute('aria-label'))
      .toBe('Open Gem editor')
    expect(openMock).toHaveBeenCalledWith(
      'http://localhost:3000/gems/edit/gem-1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('applies recent-chat-list-item logo radius class outside edit pages', async () => {
    setPath('/gem/gem-1')
    document.body.innerHTML = `
      <chat-window>
        <recent-chat-list-item>
          <bot-logo style="--bot-logo-size: 32px"></bot-logo>
        </recent-chat-list-item>
        <div id="chat-history">
          <infinite-scroller data-test-id="chat-history-container"></infinite-scroller>
        </div>
      </chat-window>
    `

    gemAvatarModule.start()
    await flush()

    const avatar = document.querySelector('recent-chat-list-item bot-logo gem-avatar')

    expect(avatar?.classList.contains('gpk-gem-avatar-header'))
      .toBe(true)
    expect(avatar?.classList.contains('gpk-gem-avatar-recent-chat-logo'))
      .toBe(true)
  })

  it('observes added chat messages inside infinite-scroller only', async () => {
    setPath('/gem/gem-1')
    setupChatDom()
    const scroller = document.querySelector('infinite-scroller')!

    gemAvatarModule.start()
    await flush()

    const insideConversation = createConversation()
    scroller.append(insideConversation)
    await flush()
    await flush()

    expect(insideConversation.querySelector('gem-avatar.gpk-gem-avatar-message-model img')?.getAttribute('src'))
      .toBe('blob:gem-avatar')

    const outsideConversation = createConversation()
    document.body.append(outsideConversation)
    await flush()
    await flush()

    expect(outsideConversation.querySelector('gem-avatar.gpk-gem-avatar-message-model img'))
      .toBeNull()
  })

  it('refreshes chat observer when same-Gem route navigation replaces chat DOM', async () => {
    setPath('/gem/gem-1')
    setupChatDom()

    gemAvatarModule.start()
    await flush()

    const oldChatWindow = document.querySelector('chat-window')!

    setPath('/gem/gem-1/chat-1')
    await eventBus.emit('urlchange', {
      url: window.location.href,
      timestamp: Date.now(),
    })
    await flush()

    oldChatWindow.remove()
    document.body.insertAdjacentHTML('beforeend', `
      <chat-window>
        <bot-logo></bot-logo>
        <div id="chat-history">
          <infinite-scroller data-test-id="chat-history-container">
            <div class="conversation-container">
              <user-query>
                <user-query-content>
                  <div class="user-query-container"></div>
                </user-query-content>
              </user-query>
              <model-response>
                <response-container>
                  <div class="response-container"></div>
                </response-container>
              </model-response>
            </div>
          </infinite-scroller>
        </div>
      </chat-window>
    `)

    await wait(300)
    await flush()

    expect(document.querySelector('response-container > div.response-container gem-avatar.gpk-gem-avatar-message-model img')?.getAttribute('src'))
      .toBe('blob:gem-avatar')
    expect(document.querySelector('user-query-content > div.user-query-container gem-avatar.gpk-gem-avatar-message-user img')?.getAttribute('src'))
      .toBe('https://example.com/user.png')
  })

  it('persists pending create-page avatar when route changes to edit page', async () => {
    setPath('/gems/create')
    document.body.innerHTML = `
      <bots-creation-window>
        <div class="title-container">
          <bot-logo></bot-logo>
        </div>
      </bots-creation-window>
    `
    const prepared = {
      mimeType: 'image/webp' as const,
      size: 10,
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 256,
      height: 256,
    }
    mockPrepare.mockResolvedValue(prepared)
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:pending-avatar'),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    })

    gemAvatarModule.start()
    await flush()

    const input = document.querySelector<HTMLInputElement>('.gpk-gem-avatar-file-input')!
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await flush()

    setPath('/gems/edit/gem-new')
    await eventBus.emit('urlchange', {
      url: window.location.href,
      timestamp: Date.now(),
    })
    await flush()

    expect(mockSavePrepared).toHaveBeenCalledWith('gem-new', prepared)
  })

  it('injects compact avatars into edit-page chat previews and recent chat logos', async () => {
    setPath('/gems/edit/gem-1')
    document.body.innerHTML = `
      <sidenav-mavatar-footer>
        <div class="mavatar-footer-row">
          <a>
            <div class="mavatar-container">
              <img class="mavatar-image" src="https://example.com/user.png">
            </div>
          </a>
        </div>
      </sidenav-mavatar-footer>
      <bots-creation-window>
        <div class="title-container">
          <bot-logo></bot-logo>
        </div>
        <infinite-scroller>
          <recent-chat-list-item>
            <bot-logo style="--bot-logo-size: 32px"></bot-logo>
          </recent-chat-list-item>
          <bot-info-card>
            <div class="bot-info-container">
              <bot-logo></bot-logo>
            </div>
          </bot-info-card>
          <div class="conversation-container">
            <user-query>
              <user-query-content>
                <div class="user-query-container"></div>
              </user-query-content>
            </user-query>
            <model-response>
              <response-container>
                <div class="response-container"></div>
              </response-container>
            </model-response>
          </div>
        </infinite-scroller>
      </bots-creation-window>
    `

    gemAvatarModule.start()
    await flush()

    expect(document.querySelector('recent-chat-list-item bot-logo gem-avatar')?.classList.contains('gpk-gem-avatar-recent-chat-logo'))
      .toBe(true)
    expect(document.querySelector('bot-info-card div.bot-info-container > bot-logo gem-avatar')?.classList.contains('gpk-gem-avatar-edit-preview-logo'))
      .toBe(true)
    expect(document.querySelector('bots-creation-window infinite-scroller')?.classList.contains('gpk-gem-avatar-edit-preview-scroller'))
      .toBe(true)
    expect(document.querySelector('bots-creation-window infinite-scroller .gpk-gem-avatar-message-user')?.classList.contains('gpk-gem-avatar-message-compact'))
      .toBe(true)
    expect(document.querySelector('bots-creation-window infinite-scroller .gpk-gem-avatar-message-model')?.classList.contains('gpk-gem-avatar-message-compact'))
      .toBe(true)
  })

  it('deletes the stored edit-page avatar from the hover control', async () => {
    setPath('/gems/edit/gem-1')
    document.body.innerHTML = `
      <bots-creation-window>
        <div class="title-container">
          <bot-logo></bot-logo>
        </div>
        <infinite-scroller>
          <bot-info-card>
            <div class="bot-info-container">
              <bot-logo></bot-logo>
            </div>
          </bot-info-card>
          <div class="conversation-container">
            <model-response>
              <response-container>
                <div class="response-container"></div>
              </response-container>
            </model-response>
          </div>
        </infinite-scroller>
      </bots-creation-window>
    `
    mockDeleteByGemId.mockResolvedValue(undefined)

    gemAvatarModule.start()
    await flush()

    const deleteButton = document.querySelector<HTMLButtonElement>('.gpk-gem-avatar-delete')!
    expect(deleteButton.hidden).toBe(false)
    expect(deleteButton.textContent).toBe('')
    expect(deleteButton.querySelector('svg')).not.toBeNull()
    expect(document.querySelector('bot-info-card bot-logo gem-avatar.gpk-gem-avatar-edit-preview-logo'))
      .not.toBeNull()
    expect(document.querySelector('response-container > div.response-container gem-avatar.gpk-gem-avatar-message-model'))
      .not.toBeNull()
    expect(document.querySelector('bots-creation-window infinite-scroller')?.classList.contains('gpk-gem-avatar-edit-preview-scroller'))
      .toBe(true)

    deleteButton.click()
    await flush()

    expect(mockDeleteByGemId).toHaveBeenCalledWith('gem-1')
    expect(document.querySelector('.gpk-gem-avatar-delete')?.hasAttribute('hidden'))
      .toBe(true)
    expect(document.querySelector('bot-info-card bot-logo gem-avatar.gpk-gem-avatar-edit-preview-logo'))
      .toBeNull()
    expect(document.querySelector('response-container > div.response-container gem-avatar.gpk-gem-avatar-message-model'))
      .toBeNull()
    expect(document.querySelector('bots-creation-window infinite-scroller')?.classList.contains('gpk-gem-avatar-edit-preview-scroller'))
      .toBe(false)
  })

  it('hides the edit-page avatar delete control when there is no avatar', async () => {
    setPath('/gems/edit/gem-1')
    document.body.innerHTML = `
      <bots-creation-window>
        <div class="title-container">
          <bot-logo></bot-logo>
        </div>
      </bots-creation-window>
    `
    mockResolveObjectUrl.mockResolvedValueOnce(null)

    gemAvatarModule.start()
    await flush()

    expect(document.querySelector<HTMLButtonElement>('.gpk-gem-avatar-delete')?.hidden)
      .toBe(true)
  })

  it('injects stored avatars into Gem list rows by href Gem ID', async () => {
    setPath('/gems/view')
    document.body.innerHTML = `
      <div class="bots-section-container">
        <bot-list-row>
          <div class="bot-list-row-container">
            <a class="bot-row" href="/gem/bed3427bd579">
              <bot-logo></bot-logo>
            </a>
          </div>
        </bot-list-row>
        <bot-list-row>
          <div class="bot-list-row-container">
            <a class="bot-row" href="/gem/no-avatar">
              <bot-logo></bot-logo>
            </a>
          </div>
        </bot-list-row>
      </div>
    `
    const createObjectURLMock = vi.fn(() => 'blob:list-avatar')
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURLMock,
      configurable: true,
      writable: true,
    })
    mockGetByGemId.mockImplementation(async (gemId: string) => {
      if (gemId !== 'bed3427bd579') return undefined
      return {
        gemId,
        mimeType: 'image/webp',
        size: 10,
        blob: new Blob(['avatar'], { type: 'image/webp' }),
        width: 256,
        height: 256,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }
    })

    gemAvatarModule.start()
    await flush()

    expect(document.querySelector('a[href="/gem/bed3427bd579"] bot-logo gem-avatar.gpk-gem-avatar-list img')?.getAttribute('src'))
      .toBe('blob:list-avatar')
    expect(document.querySelector('a[href="/gem/bed3427bd579"] bot-logo gem-avatar.gpk-gem-avatar-list')?.classList.contains('gpk-gem-avatar-logo'))
      .toBe(true)
    expect(document.querySelector('a[href="/gem/no-avatar"] bot-logo gem-avatar.gpk-gem-avatar-list'))
      .toBeNull()
  })

  it('revokes Gem list object URLs when leaving list page', async () => {
    setPath('/gems/view')
    document.body.innerHTML = `
      <div class="bots-section-container">
        <bot-list-row>
          <div class="bot-list-row-container">
            <a class="bot-row" href="/gem/bed3427bd579">
              <bot-logo></bot-logo>
            </a>
          </div>
        </bot-list-row>
      </div>
    `
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:list-avatar'),
      configurable: true,
      writable: true,
    })
    const revokeObjectURLMock = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      configurable: true,
      writable: true,
    })
    mockGetByGemId.mockResolvedValue({
      gemId: 'bed3427bd579',
      mimeType: 'image/webp',
      size: 10,
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 256,
      height: 256,
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    })

    gemAvatarModule.start()
    await flush()

    setPath('/app')
    await eventBus.emit('urlchange', {
      url: window.location.href,
      timestamp: Date.now(),
    })
    await flush()

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:list-avatar')
  })
})
