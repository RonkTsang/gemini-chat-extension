import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  snapshot: {
    identity: { status: 'available', identity: { accountScopeId: 'account-scope-0001' } },
    projection: {
      settings: { enabled: true },
      memberships: [{ chatId: 'organized-chat' }],
      chatReferences: [{ chatId: 'organized-chat', cachedTitle: '' }],
    },
  } as any,
  listener: undefined as (() => void) | undefined,
  updateChatTitle: vi.fn(async () => undefined),
}))

vi.mock('./runtime', () => ({
  folderRuntime: {
    getSnapshot: () => state.snapshot,
    subscribe: (listener: () => void) => {
      state.listener = listener
      return () => { state.listener = undefined }
    },
    updateChatTitle: state.updateChatTitle,
  },
}))

import { FolderChatTitleCacheController } from './chat-title-cache'

function renderConversation(chatId: string, title: string): void {
  document.body.innerHTML = `
    <bard-sidenav role="navigation">
      <expandable-section data-test-id="chats-expandable-section">
        <gem-nav-list-item data-test-id="conversation">
          <a href="/app/${chatId}" aria-label="${title}">
            <span class="title-text">${title}</span>
          </a>
        </gem-nav-list-item>
      </expandable-section>
    </bard-sidenav>
  `
}

afterEach(() => {
  document.body.replaceChildren()
  state.updateChatTitle.mockClear()
  state.listener = undefined
})

describe('FolderChatTitleCacheController', () => {
  it('does not observe Gemini title changes for an already organized chat', async () => {
    renderConversation('organized-chat', 'Recovered Gemini title')
    const controller = new FolderChatTitleCacheController()
    controller.start()

    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(state.updateChatTitle).not.toHaveBeenCalled()
    controller.stop()
  })

  it('does not cache titles for chats that are not organized by Folders', async () => {
    renderConversation('unorganized-chat', 'Unrelated title')
    const controller = new FolderChatTitleCacheController()
    controller.start()
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    expect(state.updateChatTitle).not.toHaveBeenCalled()
    controller.stop()
  })
})
