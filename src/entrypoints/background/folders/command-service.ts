import { folderRepository, type FolderCreateInput, type FolderSettingsPatch, type FolderUpdateInput } from '@/data/repositories/folderRepository'
import type { FolderRpcEnvelope } from '@/domain/folder/rpc'
import { ROOT_FOLDER_ID, type BrowserSyncRecreationRequest, type FolderMutationResult } from '@/domain/folder/types'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { FolderRecoveryError } from '@/services/folder-recovery/storage'

import { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import { dispatchFolderAfterCommit } from '@/services/folder-tasks/after-commit'

import { FolderQueryService } from './query-service'
import type { FolderAffected } from '@/domain/folder/changes'
import { toSnapshotSummary } from '@/domain/folder/snapshot'

function commandAffected(request: FolderRpcEnvelope): FolderAffected {
  const input = request.params as { folderId: string; targetFolderId: string; chatId: string }
  switch (request.method) {
    case 'updateFolder': return { folderMetadataIds: [input.folderId] }
    case 'createFolder': case 'createFolderAndAddChat': case 'moveFolder':
      return { folders: true, ...(request.method === 'createFolderAndAddChat' ? { chatIds: [input.chatId] } : {}) }
    case 'deleteFolder': return { folders: true, settings: true }
    case 'addMembership': return { folderIds: [input.folderId], chatIds: [input.chatId] }
    case 'moveMembership': return { folderIds: [...new Set([input.folderId, input.targetFolderId])] }
    case 'setMembershipPinned': case 'removeMembership': return { folderIds: [input.folderId] }
    case 'updateChatTitle': return { chatIds: [input.chatId] }
    case 'updateSettings': return { settings: true }
    default: return { all: true }
  }
}

export class FolderCommandService {
  constructor(
    private readonly scheduler: FolderSyncScheduler,
    private readonly queries = new FolderQueryService(),
    private readonly recovery = new FolderRecoveryRunner(),
  ) {}

  private async assertRevision(accountScopeId: string, expectedRevision?: string): Promise<void> {
    if (expectedRevision && expectedRevision !== await this.queries.revision(accountScopeId)) {
      throw new Error('STALE_REVISION')
    }
  }

  async execute(request: FolderRpcEnvelope): Promise<FolderMutationResult<unknown>> {
    const repository = folderRepository
    const params = request.params as Record<string, unknown>
    let result: FolderMutationResult<unknown>
    switch (request.method) {
      case 'createFolder':
        result = await repository.createFolder(request.accountScopeId, params as unknown as FolderCreateInput)
        break
      case 'createFolderAndAddChat': {
        const input = params as { folder: FolderCreateInput; chatId: string; cachedTitle?: string }
        result = await repository.createFolderAndAddChat(request.accountScopeId, input.folder, input.chatId, input.cachedTitle)
        break
      }
      case 'updateFolder': {
        const input = params as { folderId: string; patch: FolderUpdateInput }
        result = await repository.updateFolder(request.accountScopeId, input.folderId, input.patch)
        break
      }
      case 'moveFolder': {
        const input = params as { folderId: string; parentFolderId?: string; beforeId?: string; afterId?: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        result = await repository.moveFolder(request.accountScopeId, input.folderId, input.parentFolderId ?? ROOT_FOLDER_ID, input)
        break
      }
      case 'deleteFolder': {
        const input = params as { folderId: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        result = await repository.deleteFolder(request.accountScopeId, input.folderId)
        break
      }
      case 'addMembership':
        result = await repository.upsertMembership(request.accountScopeId, params as never)
        break
      case 'moveMembership': {
        const input = params as { folderId: string; targetFolderId: string; chatId: string; beforeId?: string; afterId?: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        result = await repository.moveMembership(request.accountScopeId, input.folderId, input.chatId, input.targetFolderId, input)
        break
      }
      case 'promoteChat':
        result = await repository.promoteChat(request.accountScopeId, (params as { chatId: string }).chatId)
        break
      case 'setMembershipPinned': {
        const input = params as { folderId: string; chatId: string; pinned: boolean }
        result = await repository.setMembershipPinned(request.accountScopeId, input.folderId, input.chatId, input.pinned)
        break
      }
      case 'removeMembership': {
        const input = params as { folderId: string; chatId: string }
        result = await repository.removeMembership(request.accountScopeId, input.folderId, input.chatId)
        break
      }
      case 'removeChatAfterGeminiDelete': {
        const input = params as { chatId: string; protectionSnapshotId?: string }
        result = await repository.removeChatAfterGeminiDelete(request.accountScopeId, input.chatId, input.protectionSnapshotId)
        break
      }
      case 'updateChatTitle': {
        const input = params as { chatId: string; title: string; expectedTitle?: string; expectedRevision?: string }
        result = await repository.upsertChatReference(request.accountScopeId, input.chatId, input.title, input.expectedTitle, input.expectedRevision)
        break
      }
      case 'updateSettings':
        result = await repository.updateSettings(request.accountScopeId, (params as { patch: FolderSettingsPatch }).patch)
        break
      case 'createSnapshot': {
        const captured = await repository.getAccountDataWithRevision(request.accountScopeId)
        const data = await repository.createSnapshot(request.accountScopeId, 'manual', false, captured)
        return { data: toSnapshotSummary(data), commit: { accountScopeId: request.accountScopeId, dataRevision: captured.dataRevision } }
      }
      case 'prepareChatDeletion':
        try {
          const captured = await repository.getAccountDataWithRevision(request.accountScopeId)
          const data = await repository.createSnapshot(request.accountScopeId, 'before-delete', true, captured)
          if (!data.protectionToken) throw new Error('Snapshot protection token is unavailable')
          return { data: { id: data.id, protectionToken: data.protectionToken }, commit: { accountScopeId: request.accountScopeId, dataRevision: captured.dataRevision } }
        } catch (error) {
          throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error })
        }
      case 'releaseSnapshot':
        await repository.releaseSnapshot(request.accountScopeId, (params as { snapshotId: string }).snapshotId, (params as { protectionToken: string }).protectionToken)
        return this.readResult(request, undefined)
      case 'importBackup':
        result = await repository.importAccountData(request.accountScopeId, (params as { payload: never }).payload)
        break
      case 'restoreSnapshot': {
        const input = params as { snapshotId: string; expectedRevision?: string }
        await this.assertRevision(request.accountScopeId, input.expectedRevision)
        result = await repository.restoreSnapshot(request.accountScopeId, input.snapshotId)
        break
      }
      case 'retrySync':
        return this.readResult(request, await this.scheduler.retry(request.accountScopeId))
      case 'recreateSyncReplica':
        return this.readResult(request, await this.scheduler.retry(request.accountScopeId, params as unknown as BrowserSyncRecreationRequest))
      case 'resolveSyncConflict': {
        const input = params as { choice: 'remote' | 'local'; expectedRevision: string; snapshotId: string }
        return this.readResult(request, await this.scheduler.resolveConflict(request.accountScopeId, input.choice, input.expectedRevision, input.snapshotId))
      }
      case 'activityHint':
        this.scheduler.requestRun(request.accountScopeId, 'content-activity-hint')
        return this.readResult(request, { accepted: true })
      default:
        throw new Error('INVALID_REQUEST')
    }
    dispatchFolderAfterCommit(result.commit, this.scheduler, this.recovery)
    return { ...result, commit: { ...result.commit, affected: result.commit.affected ?? commandAffected(request) } }
  }

  private async readResult(request: FolderRpcEnvelope, data: unknown): Promise<FolderMutationResult<unknown>> {
    return { data, commit: { accountScopeId: request.accountScopeId, dataRevision: await this.queries.revision(request.accountScopeId) } }
  }
}
