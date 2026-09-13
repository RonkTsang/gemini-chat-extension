import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const identity = { status: 'available' as const, identity: { email: 'user@example.com', accountScopeId: 'account-scope-0001', source: 'observed' as const, resolvedAt: '2026-01-01T00:00:00.000Z' } }
  const projection = { folders: [{ id: 'folder-1' }], memberships: [], chatReferences: [], settings: { accountScopeId: identity.identity.accountScopeId, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', fieldVersions: {} } }
  return { identity, projection, request: vi.fn(), getProjection: vi.fn(), getSyncStatus: vi.fn() }
})

vi.mock('./client', () => ({ folderBackgroundClient: { request: state.request, getProjection: state.getProjection, getSyncStatus: state.getSyncStatus } }))
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
