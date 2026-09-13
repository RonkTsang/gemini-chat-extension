import { folderRepository, type FolderCreateInput, type FolderSettingsPatch, type FolderUpdateInput } from '@/data/repositories/folderRepository'
import type { FolderRpcEnvelope } from '@/domain/folder/rpc'
import { ROOT_FOLDER_ID } from '@/domain/folder/types'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'

import { FolderQueryService } from './query-service'

export class FolderCommandService {
  constructor(
    private readonly scheduler: FolderSyncScheduler,
    private readonly queries = new FolderQueryService(),
  ) {}

  private schedule(request: FolderRpcEnvelope): void {
    if (request.identitySource === 'observed') this.scheduler.requestRun(request.accountScopeId, 'outbox-created')
  }

  private async assertRevision(accountScopeId: string, expectedRevision?: string): Promise<void> {
    if (expectedRevision && expectedRevision !== await this.queries.revision(accountScopeId)) {
      throw new Error('STALE_REVISION')
    }
  }

  async execute(request: FolderRpcEnvelope): Promise<unknown> {
    const params = request.params as Record<string, unknown>
    let data: unknown
    switch (request.method) {
      case 'createFolder':
        data = await folderRepository.createFolder(request.accountScopeId, params as unknown as FolderCreateInput)
        break
      case 'createFolderAndAddChat': {
        const input = params as { folder: FolderCreateInput; chatId: string; cachedTitle?: string }
        data = await folderRepository.createFolderAndAddChat(request.accountScopeId, input.folder, input.chatId, input.cachedTitle)
        break
      }
      case 'updateFolder': {
        const input = params as { folderId: string; patch: FolderUpdateInput }
        data = await folderRepository.updateFolder(request.accountScopeId, input.folderId, input.patch)
        break
      }
      case 'moveFolder': {
        const input = params as { folderId: string; parentFolderId?: string; beforeId?: string; afterId?: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        data = await folderRepository.moveFolder(request.accountScopeId, input.folderId, input.parentFolderId ?? ROOT_FOLDER_ID, input)
        break
      }
      case 'deleteFolder': {
        const input = params as { folderId: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        await folderRepository.deleteFolder(request.accountScopeId, input.folderId)
        data = undefined
        break
      }
      case 'addMembership':
        data = await folderRepository.upsertMembership(request.accountScopeId, params as never)
        break
      case 'moveMembership': {
        const input = params as { folderId: string; targetFolderId: string; chatId: string; beforeId?: string; afterId?: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        data = await folderRepository.moveMembership(request.accountScopeId, input.folderId, input.chatId, input.targetFolderId, input)
        break
      }
      case 'removeMembership': {
        const input = params as { folderId: string; chatId: string }
        await folderRepository.removeMembership(request.accountScopeId, input.folderId, input.chatId)
        data = undefined
        break
      }
      case 'removeChatAfterGeminiDelete': {
        const input = params as { chatId: string }
        await folderRepository.removeChatAfterGeminiDelete(request.accountScopeId, input.chatId)
        data = undefined
        break
      }
      case 'updateSettings':
        data = await folderRepository.updateSettings(request.accountScopeId, (params as { patch: FolderSettingsPatch }).patch)
        break
      case 'createSnapshot':
        data = await folderRepository.createSnapshot(request.accountScopeId, 'automatic')
        break
      case 'importBackup':
        await folderRepository.importAccountData(request.accountScopeId, (params as { payload: never }).payload)
        data = undefined
        break
      case 'restoreSnapshot': {
        const input = params as { snapshotId: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        await folderRepository.restoreSnapshot(request.accountScopeId, input.snapshotId)
        data = undefined
        break
      }
      case 'retrySync':
        if (request.identitySource !== 'observed') throw new Error('SYNC_DEFERRED')
        this.scheduler.requestRun(request.accountScopeId, 'user-retry')
        return { deferred: true }
      case 'activityHint':
        if (request.identitySource === 'observed') this.scheduler.requestRun(request.accountScopeId, 'content-activity-hint')
        return { accepted: true }
      default:
        throw new Error('INVALID_REQUEST')
    }
    this.schedule(request)
    return data
  }
}
