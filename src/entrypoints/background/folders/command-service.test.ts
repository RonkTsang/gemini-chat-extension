import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ upsertChatReference: vi.fn(), requestRun: vi.fn() }))
vi.mock('@/data/repositories/folderRepository', () => ({ folderRepository: { upsertChatReference: state.upsertChatReference } }))

import { FolderCommandService } from './command-service'
import { folderRpcParams } from '@/domain/folder/rpc'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'

describe('Folder title command', () => {
  beforeEach(() => vi.clearAllMocks())

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
    if (identitySource === 'observed') {
      expect(state.requestRun).toHaveBeenCalledWith('account-scope-0001', 'outbox-created')
    } else {
      expect(state.requestRun).not.toHaveBeenCalled()
    }
  })

  it('rejects empty and oversized titles at the background RPC boundary', () => {
    const chatId = 'e314bf90da4c7254'
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: ' \n ' }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: 'x'.repeat(501) }).success).toBe(false)
    expect(folderRpcParams.updateChatTitle.safeParse({ chatId: '../bad', title: 'Title' }).success).toBe(false)
  })
})
