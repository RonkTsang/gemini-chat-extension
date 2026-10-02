import { nanoid } from 'nanoid'

import type { FolderRepository } from '@/data/repositories/folderRepository'
import { folderRepository } from '@/data/repositories/folderRepository'
import { publishFolderInvalidation } from '@/entrypoints/background/folders/invalidation'
import { logDevError, logDevEvent } from '@/utils/devLogger'
import { stableStringify, toFolderSyncData } from './codec'
import { mergeFolderAccountData } from './merge'
import {
  BrowserSyncFolderProvider,
  BrowserSyncQuotaError,
  type BrowserSyncPublishResult,
  type BrowserSyncReadResult,
} from './providers/browser-sync'

const LOG_LABEL = '[Folders][sync]'

export interface FolderSyncTransport {
  read(accountScopeId: string): Promise<BrowserSyncReadResult>
  publish(generation: Awaited<ReturnType<FolderRepository['getOrCreateBrowserSyncGeneration']>>, settings: Awaited<ReturnType<FolderRepository['getSettings']>>, replacedGenerationId?: string): Promise<BrowserSyncPublishResult>
  publishSettings(accountScopeId: string, settings: Awaited<ReturnType<FolderRepository['getSettings']>>): Promise<BrowserSyncPublishResult | undefined>
  cleanupLocalOrphans?(accountScopeId: string, generationIds: string[]): Promise<void>
}

export interface FolderSyncRunResult {
  retryAt?: string
}

/**
 * A short-lived, inbound-first background job. Local persistence is always
 * authoritative for recovery; Browser Sync is applied only after full validation.
 */
export class FolderSyncCoordinator {
  private readonly ownerId = `folder-sync-${nanoid()}`

  constructor(
    private readonly repository: FolderRepository = folderRepository,
    private readonly transport: FolderSyncTransport = new BrowserSyncFolderProvider(),
  ) {}

  private async publishInvalidation(accountScopeId: string, dataChanged = false): Promise<void> {
    const state = await this.repository.getSyncState(accountScopeId)
    await publishFolderInvalidation({
      type: 'folders:data-changed',
      accountScopeId,
      dataRevision: state?.localDataRevision ?? 'uninitialized',
      affected: dataChanged ? { syncStatus: true, settings: true } : { syncStatus: true },
    })
  }

  private async publishPreparedGeneration(
    accountScopeId: string,
    generation: Awaited<ReturnType<FolderRepository['getOrCreateBrowserSyncGeneration']>>,
    syncRunId: string,
    replacedGenerationId?: string,
  ): Promise<void> {
    // Persist the exact active generation this write is about to replace before
    // deleting its chunks. If set() fails, an incomplete manifest for that A
    // can be proven to be this local B's interrupted publication and resumed.
    await this.repository.markBrowserSyncGenerationWriting(accountScopeId, generation.id, replacedGenerationId)
    const result = await this.transport.publish(generation, await this.repository.getSettings(accountScopeId), replacedGenerationId)
    const settingsChanged = await this.repository.applyBrowserSyncSettings(accountScopeId, result.settings, result.settingsVersion)
    await this.repository.markBrowserSyncGenerationAccepted(accountScopeId, generation.id, {
      folderBytes: result.projectedFolderBytes,
      folderBudgetBytes: result.folderBudgetBytes,
      totalBytes: result.projectedTotalBytes,
      quotaBytes: result.quotaBytes,
      usagePercent: result.usagePercent,
    })
    await this.collectLocalOrphans(accountScopeId, syncRunId)
    await this.publishInvalidation(accountScopeId, settingsChanged)
    logDevEvent('info', LOG_LABEL, 'browser-sync.coordinator.completed', {
      accountScopeId, syncRunId, generationId: generation.id, dataRevision: generation.dataRevision,
    })
  }

  private async collectLocalOrphans(accountScopeId: string, syncRunId: string): Promise<void> {
    const generationIds = await this.repository.listReclaimableBrowserSyncGenerationIds(accountScopeId)
    if (!generationIds.length) return
    await this.transport.cleanupLocalOrphans?.(accountScopeId, generationIds)
    logDevEvent('debug', LOG_LABEL, 'browser-sync.gc.completed', {
      accountScopeId,
      syncRunId,
      candidateGenerations: generationIds.length,
    })
  }

  async sync(accountScopeId: string, traceId?: string): Promise<FolderSyncRunResult> {
    const syncRunId = nanoid()
    logDevEvent('debug', LOG_LABEL, 'browser-sync.coordinator.started', { accountScopeId, syncRunId, traceId })
    try {
      await this.repository.acquireCoordinatorLease(accountScopeId, this.ownerId)
    } catch (error) {
      if (error instanceof Error && error.message.includes('lease is held')) {
        logDevEvent('debug', LOG_LABEL, 'browser-sync.coordinator.lease-busy', { accountScopeId, syncRunId, traceId })
        return {}
      }
      throw error
    }

    try {
      if ((await this.repository.getSyncState(accountScopeId))?.provider === 'google-drive') return {}
      const remote = await this.transport.read(accountScopeId)
      logDevEvent('debug', LOG_LABEL, `browser-sync.read.${remote.status}`, {
        accountScopeId,
        syncRunId,
        ...(remote.status === 'complete' ? { generationId: remote.manifest.generationId, dataRevision: remote.manifest.dataRevision } : {}),
        ...(remote.status === 'incomplete' ? { generationId: remote.manifest.generationId, missingChunkIndexes: remote.missingChunkIndexes } : {}),
        ...(remote.status === 'invalid' ? { outcome: remote.code } : {}),
      })
      // Switches are independent of chunk arrival and data validation.
      const manifest = remote.status === 'absent' ? undefined : remote.manifest
      if (manifest) {
        const changed = await this.repository.applyBrowserSyncSettings(accountScopeId, manifest.settings, manifest.settingsVersion)
        if (changed) await this.publishInvalidation(accountScopeId, true)
        const settings = await this.repository.getSettings(accountScopeId)
        if (settings.settingsPending) {
          const result = await this.transport.publishSettings(accountScopeId, settings)
          if (result) {
            const settingsChanged = await this.repository.applyBrowserSyncSettings(accountScopeId, result.settings, result.settingsVersion)
            await this.repository.markBrowserSyncSettingsAccepted(accountScopeId, {
              folderBytes: result.projectedFolderBytes, folderBudgetBytes: result.folderBudgetBytes,
              totalBytes: result.projectedTotalBytes, quotaBytes: result.quotaBytes, usagePercent: result.usagePercent,
            })
            await this.publishInvalidation(accountScopeId, settingsChanged)
          }
        }
      }
      // Local orphan collection does not inspect or remove an active replica,
      // so it remains safe while an incoming replica is incomplete or invalid.
      // Do it before every early return as well as before publish preflight.
      await this.collectLocalOrphans(accountScopeId, syncRunId)
      if (remote.status === 'incomplete') {
        const interruptedGeneration = await this.repository.getRecoverableBrowserSyncGeneration(
          accountScopeId,
          remote.manifest.generationId,
        )
        if (interruptedGeneration) {
          logDevEvent('info', LOG_LABEL, 'browser-sync.publish.resume-interrupted-write', {
            accountScopeId,
            syncRunId,
            generationId: interruptedGeneration.id,
            replacedGenerationId: remote.manifest.generationId,
          })
          await this.publishPreparedGeneration(
            accountScopeId,
            interruptedGeneration,
            syncRunId,
            remote.manifest.generationId,
          )
          return {}
        }
        const retryAt = await this.repository.recordBrowserSyncFailure(accountScopeId, 'incomplete-replica', 'incomplete-replica')
        await this.publishInvalidation(accountScopeId)
        return { retryAt }
      }
      if (remote.status === 'invalid') {
        const retryAt = await this.repository.recordBrowserSyncFailure(accountScopeId, remote.code, 'invalid-replica')
        await this.publishInvalidation(accountScopeId)
        return { retryAt }
      }

      let pending = await this.repository.hasPendingOperations(accountScopeId)
      const state = await this.repository.getSyncState(accountScopeId)
      if (remote.status === 'complete') {
        const syncStatusChanged = await this.repository.recordBrowserSyncReplicaObserved(
          accountScopeId,
          remote.manifest.generationId,
        )
        const isSelfAuthoredAlreadyApplied = state?.lastWrittenReplicaGenerationId === remote.manifest.generationId
        const requiresMerge = !isSelfAuthoredAlreadyApplied && state?.lastAppliedReplicaRevision !== remote.manifest.dataRevision
        if (requiresMerge) {
          const remotePayload = remote.data
          const localPayload = await this.repository.getAccountData(accountScopeId)
          const merged = mergeFolderAccountData(localPayload, remotePayload)
          const needsPublish = pending || stableStringify(toFolderSyncData(merged)) !== stableStringify(toFolderSyncData(remotePayload))
          await this.repository.applyBrowserSyncPayload(
            accountScopeId,
            merged,
            remote.manifest.dataRevision,
            remote.manifest.authorityEpoch,
            needsPublish,
          )
          await this.publishInvalidation(accountScopeId, true)
          logDevEvent('info', LOG_LABEL, 'browser-sync.merge.completed', {
            accountScopeId, syncRunId, dataRevision: remote.manifest.dataRevision,
          })
        } else if (syncStatusChanged) {
          await this.publishInvalidation(accountScopeId)
        }
      }

      pending = await this.repository.hasPendingOperations(accountScopeId)
      if (!pending && !(await this.repository.getSettings(accountScopeId)).settingsPending) return {}

      const generation = await this.repository.getOrCreateBrowserSyncGeneration(accountScopeId)
      await this.publishPreparedGeneration(
        accountScopeId,
        generation,
        syncRunId,
        remote.status === 'complete' ? remote.manifest.generationId : undefined,
      )
      return {}
    } catch (error) {
      const quotaError = error instanceof BrowserSyncQuotaError ? error : undefined
      if (quotaError?.currentUsage) {
        await this.repository.recordBrowserSyncUsage(accountScopeId, quotaError.currentUsage)
      }
      const retryAt = await this.repository.recordBrowserSyncFailure(
        accountScopeId,
        quotaError?.code ?? (error instanceof Error ? error.message.slice(0, 160) : 'browser-sync-failed'),
        quotaError ? 'quota-exceeded' : 'write-failed',
        quotaError?.usage
          ? {
            folderBytes: quotaError.usage.projectedFolderBytes,
            folderBudgetBytes: quotaError.usage.folderBudgetBytes,
            totalBytes: quotaError.usage.projectedTotalBytes,
            quotaBytes: quotaError.usage.quotaBytes,
            usagePercent: quotaError.usage.usagePercent,
          }
          : undefined,
      )
      await this.publishInvalidation(accountScopeId)
      logDevError(LOG_LABEL, 'browser-sync.coordinator.failed', error, { accountScopeId, syncRunId, traceId, retryAt })
      return { retryAt }
    } finally {
      await this.repository.releaseCoordinatorLease(accountScopeId, this.ownerId)
    }
  }
}
