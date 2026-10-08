import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEM_EXT_EVENTS } from '@/common/event'
import { eventBus } from '@/utils/eventbus'
import type { FolderRuntime } from './runtime'

const state = vi.hoisted(() => ({
  snapshot: {
    identity: { status: 'available', identity: { accountScopeId: 'account-1' } },
    projection: { settings: { enabled: true }, folders: [{ id: 'folder-a' }, { id: 'folder-b' }] },
  },
  addMembership: vi.fn(async () => undefined),
  completeNewChatTitle: vi.fn(async () => undefined),
  setFolderCollapsed: vi.fn(async () => undefined),
}))
vi.mock('./runtime', () => ({ folderRuntime: {
  getSnapshot: () => state.snapshot,
  subscribe: () => () => undefined,
  addMembership: state.addMembership,
  completeNewChatTitle: state.completeNewChatTitle,
  setFolderCollapsed: state.setFolderCollapsed,
} }))
vi.mock('@/utils/chatActions', () => ({ openNewChat: vi.fn(async () => undefined) }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))

import { FolderNewChatController } from './new-chat'
import { folderRuntime } from './runtime'

let controller: FolderNewChatController
const emit = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, { detail }))
const acknowledge = (event: Event) => {
  const data = (event as CustomEvent<{ action: string; token: string }>).detail
  if (data.action === 'arm') emit({ token: data.token, phase: 'armed' })
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
beforeEach(() => {
  vi.clearAllMocks()
  state.snapshot.identity.identity.accountScopeId = 'account-1'
  window.history.replaceState({}, '', '/app')
  document.body.innerHTML = '<chat-window><input-container><div class="input-area-container"><input-area-v2><fieldset><rich-textarea><div contenteditable="true" role="textbox"></div></rich-textarea></fieldset></input-area-v2></div></input-container></chat-window>'
  controller = new FolderNewChatController(folderRuntime as FolderRuntime)
  window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, acknowledge)
})
afterEach(() => {
  controller.stop()
  window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, acknowledge)
  document.body.replaceChildren()
})

describe('Folder new chat association', () => {
  it('binds one request and saves its chat before the late title appears', async () => {
    await controller.open('folder-a')
    const token = controller.getSnapshot()!.token
    emit({ token, phase: 'started', requestId: 'request-1' })
    emit({ token, phase: 'metadata', requestId: 'other-request', conversationId: 'c_bad' })
    expect(state.addMembership).not.toHaveBeenCalled()
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc' })
    await flush()
    expect(state.addMembership).toHaveBeenCalledExactlyOnceWith('folder-a', 'abc')
    expect(state.completeNewChatTitle).not.toHaveBeenCalled()
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc', title: 'Generated title' })
    await flush()
    expect(state.completeNewChatTitle).toHaveBeenCalledExactlyOnceWith('abc', 'Generated title', '')
    expect(controller.getSnapshot()).toBeUndefined()
  })
  it('closing the label before or after submission prevents late response writes', async () => {
    await controller.open('folder-a')
    const token = controller.getSnapshot()!.token
    emit({ token, phase: 'started', requestId: 'request-1' })
    controller.cancel()
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc' })
    await flush()
    expect(state.addMembership).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toBeUndefined()
  })
  it('clears a pending intent on existing-chat navigation and temporary mode', async () => {
    await controller.open('folder-a')
    window.history.pushState({}, '', '/app/abc')
    eventBus.emitSync('urlchange', { url: location.href, timestamp: Date.now() })
    expect(controller.getSnapshot()).toBeUndefined()
    window.history.replaceState({}, '', '/app')
    await controller.open('folder-a')
    document.querySelector('chat-window')!.classList.add('is-temporary-chat')
    await flush()
    expect(controller.getSnapshot()).toBeUndefined()
  })
  it('replacing an unsent target ignores observations for the old intent', async () => {
    await controller.open('folder-a')
    const oldToken = controller.getSnapshot()!.token
    await controller.open('folder-b')
    emit({ token: oldToken, phase: 'started', requestId: 'old-request' })
    emit({ token: oldToken, phase: 'metadata', requestId: 'old-request', conversationId: 'c_abc' })
    expect(state.addMembership).not.toHaveBeenCalled()
    expect(controller.getSnapshot()?.folderId).toBe('folder-b')
  })
  it('retries the fixed Folder/chat pair after a failed save', async () => {
    state.addMembership.mockRejectedValueOnce(new Error('Storage failed'))
    await controller.open('folder-a')
    const token = controller.getSnapshot()!.token
    emit({ token, phase: 'started', requestId: 'request-1' })
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc', title: 'Title' })
    await flush()
    expect(controller.getSnapshot()?.phase).toBe('failed')
    controller.retry()
    await flush()
    expect(state.addMembership).toHaveBeenNthCalledWith(2, 'folder-a', 'abc')
    expect(controller.getSnapshot()).toBeUndefined()
  })
  it('rejects malformed observations and account changes', async () => {
    await controller.open('folder-a')
    const token = controller.getSnapshot()!.token
    emit({ token, phase: 'started', requestId: 'request-1' })
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'invalid' })
    state.snapshot.identity.identity.accountScopeId = 'account-2'
    emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc' })
    expect(state.addMembership).not.toHaveBeenCalled()
  })
})
