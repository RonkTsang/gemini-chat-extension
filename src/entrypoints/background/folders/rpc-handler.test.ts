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
    state.execute.mockReset().mockImplementation(async (request) => ({ data: undefined, commit: {
      accountScopeId: scope, baseRevision: 'previous-revision', dataRevision: 'local-revision', effect: 'organization',
      affected: request.method === 'updateChatTitle' ? { chatIds: [request.params.chatId] }
        : request.method === 'setMembershipPinned' ? { folderIds: [request.params.folderId] } : { all: true },
    } }))
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
  ] as const)('returns the committed %s even when later revision reads fail', async (method, params) => {
    state.execute.mockResolvedValueOnce({ data: { id: 'saved-result' }, commit: { accountScopeId: scope, dataRevision: 'committed-revision' } })
    state.revision.mockRejectedValue(new Error('Revision read failed'))
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request(method, params), sender)).resolves.toMatchObject({
      ok: true, dataRevision: 'committed-revision', data: { id: 'saved-result' },
    })
    expect(state.execute).toHaveBeenCalledTimes(1)
    expect(state.revision).not.toHaveBeenCalled()
  })

  it('broadcasts changed chat order to other tabs but leaves unchanged order quiet', async () => {
    const handler = createFolderRpcHandler(scheduler)
    const commit = { accountScopeId: scope, baseRevision: 'previous-revision', dataRevision: 'local-revision',
      effect: 'organization', affected: { folderIds: ['folder-1'] } }
    state.execute.mockResolvedValueOnce({ data: ['folder-1'], commit })
    await expect(handler(request('promoteChat', { chatId: 'abc123' }), sender)).resolves.toMatchObject({
      ok: true, change: { affected: commit.affected },
    })
    expect(state.invalidation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ affected: commit.affected }), { excludeTabId: 1 })
    state.execute.mockResolvedValueOnce({ data: [], commit: { ...commit, effect: undefined, affected: { folderIds: [] } } })
    await handler(request('promoteChat', { chatId: 'abc123' }), sender)
    expect(state.invalidation).toHaveBeenCalledTimes(1)
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

  it('preserves production request IDs and error feedback without diagnostic success logs', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubEnv('DEV', false)
    try {
      const handler = createFolderRpcHandler(scheduler)
      await expect(handler(request('getSyncStatus'), sender)).resolves.toMatchObject({ ok: true, requestId: 'request-1' })
      state.status.mockRejectedValueOnce(new Error('Status read failed'))
      await expect(handler({ ...request('getSyncStatus'), requestId: 'request-2' }, sender)).resolves.toMatchObject({
        ok: false, requestId: 'request-2', error: { code: 'INTERNAL_ERROR', retryable: true },
      })
      expect(error).toHaveBeenCalledWith('[Folders][rpc] request failed', expect.objectContaining({ requestId: 'request-2', code: 'INTERNAL_ERROR' }))
      expect(info).not.toHaveBeenCalled()
      expect(state.measure).not.toHaveBeenCalled()
      expect(state.record).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs(); info.mockRestore(); error.mockRestore() }
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
      { accountScopeId: scope, baseRevision: 'previous-revision', requestId: 'request-1', dataRevision: 'local-revision', type: 'folders:data-changed', affected: { chatIds: ['e314bf90da4c7254'] } },
      { excludeTabId: 1 },
    )
  })

  it('broadcasts committed pin changes to other Folder views', async () => {
    const handler = createFolderRpcHandler(scheduler)
    await expect(handler(request('setMembershipPinned', { folderId: 'folder-1', chatId: 'chat-1', pinned: true }), sender)).resolves.toMatchObject({ ok: true })
    expect(state.execute).toHaveBeenCalledTimes(1)
    expect(state.invalidation).toHaveBeenCalledWith(
      { accountScopeId: scope, baseRevision: 'previous-revision', requestId: 'request-1', dataRevision: 'local-revision', type: 'folders:data-changed', affected: { folderIds: ['folder-1'] } },
      { excludeTabId: 1 },
    )
  })
})
