import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  measure: vi.fn(), record: vi.fn(), status: vi.fn(), invalidation: vi.fn(), execute: vi.fn(),
  localStatus: vi.fn(), revision: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension' } } }))
vi.mock('@/services/folder-recovery/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/folder-recovery/storage')>()), getLocalStorageStatus: state.localStatus,
}))
vi.mock('@/data/repositories/folderRepository', () => ({ folderRepository: { recordBrowserSyncUsage: state.record } }))
vi.mock('@/services/folder-sync/providers/browser-sync', () => ({ measureBrowserSyncUsage: state.measure }))
vi.mock('./invalidation', () => ({ publishFolderInvalidation: state.invalidation }))
vi.mock('./query-service', () => ({ FolderQueryService: class {
  getSyncStatus = state.status
  revision = state.revision
} }))
vi.mock('./command-service', () => ({ FolderCommandService: class { execute = state.execute } }))

import { createFolderRpcHandler } from './rpc-handler'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import type { Browser } from 'wxt/browser'
import type { FolderRpcMethod } from '@/domain/folder/rpc'

const scope = 'account-scope-0001'
const sender: Browser.runtime.MessageSender = {
  id: 'test-extension', url: 'https://gemini.google.com/app',
  tab: {
    id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false,
    incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1, frozen: false,
  },
}
const scheduler = { requestRun: vi.fn() } as unknown as FolderSyncScheduler
function request(method: FolderRpcMethod, params: unknown = {}) {
  return { namespace: 'folders', protocolVersion: 1, requestId: 'request-1', accountScopeId: scope, identitySource: 'observed', method, params }
}

describe('Folders usage RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.execute.mockReset()
    state.revision.mockReset().mockResolvedValue('local-revision')
    state.measure.mockResolvedValue({ folderBytes: 10, folderBudgetBytes: 70 * 1024, totalBytes: 20, quotaBytes: 100 * 1024, usagePercent: 0.01 })
    state.record.mockResolvedValue(undefined)
    state.status.mockResolvedValue({ currentUsageBytes: 10, showCapacityNotice: false })
    state.invalidation.mockResolvedValue(undefined)
    state.localStatus.mockReset().mockResolvedValue({ low: true, snapshotBytes: 100, unlimited: false })
  })

  it.each([
    ['createFolder', { name: 'Saved folder' }],
    ['createSnapshot', {}],
  ] as const)('does not report a completed %s as a failed save when its response revision read fails', async (method, params) => {
    state.execute.mockResolvedValueOnce({ id: 'saved-result' })
    state.revision.mockRejectedValueOnce(new Error('Revision read failed'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request(method, params), sender)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', retryable: false, currentRevision: 'local-revision' },
    })
    expect(state.execute).toHaveBeenCalledTimes(1)
  })

  it('still returns a response when both revision reads fail after a completed write', async () => {
    state.execute.mockResolvedValueOnce({ id: 'saved-folder' })
    state.revision.mockRejectedValue(new Error('Database read failed'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('createFolder', { name: 'Saved folder' }), sender)).resolves.toMatchObject({
      ok: false, error: { code: 'INTERNAL_ERROR', retryable: false, currentRevision: undefined },
    })
    expect(state.execute).toHaveBeenCalledTimes(1)
    expect(state.revision).toHaveBeenCalledTimes(2)
  })

  it('does not classify a post-commit revision quota error as a protection or save failure', async () => {
    state.execute.mockResolvedValueOnce({ id: 'saved-folder' })
    state.revision.mockRejectedValueOnce(new DOMException('Quota reached', 'QuotaExceededError'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('createFolder', { name: 'Saved folder' }), sender)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Folders could not complete that request.', retryable: false },
    })
  })

  it.each([
    ['createFolder', { name: 'Unsaved folder' }, 'FOLDER_SAVE_FAILED'],
    ['createSnapshot', {}, 'MANUAL_SNAPSHOT_FAILED'],
  ] as const)('preserves the save failure for %s even when the error revision is unreadable', async (method, params, code) => {
    state.execute.mockRejectedValueOnce(new DOMException('Quota reached', 'QuotaExceededError'))
    state.revision.mockRejectedValue(new Error('Database read failed'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request(method, params), sender)).resolves.toMatchObject({
      ok: false, error: { code, retryable: true, currentRevision: undefined },
    })
    expect(state.execute).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed read-only request retryable when its error revision is unreadable', async () => {
    state.localStatus.mockRejectedValueOnce(new Error('Status read failed'))
    state.revision.mockRejectedValue(new Error('Database read failed'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('getLocalStorageStatus'), sender)).resolves.toMatchObject({
      ok: false, error: { code: 'INTERNAL_ERROR', retryable: true, currentRevision: undefined },
    })
    expect(state.execute).not.toHaveBeenCalled()
  })

  it('reads local storage status in the background', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('getLocalStorageStatus'), sender)).resolves.toMatchObject({ ok: true, data: { low: true } })
    expect(state.localStatus).toHaveBeenCalledWith(scope)
    expect(state.measure).not.toHaveBeenCalled()
    expect(state.execute).not.toHaveBeenCalled()
  })

  it('keeps ordinary status queries free of storage measurements and writes', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('getSyncStatus'), sender)).resolves.toMatchObject({ ok: true, data: { currentUsageBytes: 10 } })
    expect(state.measure).not.toHaveBeenCalled()
    expect(state.record).not.toHaveBeenCalled()
    expect(state.invalidation).not.toHaveBeenCalled()
    expect(state.execute).not.toHaveBeenCalled()
  })

  it('measures and persists once on explicit request, returning status and invalidating status only', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('measureBrowserSyncUsage'), sender)).resolves.toMatchObject({ ok: true, data: { currentUsageBytes: 10 } })
    expect(state.measure).toHaveBeenCalledTimes(1)
    expect(state.record).toHaveBeenCalledWith(scope, await state.measure.mock.results[0].value)
    expect(state.invalidation).toHaveBeenCalledWith(
      { accountScopeId: scope, dataRevision: 'local-revision', type: 'folders:data-changed', affected: { syncStatus: true } },
      { excludeTabId: 1 },
    )
    expect(state.execute).not.toHaveBeenCalled()
    expect(scheduler.requestRun).not.toHaveBeenCalled()
  })

  it('broadcasts a title write to other Folder views', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('updateChatTitle', { chatId: 'e314bf90da4c7254', title: 'New title' }), sender))
      .resolves.toMatchObject({ ok: true })
    expect(state.execute).toHaveBeenCalledTimes(1)
    expect(state.invalidation).toHaveBeenCalledWith(
      { accountScopeId: scope, dataRevision: 'local-revision', type: 'folders:data-changed', affected: {} },
      { excludeTabId: 1 },
    )
  })

  it('broadcasts committed pin changes to other Folder views', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('setMembershipPinned', { folderId: 'folder-1', chatId: 'chat-1', pinned: true }), sender)).resolves.toMatchObject({ ok: true })
    expect(state.execute).toHaveBeenCalledTimes(1)
    expect(state.invalidation).toHaveBeenCalledWith(
      { accountScopeId: scope, dataRevision: 'local-revision', type: 'folders:data-changed', affected: {} },
      { excludeTabId: 1 },
    )
  })
})
