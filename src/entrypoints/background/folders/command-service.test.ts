import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ upsertChatReference: vi.fn(), setMembershipPinned: vi.fn(), requestRun: vi.fn(), retry: vi.fn(async () => ({ outcome: 'accepted-by-browser-storage' })), recoveryRun: vi.fn(), revision: vi.fn(async () => 'local-revision') }))
vi.mock('@/data/repositories/folderRepository', () => ({ folderRepository: { upsertChatReference: state.upsertChatReference, setMembershipPinned: state.setMembershipPinned } }))

import { FolderCommandService } from './command-service'
import { folderRpcParams } from '@/domain/folder/rpc'
import type { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import type { FolderQueryService } from './query-service'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'

describe('Folder title command', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['observed', 'manual-confirmed'] as const)('persists a folder pin and schedules sync for either identity source (%s)', async (identitySource) => {
    const membership = { folderId: 'folder-1', chatId: 'chat-1', pinnedOrderKey: 'key' }
    state.setMembershipPinned.mockResolvedValue({ data: membership, commit: { accountScopeId: 'account-scope-0001', dataRevision: 'local-revision', effect: 'organization' } })
    const service = new FolderCommandService({ requestRun: state.requestRun, retry: state.retry } as unknown as FolderSyncScheduler, { revision: state.revision } as unknown as FolderQueryService, { requestRun: state.recoveryRun } as unknown as FolderRecoveryRunner)
    await expect(service.execute({ namespace: 'folders', protocolVersion: 1, requestId: 'pin-1', accountScopeId: 'account-scope-0001', identitySource, method: 'setMembershipPinned', params: { folderId: 'folder-1', chatId: 'chat-1', pinned: true } })).resolves.toMatchObject({ data: membership })
    expect(state.setMembershipPinned).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'folder-1', 'chat-1', true)
    expect(state.requestRun.mock.calls).toEqual([['account-scope-0001', 'local-changes-committed']])
    expect(folderRpcParams.setMembershipPinned.safeParse({ folderId: 'folder-1', chatId: 'chat-1', pinned: 'true' }).success).toBe(false)
  })

  it.each(['observed', 'manual-confirmed'] as const)('persists a shared title in the requested account (%s)', async (identitySource) => {
    const reference = { chatId: 'e314bf90da4c7254', cachedTitle: 'New title' }
    state.upsertChatReference.mockResolvedValue({ data: reference, commit: { accountScopeId: 'account-scope-0001', dataRevision: 'local-revision', effect: 'organization' } })
    const service = new FolderCommandService({ requestRun: state.requestRun, retry: state.retry } as unknown as FolderSyncScheduler, { revision: state.revision } as unknown as FolderQueryService, { requestRun: state.recoveryRun } as unknown as FolderRecoveryRunner)
    await expect(service.execute({
      namespace: 'folders', protocolVersion: 1, requestId: 'rename-1',
      accountScopeId: 'account-scope-0001', identitySource, method: 'updateChatTitle',
      params: { chatId: reference.chatId, title: reference.cachedTitle },
    })).resolves.toMatchObject({ data: reference })
    expect(state.upsertChatReference).toHaveBeenCalledExactlyOnceWith('account-scope-0001', reference.chatId, reference.cachedTitle, undefined, undefined)
    expect(state.requestRun).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'local-changes-committed')
  })

  it.each(['observed', 'manual-confirmed'] as const)('schedules startup and retry for the requested account (%s)', async (identitySource) => {
    const service = new FolderCommandService({ requestRun: state.requestRun, retry: state.retry } as unknown as FolderSyncScheduler, { revision: state.revision } as unknown as FolderQueryService, { requestRun: state.recoveryRun } as unknown as FolderRecoveryRunner)
    const request = { namespace: 'folders' as const, protocolVersion: 1 as const, requestId: 'sync-1', accountScopeId: 'account-scope-0002', identitySource, params: {} }
    await expect(service.execute({ ...request, method: 'activityHint' })).resolves.toMatchObject({ data: { accepted: true } })
    await expect(service.execute({ ...request, method: 'retrySync' })).resolves.toMatchObject({ data: { outcome: 'accepted-by-browser-storage' } })
    expect(state.requestRun.mock.calls).toEqual([
      ['account-scope-0002', 'content-activity-hint'],
    ])
    expect(state.retry).toHaveBeenCalledWith('account-scope-0002')
  })

  it('rejects empty and oversized titles at the background RPC boundary', () => {
    const chatId = 'e314bf90da4c7254'
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: ' \n ' }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: 'x'.repeat(501) }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId: '../bad', title: 'Title' }).success).toBe(false)
  })

  it('validates and forwards explicit missing-replica recreation guards without changing ordinary retry', async () => {
    const service = new FolderCommandService({ retry: state.retry } as unknown as FolderSyncScheduler,
      { revision: state.revision } as unknown as FolderQueryService)
    const params = { expectedRevision: 'reviewed-revision', baseSnapshotId: 'missing-base' }
    expect(folderRpcParams.recreateSyncReplica.safeParse({}).success).toBe(false)
    expect(folderRpcParams.recreateSyncReplica.safeParse({ ...params, force: true }).success).toBe(false)
    await service.execute({ namespace: 'folders', protocolVersion: 1, requestId: 'recreate', accountScopeId: 'account-scope-0001',
      identitySource: 'observed', method: 'recreateSyncReplica', params })
    expect(state.retry).toHaveBeenCalledWith('account-scope-0001', params)
  })
})

it('keeps the committed result and wakes Recovery when the SYNC wake call fails', async () => {
  state.requestRun.mockImplementationOnce(() => { throw new Error('Scheduler unavailable') })
  state.upsertChatReference.mockResolvedValue({ data: { chatId: 'chat-1' }, commit: { accountScopeId: 'account-scope-0001', dataRevision: 'committed', effect: 'organization' } })
  const service = new FolderCommandService({ requestRun: state.requestRun, retry: state.retry } as unknown as FolderSyncScheduler,
    { revision: state.revision } as unknown as FolderQueryService, { requestRun: state.recoveryRun } as unknown as FolderRecoveryRunner)
  await expect(service.execute({ namespace: 'folders', protocolVersion: 1, requestId: 'title-1', accountScopeId: 'account-scope-0001', identitySource: 'observed', method: 'updateChatTitle', params: { chatId: 'chat-1', title: 'Title' } }))
    .resolves.toMatchObject({ data: { chatId: 'chat-1' }, commit: { dataRevision: 'committed' } })
  expect(state.recoveryRun).toHaveBeenCalledWith('account-scope-0001')
})
