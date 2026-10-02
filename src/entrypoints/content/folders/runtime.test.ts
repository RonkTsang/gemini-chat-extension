import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const identity = { status: 'available' as const, identity: { email: 'user@example.com', accountScopeId: 'account-scope-0001', source: 'observed' as const, resolvedAt: '2026-01-01T00:00:00.000Z' } }
  const projection = { folders: [{ id: 'folder-1' }], memberships: [], chatReferences: [], settings: { accountScopeId: identity.identity.accountScopeId, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', settingsVersion: '0000000000000:000000:default', settingsPending: false } }
  return { identity, projection, request: vi.fn(), getProjection: vi.fn(), getSyncStatus: vi.fn(), getChatPage: vi.fn() }
})

vi.mock('./client', () => ({ folderBackgroundClient: { request: state.request, getProjection: state.getProjection, getSyncStatus: state.getSyncStatus, getChatPage: state.getChatPage } }))
vi.mock('@/services/gemini-identity', () => ({ geminiIdentityService: {
  getCurrent: () => state.identity,
  subscribe: (listener: (identity: typeof state.identity) => void) => { listener(state.identity); return () => undefined },
  start: vi.fn(async () => undefined), stop: vi.fn(), confirmManualEmail: vi.fn(), clearManualEmail: vi.fn(),
} }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } } }))
vi.mock('@/utils/folderTrace', () => ({ createFolderTraceId: () => 'trace', logFolderTrace: vi.fn(), logFolderTraceError: vi.fn() }))

import { FolderRuntime } from './runtime'

describe('FolderRuntime background boundary', () => {
  beforeEach(() => {
    state.getChatPage.mockReset()
    state.getProjection.mockReset().mockResolvedValue(state.projection)
    state.getSyncStatus.mockReset().mockResolvedValue({ mode: 'browser-sync', state: 'accepted-by-browser-storage' })
    state.request.mockReset().mockResolvedValue({ data: undefined, dataRevision: 'revision-1' })
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
    })
    await runtime.setFolderCollapsed('folder-1', true)
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
