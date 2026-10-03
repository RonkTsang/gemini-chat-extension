import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  measure: vi.fn(), record: vi.fn(), status: vi.fn(), invalidation: vi.fn(), execute: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension' } } }))
vi.mock('@/data/repositories/folderRepository', () => ({ folderRepository: { recordBrowserSyncUsage: state.record } }))
vi.mock('@/services/folder-sync/providers/browser-sync', () => ({ measureBrowserSyncUsage: state.measure }))
vi.mock('./invalidation', () => ({ publishFolderInvalidation: state.invalidation }))
vi.mock('./query-service', () => ({ FolderQueryService: class {
  getSyncStatus = state.status
  revision = async () => 'local-revision'
} }))
vi.mock('./command-service', () => ({ FolderCommandService: class { execute = state.execute } }))

import { createFolderRpcHandler } from './rpc-handler'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import type { Browser } from 'wxt/browser'

const scope = 'account-scope-0001'
const sender: Browser.runtime.MessageSender = {
  id: 'test-extension', url: 'https://gemini.google.com/app',
  tab: {
    id: 1, index: 0, windowId: 1, highlighted: false, active: true, pinned: false,
    incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1, frozen: false,
  },
}
const scheduler = { requestRun: vi.fn() } as unknown as FolderSyncScheduler
function request(method: 'getSyncStatus' | 'measureBrowserSyncUsage' | 'updateChatTitle', params: unknown = {}) {
  return { namespace: 'folders', protocolVersion: 1, requestId: 'request-1', accountScopeId: scope, identitySource: 'observed', method, params }
}

describe('Folders usage RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.measure.mockResolvedValue({ folderBytes: 10, folderBudgetBytes: 70 * 1024, totalBytes: 20, quotaBytes: 100 * 1024, usagePercent: 0.01 })
    state.record.mockResolvedValue(undefined)
    state.status.mockResolvedValue({ currentUsageBytes: 10, showCapacityNotice: false })
    state.invalidation.mockResolvedValue(undefined)
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
})
