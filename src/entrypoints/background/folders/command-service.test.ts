import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ upsertChatReference: vi.fn(), setMembershipPinned: vi.fn(), requestRun: vi.fn() }))
vi.mock('@/data/repositories/folderRepository', () => ({ folderRepository: { upsertChatReference: state.upsertChatReference, setMembershipPinned: state.setMembershipPinned } }))

import { FolderCommandService } from './command-service'
import { folderRpcParams } from '@/domain/folder/rpc'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'

describe('Folder title command', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['observed', 'manual-confirmed'] as const)('persists a folder pin and schedules sync for either identity source (%s)', async (identitySource) => {
    const membership = { folderId: 'folder-1', chatId: 'chat-1', pinnedOrderKey: 'key' }
    state.setMembershipPinned.mockResolvedValue(membership)
    const service = new FolderCommandService({ requestRun: state.requestRun } as unknown as FolderSyncScheduler)
    await expect(service.execute({ namespace: 'folders', protocolVersion: 1, requestId: 'pin-1', accountScopeId: 'account-scope-0001', identitySource, method: 'setMembershipPinned', params: { folderId: 'folder-1', chatId: 'chat-1', pinned: true } })).resolves.toEqual(membership)
    expect(state.setMembershipPinned).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'folder-1', 'chat-1', true)
    expect(state.requestRun.mock.calls).toEqual([['account-scope-0001', 'outbox-created']])
    expect(folderRpcParams.setMembershipPinned.safeParse({ folderId: 'folder-1', chatId: 'chat-1', pinned: 'true' }).success).toBe(false)
  })

  it.each(['observed', 'manual-confirmed'] as const)('persists a shared title in the requested account (%s)', async (identitySource) => {
    const reference = { chatId: 'e314bf90da4c7254', cachedTitle: 'New title' }
    state.upsertChatReference.mockResolvedValue(reference)
    const service = new FolderCommandService({ requestRun: state.requestRun } as unknown as FolderSyncScheduler)
    await expect(service.execute({
      namespace: 'folders', protocolVersion: 1, requestId: 'rename-1',
      accountScopeId: 'account-scope-0001', identitySource, method: 'updateChatTitle',
      params: { chatId: reference.chatId, title: reference.cachedTitle },
    })).resolves.toEqual(reference)
    expect(state.upsertChatReference).toHaveBeenCalledExactlyOnceWith('account-scope-0001', reference.chatId, reference.cachedTitle)
    expect(state.requestRun).toHaveBeenCalledExactlyOnceWith('account-scope-0001', 'outbox-created')
  })

  it.each(['observed', 'manual-confirmed'] as const)('schedules startup and retry for the requested account (%s)', async (identitySource) => {
    const service = new FolderCommandService({ requestRun: state.requestRun } as unknown as FolderSyncScheduler)
    const request = { namespace: 'folders' as const, protocolVersion: 1 as const, requestId: 'sync-1', accountScopeId: 'account-scope-0002', identitySource, params: {} }
    await expect(service.execute({ ...request, method: 'activityHint' })).resolves.toEqual({ accepted: true })
    await expect(service.execute({ ...request, method: 'retrySync' })).resolves.toEqual({ deferred: true })
    expect(state.requestRun.mock.calls).toEqual([
      ['account-scope-0002', 'content-activity-hint'],
      ['account-scope-0002', 'user-retry'],
    ])
  })

  it('rejects empty and oversized titles at the background RPC boundary', () => {
    const chatId = 'e314bf90da4c7254'
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: ' \n ' }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: 'x'.repeat(501) }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId: '../bad', title: 'Title' }).success).toBe(false)
  })
})
