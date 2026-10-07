import type { GeminiUserIdentity } from '@/services/gemini-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const identity: { status: 'available'; identity: GeminiUserIdentity } = { status: 'available' as const, identity: { email: 'user@example.com', accountScopeId: 'account-scope-0001', source: 'observed' as const, resolvedAt: '2026-01-01T00:00:00.000Z' } }
  const projection = { folders: [{ id: 'folder-1' }], memberships: [], chatReferences: [], settings: { accountScopeId: identity.identity.accountScopeId, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', settingsVersion: '0000000000000:000000:default', settingsPending: false } }
  return { identity, projection, request: vi.fn(), getProjection: vi.fn(), getSyncStatus: vi.fn(), getChatPage: vi.fn(), renameChat: vi.fn(), deleteNative: vi.fn(), confirmEmail: vi.fn(), identityListener: undefined as ((identity: { status: 'available'; identity: GeminiUserIdentity }) => void) | undefined }
})

vi.mock('./client', () => ({ folderBackgroundClient: { request: state.request, getProjection: state.getProjection, getSyncStatus: state.getSyncStatus, getChatPage: state.getChatPage } }))
vi.mock('@/services/gemini-identity', () => ({ geminiIdentityService: {
  getCurrent: () => state.identity,
  subscribe: (listener: (identity: typeof state.identity) => void) => { state.identityListener = listener; listener(state.identity); return () => { state.identityListener = undefined } },
  start: vi.fn(async () => undefined), stop: vi.fn(), refresh: vi.fn(async () => state.identity), confirmManualEmail: state.confirmEmail, clearManualEmail: vi.fn(),
} }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } } }))
vi.mock('@/utils/folderTrace', () => ({ createFolderTraceId: () => 'trace', logFolderTrace: vi.fn(), logFolderTraceError: vi.fn() }))
vi.mock('@/services/gemini-api', () => ({ geminiApi: { conversations: { renameChat: state.renameChat } } }))
vi.mock('./native-chat-delete', () => ({ deleteGeminiChat: state.deleteNative }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))

import { FolderRuntime } from './runtime'

describe('FolderRuntime background boundary', () => {
  beforeEach(() => {
    state.confirmEmail.mockReset()
    state.identityListener = undefined
    state.identity.identity.source = 'observed'
    state.getChatPage.mockReset()
    state.getProjection.mockReset().mockResolvedValue(state.projection)
    state.getSyncStatus.mockReset().mockResolvedValue({ mode: 'browser-sync', state: 'accepted-by-browser-storage' })
    state.request.mockReset().mockResolvedValue({ data: undefined, dataRevision: 'revision-1' })
    state.deleteNative.mockReset().mockResolvedValue(undefined)
  })

  it('clears the previous account while loading a saved account and waits for its configuration', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    let finish!: (projection: typeof state.projection) => void
    state.getProjection.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const next = { status: 'available' as const, identity: { ...state.identity.identity,
      email: 'next@example.com', accountScopeId: 'account-scope-0002', source: 'manual-confirmed' as const, selection: 'history' as const } }
    state.confirmEmail.mockImplementationOnce(async () => { state.identityListener?.(next); return next })
    let completed = false
    const selection = runtime.selectSavedAccount('next@example.com').then(() => { completed = true })
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(runtime.getSnapshot().identity).toEqual(next)
    expect(runtime.getSnapshot().projection).toBeUndefined()
    await expect(runtime.updateSettings({ hideOrganizedChats: true })).rejects.toThrow('Folders are unavailable')
    expect(completed).toBe(false)
    const projection = { ...state.projection, settings: { ...state.projection.settings, accountScopeId: 'account-scope-0002' } }
    finish(projection)
    await selection
    expect(runtime.getSnapshot().projection).toBe(projection)
    expect(state.confirmEmail).toHaveBeenCalledWith('next@example.com', true, 'history')
    expect(state.request).toHaveBeenCalledWith('account-scope-0002', 'manual-confirmed', 'activityHint', {})
    runtime.stop()
  })

  it('starts sync, measures capacity and retries for a manually confirmed account', async () => {
    state.identity.identity.source = 'manual-confirmed'
    const runtime = new FolderRuntime()
    await runtime.start()
    expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'manual-confirmed', 'activityHint', {})
    expect(state.getProjection).toHaveBeenCalledWith('account-scope-0001', 'manual-confirmed', undefined)
    state.request.mockResolvedValue({ data: { mode: 'browser-sync', state: 'accepted-by-browser-storage', currentUsageBytes: 10 }, dataRevision: 'revision-1' })
    await runtime.measureBrowserSyncUsage()
    expect(runtime.getSnapshot().syncState?.currentUsageBytes).toBe(10)
    expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'manual-confirmed', 'measureBrowserSyncUsage', {})
    await runtime.syncNow()
    expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'manual-confirmed', 'retrySync', {})
    runtime.stop()
    await expect(runtime.syncNow()).rejects.toThrow('Browser Sync requires an identified Gemini account')
  })

  it('never calls Gemini deletion if the protection point cannot be saved', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    state.request.mockRejectedValueOnce(new Error('LOCAL_STORAGE_FULL'))
    await expect(runtime.deleteChat('folder-1', 'chat-1')).rejects.toThrow('LOCAL_STORAGE_FULL')
    expect(state.deleteNative).not.toHaveBeenCalled()
    runtime.stop()
  })

  it('saves protection before Gemini deletion and releases it even when Gemini fails', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    const order: string[] = []
    state.request.mockImplementation(async (_scope, _source, method) => {
      order.push(method)
      return { data: method === 'prepareChatDeletion' ? { id: 'snapshot-1', protectionToken: 'lease-1' } : undefined }
    })
    state.deleteNative.mockImplementation(async () => { order.push('native-delete'); throw new Error('Gemini failed') })
    await expect(runtime.deleteChat('folder-1', 'chat-1')).rejects.toThrow('Gemini failed')
    expect(order).toEqual(['prepareChatDeletion', 'native-delete', 'releaseSnapshot'])
    expect(state.request).toHaveBeenLastCalledWith('account-scope-0001', 'observed', 'releaseSnapshot', { snapshotId: 'snapshot-1', protectionToken: 'lease-1' })
    runtime.stop()
  })

  it('closes the menu and refreshes the folder after the pin is committed', async () => {
    state.getProjection.mockResolvedValue({ ...state.projection, memberships: [{ id: 'member-1', folderId: 'folder-1', chatId: 'chat-1' }] })
    const runtime = new FolderRuntime()
    await runtime.start()
    runtime.openChatMenu('folder-1', 'chat-1', 'Chat', document.createElement('button'))
    const pending = runtime.setMembershipPinned('folder-1', 'chat-1', true)
    expect(runtime.getSnapshot().menu).toBeUndefined()
    await pending
    expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'observed', 'setMembershipPinned', { folderId: 'folder-1', chatId: 'chat-1', pinned: true })
    expect(state.getProjection).toHaveBeenCalledTimes(2)
    runtime.stop()
  })

  it('retains the list on a failed pin and ignores late failures after stop', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    const projection = runtime.getSnapshot().projection
    state.request.mockRejectedValueOnce(new Error('Pin save failed'))
    await runtime.setMembershipPinned('folder-1', 'chat-1', true)
    expect(runtime.getSnapshot().error).toBe('Pin save failed')
    expect(runtime.getSnapshot().projection).toBe(projection)
    let reject!: (error: Error) => void
    state.request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const pending = runtime.setMembershipPinned('folder-1', 'chat-1', true)
    runtime.stop()
    reject(new Error('Late failure'))
    await pending
    expect(runtime.getSnapshot().error).toBeUndefined()
    expect(runtime.getSnapshot().projection).toBeUndefined()
  })

  it('loads only through the background client and forwards an explicit command', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    state.request.mockResolvedValueOnce({ data: { id: 'membership-1', folderId: 'folder-1', chatId: 'chat-1' }, dataRevision: 'revision-2' })
    await runtime.addMembership('folder-1', 'chat-1', 'A chat')
    expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'observed', 'addMembership', { folderId: 'folder-1', chatId: 'chat-1', cachedTitle: 'A chat' })
    runtime.stop()
  })

  it('loads a chat page once, appends it, and removes the cursor at the end', async () => {
    state.getProjection.mockResolvedValue({ ...state.projection, chatCursors: { 'folder-1': 'cursor-1' } })
    const runtime = new FolderRuntime()
    await runtime.start()
    let resolvePage!: (page: unknown) => void
    state.getChatPage.mockImplementation(() => new Promise((resolve) => { resolvePage = resolve }))
    const pending = runtime.loadMoreChats('folder-1')
    await runtime.loadMoreChats('folder-1')
    expect(state.getChatPage).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'observed', 'folder-1', 'cursor-1')
    expect(runtime.getSnapshot().loadingChatFolderIds).toEqual(['folder-1'])
    resolvePage({ memberships: [{ id: 'member-1', folderId: 'folder-1', chatId: 'chat-1' }], chatReferences: [{ chatId: 'chat-1', cachedTitle: 'Chat' }] })
    await pending
    expect(runtime.getSnapshot().projection?.memberships).toHaveLength(1)
    expect(runtime.getSnapshot().projection?.chatCursors?.['folder-1']).toBeUndefined()
    expect(runtime.getSnapshot().loadingChatFolderIds).toEqual([])
    await runtime.loadMoreChats('folder-1')
    expect(state.getChatPage).toHaveBeenCalledTimes(1)
    runtime.stop()
  })

  it('keeps the cursor for retry after a page failure and ignores results after stop', async () => {
    state.getProjection.mockResolvedValue({ ...state.projection, chatCursors: { 'folder-1': 'cursor-1' } })
    const runtime = new FolderRuntime()
    await runtime.start()
    state.getChatPage.mockRejectedValueOnce(new Error('Page failed'))
    await runtime.loadMoreChats('folder-1')
    expect(runtime.getSnapshot().error).toBe('Page failed')
    expect(runtime.getSnapshot().projection?.chatCursors?.['folder-1']).toBe('cursor-1')
    expect(runtime.getSnapshot().loadingChatFolderIds).toEqual([])
    let resolvePage!: (page: unknown) => void
    state.getChatPage.mockImplementation(() => new Promise((resolve) => { resolvePage = resolve }))
    const pending = runtime.loadMoreChats('folder-1')
    runtime.stop()
    resolvePage({ memberships: [], chatReferences: [] })
    await pending
    expect(runtime.getSnapshot().projection).toBeUndefined()
  })

  it('retains loaded chat rows and the load-more cursor when collapsing refreshes the sidebar', async () => {
    const membership = { id: 'member-1', folderId: 'folder-1', chatId: 'chat-1' }
    const reference = { chatId: 'chat-1', cachedTitle: 'Chat' }
    state.getProjection.mockResolvedValueOnce({
      ...state.projection,
      memberships: [membership],
      chatReferences: [reference],
      chatCursors: { 'folder-1': 'cursor-1' },
    })
    const runtime = new FolderRuntime()
    await runtime.start()
    state.getProjection.mockResolvedValue({
      ...state.projection,
      settings: { ...state.projection.settings, collapsedFolderIds: ['folder-1'] },
      memberships: [membership], chatReferences: [reference], chatCursors: { 'folder-1': 'cursor-1' },
    })
    const previousProjection = runtime.getSnapshot().projection
    await runtime.setFolderCollapsed('folder-1', true)
    expect(state.getProjection).toHaveBeenLastCalledWith('account-scope-0001', 'observed', previousProjection)
    expect(runtime.getSnapshot().projection?.settings.collapsedFolderIds).toEqual(['folder-1'])
    expect(runtime.getSnapshot().projection?.memberships).toEqual([membership])
    expect(runtime.getSnapshot().projection?.chatReferences).toEqual([reference])
    expect(runtime.getSnapshot().projection?.chatCursors?.['folder-1']).toBe('cursor-1')
    runtime.stop()
  })

  it('creates a Folder without an unrelated settings write', async () => {
    state.request.mockImplementation(async (_scope, _source, method) => ({
      data: method === 'createFolder'
        ? { id: 'folder-2', name: 'Inbox' }
        : undefined,
      dataRevision: 'revision-2',
    }))
    const runtime = new FolderRuntime()
    await runtime.start()
    state.request.mockClear()

    await runtime.createFolder('Inbox')

    expect(state.request).toHaveBeenCalledWith(
      'account-scope-0001',
      'observed',
      'createFolder',
      { name: 'Inbox', iconKey: undefined, colorValue: undefined },
    )
    expect(state.request.mock.calls.some((call) => call[2] === 'updateSettings')).toBe(false)
    expect(state.request.mock.calls.some((call) => call[2] === 'activityHint')).toBe(false)
    runtime.stop()
  })

  it('coalesces the initial focus activity hint without reloading Folder data', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    expect(state.getProjection).toHaveBeenCalledTimes(1)
    state.request.mockClear()
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.request).not.toHaveBeenCalled()
    expect(state.getProjection).toHaveBeenCalledTimes(1)
    expect(state.request.mock.calls.some((call) => call[2] === 'measureBrowserSyncUsage')).toBe(false)
    runtime.stop()
  })

  it('measures usage only through an explicit RPC without reloading data or scheduling sync', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    state.request.mockClear()
    state.getProjection.mockClear()
    state.getSyncStatus.mockClear()
    const syncState = { mode: 'browser-sync', state: 'accepted-by-browser-storage', currentUsageBytes: 42, showCapacityNotice: false }
    state.request.mockResolvedValueOnce({ data: syncState, dataRevision: 'revision-1' })
    await runtime.measureBrowserSyncUsage()
    expect(state.request).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'observed', 'measureBrowserSyncUsage', {})
    expect(runtime.getSnapshot().syncState).toEqual(syncState)
    expect(state.getProjection).not.toHaveBeenCalled()
    expect(state.getSyncStatus).not.toHaveBeenCalled()
    runtime.stop()
  })

  it('refreshes only sync status for a syncStatus-only invalidation', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const projectionCalls = state.getProjection.mock.calls.length
    const syncStatusCalls = state.getSyncStatus.mock.calls.length

    ;(runtime as unknown as { handleBackgroundMessage: (message: unknown) => void }).handleBackgroundMessage({
      type: 'folders:data-changed',
      accountScopeId: 'account-scope-0001',
      affected: { syncStatus: true },
    })

    await vi.waitFor(() => expect(state.getSyncStatus.mock.calls.length).toBe(syncStatusCalls + 1))
    expect(state.getProjection).toHaveBeenCalledTimes(projectionCalls)
    runtime.stop()
  })
})

describe('Folder chat rename', () => {
  const chatId = 'e314bf90da4c7254'
  const reference = {
    accountScopeId: state.identity.identity.accountScopeId, chatId, cachedTitle: 'New title',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', titleVersionStamp: 'new-version',
  }

  beforeEach(() => {
    window.history.replaceState({}, '', '/app/e314bf90da4c7254')
    state.getProjection.mockReset().mockResolvedValue({
      ...state.projection,
      memberships: [
        { id: 'member-1', folderId: 'folder-1', chatId },
        { id: 'member-2', folderId: 'folder-2', chatId },
      ],
      chatReferences: [{ ...reference, cachedTitle: 'Old title' }],
      chatCursors: { 'folder-1': 'next-page' },
    })
    state.getSyncStatus.mockReset().mockResolvedValue({ mode: 'browser-sync', state: 'accepted-by-browser-storage' })
    state.request.mockReset().mockImplementation(async (_scope, _source, method) => ({
      data: method === 'updateChatTitle' ? reference : undefined, dataRevision: 'revision-2',
    }))
    state.renameChat.mockReset().mockResolvedValue({
      ok: true, data: { accepted: true, conversationId: `c_${chatId}`, title: 'New title' },
    })
  })

  it('opens with the visible chat title and closes the more menu', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    runtime.openChatMenu('folder-1', chatId, 'Old title', document.createElement('button'))
    runtime.openRenameChatDialog('folder-1', chatId, 'Old title')
    expect(runtime.getSnapshot().menu).toBeUndefined()
    expect(runtime.getSnapshot().dialog).toEqual({ kind: 'rename-chat', folderId: 'folder-1', chatId, chatTitle: 'Old title' })
    runtime.stop()
  })

  it('persists first, updates the shared title without reloading pages, then renames Gemini', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    runtime.openRenameChatDialog('folder-1', chatId, 'Old title')
    const projection = runtime.getSnapshot().projection!
    state.renameChat.mockImplementation(async () => {
      expect(state.request).toHaveBeenCalledWith('account-scope-0001', 'observed', 'updateChatTitle', { chatId, title: 'New title' })
      expect(runtime.getSnapshot().projection?.chatReferences).toEqual([reference])
      return { ok: true, data: { accepted: true, conversationId: `c_${chatId}`, title: 'New title' } }
    })
    await runtime.renameChat('folder-1', chatId, '  New title  ')
    expect(state.renameChat).toHaveBeenCalledExactlyOnceWith({ chat_id: chatId, title: 'New title' })
    expect(runtime.getSnapshot().dialog).toBeUndefined()
    expect(runtime.getSnapshot().projection?.memberships).toBe(projection.memberships)
    expect(runtime.getSnapshot().projection?.chatCursors).toBe(projection.chatCursors)
    expect(state.getProjection).toHaveBeenCalledTimes(1)
    runtime.stop()
  })

  it.each(['not-sent', 'unknown'])('retains the saved Folder title and dialog after a Gemini %s failure', async (outcome) => {
    const runtime = new FolderRuntime()
    await runtime.start()
    runtime.openRenameChatDialog('folder-1', chatId, 'Old title')
    state.renameChat.mockResolvedValueOnce({ ok: false, code: 'timeout', outcome })
    await expect(runtime.renameChat('folder-1', chatId, 'New title')).rejects.toThrow(
      outcome === 'unknown' ? 'could not be confirmed' : 'could not be renamed',
    )
    expect(runtime.getSnapshot().projection?.chatReferences).toEqual([reference])
    expect(runtime.getSnapshot().dialog?.kind).toBe('rename-chat')
    expect(state.renameChat).toHaveBeenCalledTimes(1)
    runtime.stop()
  })

  it('does not send to Gemini when local persistence fails', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    state.request.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(runtime.renameChat('folder-1', chatId, 'New title')).rejects.toThrow('Storage unavailable')
    expect(state.renameChat).not.toHaveBeenCalled()
    expect(runtime.getSnapshot().projection?.chatReferences[0].cachedTitle).toBe('Old title')
    runtime.stop()
  })

  it('does not send the rename after the active Gemini account path changes', async () => {
    const runtime = new FolderRuntime()
    await runtime.start()
    state.request.mockImplementationOnce(async () => {
      window.history.replaceState({}, '', '/u/1/app/e314bf90da4c7254')
      return { data: reference, dataRevision: 'revision-2' }
    })
    await expect(runtime.renameChat('folder-1', chatId, 'New title')).rejects.toThrow('account changed')
    expect(state.renameChat).not.toHaveBeenCalled()
    runtime.stop()
  })
})
