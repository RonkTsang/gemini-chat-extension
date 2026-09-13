import { nanoid } from 'nanoid'

import type { FolderRepository } from '@/data/repositories/folderRepository'
import { folderRepository } from '@/data/repositories/folderRepository'
import { decodeAndVerifyEnvelopePayload } from './codec'
import { mergeFolderExportPayloads } from './merge'
import { BrowserSyncFolderProvider } from './providers/browser-sync'
import { logFolderTrace, logFolderTraceError } from '@/utils/folderTrace'

export interface FolderSyncTransport {
  read(accountScopeId: string): ReturnType<BrowserSyncFolderProvider['read']>
  publish(envelope: Awaited<ReturnType<FolderRepository['createSyncEnvelope']>>, generationId?: string): ReturnType<BrowserSyncFolderProvider['publish']>
  cleanupLocalOrphans?(accountScopeId: string, deviceId: string): Promise<void>
}

/**
 * A short-lived background job. The Dexie lease prevents two extension
 * contexts from publishing the same account concurrently; every remote state
 * is verified and merged before a local generation can be published.
 */
export class FolderSyncCoordinator {
  private readonly ownerId = `folder-sync-${nanoid()}`

  constructor(
    private readonly repository: FolderRepository = folderRepository,
    private readonly transport: FolderSyncTransport = new BrowserSyncFolderProvider(),
  ) {}

  async sync(accountScopeId: string, traceId?: string): Promise<void> {
    if (traceId) logFolderTrace(traceId, 'coordinator.started', { accountScopeId })
    try {
      await this.repository.acquireCoordinatorLease(accountScopeId, this.ownerId)
    } catch (error) {
      if (error instanceof Error && error.message.includes('lease is held')) {
        if (traceId) logFolderTrace(traceId, 'coordinator.lease-busy', { accountScopeId })
        return
      }
      throw error
    }

    try {
      const remote = await this.transport.read(accountScopeId)
      let pending = await this.repository.hasPendingOperations(accountScopeId)
      const state = await this.repository.getSyncState(accountScopeId)
      // Reclaim failed/interrupted local generations before calculating peak
      // storage for the next immutable write. Waiting until a publish succeeds
      // can deadlock recovery when stale chunks already consume the quota.
      await this.transport.cleanupLocalOrphans?.(accountScopeId, state?.deviceId ?? '')
      if (traceId) {
        logFolderTrace(traceId, 'coordinator.remote-read', {
          accountScopeId,
          remoteFound: Boolean(remote),
          pending,
        })
      }

      if (remote) {
        if (remote.authority.provider !== 'browser-sync') {
          throw new Error('Browser Sync cannot apply a Folder envelope from another authority')
        }
        const remotePayload = await decodeAndVerifyEnvelopePayload(remote)
        if (state?.lastAppliedRevision !== remote.dataRevision) {
          const localPayload = await this.repository.exportAccountData(accountScopeId)
          const merged = mergeFolderExportPayloads(localPayload, remotePayload)
          await this.repository.applyBrowserSyncPayload(
            accountScopeId,
            merged,
            remote.dataRevision,
            remote.authority.epoch,
            pending,
          )
        }
      }

      pending = await this.repository.hasPendingOperations(accountScopeId)
      if (!pending) {
        await this.transport.cleanupLocalOrphans?.(accountScopeId, state?.deviceId ?? '')
        if (traceId) logFolderTrace(traceId, 'coordinator.no-pending-operations', { accountScopeId })
        return
      }

      const generation = await this.repository.getOrCreateBrowserSyncGeneration(accountScopeId)
      const envelope = JSON.parse(generation.serializedEnvelope) as Awaited<ReturnType<FolderRepository['createSyncEnvelope']>>
      if (traceId) {
        logFolderTrace(traceId, 'coordinator.publish-started', {
          accountScopeId,
          dataRevision: envelope.dataRevision,
        })
      }
      const result = await this.transport.publish(envelope, generation.id)
      // storage.sync has no compare-and-set manifest. Confirm our generation
      // remains active before treating local Outbox operations as delivered.
      const verified = await this.transport.read(accountScopeId)
      if (!verified || verified.dataRevision !== envelope.dataRevision) {
        throw new Error('Browser Sync generation was superseded before confirmation')
      }
      await this.repository.markBrowserSyncGenerationAccepted(accountScopeId, generation.id, result.warning)
      await this.transport.cleanupLocalOrphans?.(accountScopeId, state?.deviceId ?? '')
      if (traceId) {
        logFolderTrace(traceId, 'coordinator.publish-confirmed', {
          accountScopeId,
          dataRevision: envelope.dataRevision,
          warning: result.warning,
        })
      }
    } catch (error) {
      if (traceId) logFolderTraceError(traceId, 'coordinator.failed', error, { accountScopeId })
      await this.repository.recordBrowserSyncFailure(
        accountScopeId,
        error instanceof Error ? error.message.slice(0, 160) : 'browser-sync-failed',
      )
      throw error
    } finally {
      await this.repository.releaseCoordinatorLease(accountScopeId, this.ownerId)
    }
  }
}
