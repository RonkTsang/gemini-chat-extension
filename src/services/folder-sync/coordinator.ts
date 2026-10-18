import { nanoid } from 'nanoid'

import { folderRepository, FolderCoordinatorLeaseBusyError, type FolderRepository } from '@/data/repositories/folderRepository'
import type { BrowserSyncRecreationRequest, FolderAccountData, FolderSyncPublicationRow, FolderSyncRunResult, FolderSnapshotRow } from '@/domain/folder/types'
import { publishFolderInvalidation } from '@/entrypoints/background/folders/invalidation'
import { FolderRecoveryError } from '@/services/folder-recovery/storage'
import { logDevError, logDevEvent } from '@/utils/devLogger'
import { stableStringify, fromFolderSyncData, toFolderSyncData } from './codec'
import {
  browserSyncManifestKey, BrowserSyncFolderProvider, BrowserSyncQuotaError, BrowserSyncReplicaChangedError, BrowserSyncUnsupportedVersionError,
  type BrowserSyncPublishResult, type BrowserSyncReadResult,
} from './providers/browser-sync'

export type { FolderSyncRunResult } from '@/domain/folder/types'
export interface FolderSyncTransport {
  read(accountScopeId: string): Promise<BrowserSyncReadResult>
  publish(publication: FolderSyncPublicationRow, onWriting: () => Promise<void>): Promise<BrowserSyncPublishResult>
}

function organizationContent(data: FolderAccountData): string {
  const organization = toFolderSyncData(data)
  const byId = (left: { id: string }, right: { id: string }) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  return stableStringify({
    folders: organization.folders.sort(byId),
    memberships: organization.memberships.sort(byId),
    chatReferences: organization.chatReferences.sort((left, right) => left.chatId < right.chatId ? -1 : left.chatId > right.chatId ? 1 : 0),
  })
}

/** Inbound-first snapshot replacement; identity alone never implies a global CAS. */
export class FolderSyncCoordinator {
  private readonly ownerId = `folder-sync-${nanoid()}`
  constructor(
    private readonly repository: FolderRepository = folderRepository,
    private readonly transport: FolderSyncTransport = new BrowserSyncFolderProvider(),
    private readonly wakeRecovery: (accountScopeId: string) => void = () => undefined,
  ) {}

  private async invalidate(accountScopeId: string, dataChanged = false): Promise<void> {
    const state = await this.repository.getSyncState(accountScopeId)
    await publishFolderInvalidation({ type: 'folders:data-changed', accountScopeId,
      dataRevision: state?.localDataRevision ?? 'uninitialized',
      affected: dataChanged ? { settings: true, syncStatus: true } : { syncStatus: true } })
  }

  private recover(accountScopeId: string): void {
    try { this.wakeRecovery(accountScopeId) }
    catch (error) { logDevError('[Folders][sync]', 'recovery-wake-failed', error, { accountScopeId }) }
  }

  private async publish(accountScopeId: string, pending: FolderSyncPublicationRow | undefined, context: { syncRunId: string; traceId?: string }): Promise<FolderSyncRunResult> {
    const publication = pending ?? await this.repository.getOrCreateBrowserSyncPublication(accountScopeId)
    logDevEvent('debug', '[Folders][sync]', 'browser-sync.publish.started', { accountScopeId, ...context,
      manifestKey: browserSyncManifestKey(accountScopeId), snapshotId: publication.id, baseSnapshotId: publication.baseSnapshotId,
      dataRevision: publication.dataRevision, publicationState: publication.state })
    const usage = await this.transport.publish(publication,
      () => this.repository.markBrowserSyncPublicationWriting(accountScopeId, publication.id))
    await this.repository.markBrowserSyncPublicationAccepted(accountScopeId, publication.id, {
      folderBytes: usage.projectedFolderBytes, folderBudgetBytes: usage.folderBudgetBytes,
      totalBytes: usage.projectedTotalBytes, quotaBytes: usage.quotaBytes, usagePercent: usage.usagePercent,
    })
    await this.invalidate(accountScopeId)
    logDevEvent('info', '[Folders][sync]', 'browser-sync.publish.accepted', { accountScopeId, ...context, snapshotId: publication.id, dataRevision: publication.dataRevision })
    // An edit made during storage.set remains dirty and has a durable wake after restart.
    return { outcome: 'accepted-by-browser-storage',
      ...(await this.repository.hasPendingChanges(accountScopeId) ? { retryAt: new Date(Date.now() + 60_000).toISOString() } : {}) }
  }

  private async failed(accountScopeId: string, error: unknown, context: { syncRunId: string; traceId?: string }): Promise<FolderSyncRunResult> {
    const quota = error instanceof BrowserSyncQuotaError ? error : undefined
    if (quota?.currentUsage) await this.repository.recordBrowserSyncUsage(accountScopeId, quota.currentUsage)
    const protection = error instanceof FolderRecoveryError && error.code === 'SNAPSHOT_PROTECTION_FAILED'
    const retryAt = await this.repository.recordBrowserSyncFailure(accountScopeId,
      quota?.code ?? (error instanceof Error ? error.message.slice(0, 160) : 'browser-sync-failed'),
      error instanceof BrowserSyncUnsupportedVersionError ? 'unsupported-schema-version'
        : quota ? 'quota-exceeded' : protection ? 'recovery-protection-failed' : 'write-failed',
      quota?.usage ? { folderBytes: quota.usage.projectedFolderBytes, folderBudgetBytes: quota.usage.folderBudgetBytes,
        totalBytes: quota.usage.projectedTotalBytes, quotaBytes: quota.usage.quotaBytes, usagePercent: quota.usage.usagePercent } : undefined)
    await this.invalidate(accountScopeId)
    logDevError('[Folders][sync]', 'browser-sync.coordinator.failed', error, { accountScopeId, ...context })
    return { outcome: 'failed', retryAt }
  }

  async sync(accountScopeId: string, traceId?: string, storageChangesOnly = false): Promise<FolderSyncRunResult> {
    const context = { syncRunId: nanoid(), traceId }
    logDevEvent('debug', '[Folders][sync]', 'browser-sync.coordinator.started', { accountScopeId, ...context, storageChangesOnly })
    try { await this.repository.acquireCoordinatorLease(accountScopeId, this.ownerId) }
    catch (error) {
      if (error instanceof FolderCoordinatorLeaseBusyError) return { outcome: 'busy', retryAt: error.retryAt }
      throw error
    }
    try {
      const settings = await this.repository.getSettings(accountScopeId)
      const state = await this.repository.getSyncState(accountScopeId)
      if (state?.provider === 'google-drive') return { outcome: 'deferred' }
      const remote = await this.transport.read(accountScopeId)
      logDevEvent('debug', '[Folders][sync]', `browser-sync.read.${remote.status}`, { accountScopeId, ...context,
        manifestKey: browserSyncManifestKey(accountScopeId),
        ...(remote.status === 'absent' ? { hasChunks: !!remote.hasChunks } : {}),
        ...('manifest' in remote ? { snapshotId: remote.manifest?.snapshotId } : {}),
        ...(remote.status === 'complete' ? { folderCount: remote.data.folders.length, membershipCount: remote.data.memberships.length } : {}),
        ...(remote.status === 'invalid' ? { code: remote.code } : {}) })
      if (remote.status === 'unsupported-schema-version') throw new BrowserSyncUnsupportedVersionError(remote.schemaVersion)
      const pending = await this.repository.getBrowserSyncPublication(accountScopeId)
      logDevEvent('debug', '[Folders][sync]', 'browser-sync.local-state', { accountScopeId, ...context,
        baseSnapshotId: state?.baseSnapshotId, dirty: state?.dirty, dataRevision: state?.localDataRevision,
        pendingSnapshotId: pending?.id, pendingState: pending?.state })
      if (remote.status === 'complete' && pending?.id === remote.manifest.snapshotId) {
        // The storage write may have succeeded immediately before the worker stopped.
        return await this.publish(accountScopeId, pending, context)
      }
      if (remote.status === 'incomplete' || remote.status === 'invalid' || remote.status === 'absent') {
        // Only our persisted writing marker authorizes repairing a known interrupted replacement.
        const ownInterrupted = pending?.state === 'writing'
          && (remote.status === 'absent' || remote.manifest?.snapshotId === pending.id
            || remote.manifest?.snapshotId === pending.baseSnapshotId)
        if (ownInterrupted) return await this.publish(accountScopeId, pending, context)
        if (remote.status === 'absent' && !state?.baseSnapshotId && !await this.repository.getBrowserSyncConflict(accountScopeId)) {
          if (state?.dirty || pending) return await this.publish(accountScopeId, pending, context)
          logDevEvent('debug', '[Folders][sync]', 'browser-sync.waiting-for-replica', { accountScopeId, ...context })
          return { outcome: 'deferred' }
        }
        const warning = remote.status === 'absent' ? 'missing-replica' : remote.status === 'incomplete' ? 'incomplete-replica' : 'invalid-replica'
        if (remote.status === 'absent') logDevEvent('info', '[Folders][sync]', 'browser-sync.publish.blocked-missing-replica', {
          accountScopeId, ...context, baseSnapshotId: state?.baseSnapshotId,
          hasConflict: !!await this.repository.getBrowserSyncConflict(accountScopeId) })
        const retryAt = await this.repository.recordBrowserSyncFailure(accountScopeId,
          remote.status === 'invalid' ? remote.code : warning, warning)
        await this.invalidate(accountScopeId)
        return { outcome: 'failed', retryAt }
      }
      const capture = await this.repository.getAccountDataWithRevision(accountScopeId)
      const current = await this.repository.getSyncState(accountScopeId)
      if (current?.localDataRevision !== capture.dataRevision) return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
      const conflict = await this.repository.getBrowserSyncConflict(accountScopeId)
      if (conflict || (current?.dirty && current.baseSnapshotId !== remote.manifest.snapshotId)) {
        if (!await this.repository.recordBrowserSyncConflict(accountScopeId, remote.data, remote.manifest, capture.dataRevision)) {
          return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
        }
        await this.invalidate(accountScopeId)
        logDevEvent('info', '[Folders][sync]', 'browser-sync.conflict.recorded', { accountScopeId, ...context, snapshotId: remote.manifest.snapshotId, dataRevision: capture.dataRevision })
        return { outcome: 'conflict' }
      }
      if (current?.baseSnapshotId === remote.manifest.snapshotId) {
        if (current.dirty || pending) return await this.publish(accountScopeId, pending?.state === 'writing' ? pending : undefined, context)
        // A retained base ID alone does not prove the local organization survived
        // a partial reset. Clean data must still describe that complete snapshot.
        if (organizationContent(capture.data) === organizationContent(remote.data)
          && settings.enabled === remote.manifest.settings.enabled
          && settings.hideOrganizedChats === remote.manifest.settings.hideOrganizedChats) {
          if (await this.repository.recordBrowserSyncHealthy(accountScopeId, remote.manifest.snapshotId, capture.dataRevision)) await this.invalidate(accountScopeId)
          logDevEvent('debug', '[Folders][sync]', 'browser-sync.snapshot.unchanged', { accountScopeId, ...context, snapshotId: remote.manifest.snapshotId, folderCount: capture.data.folders.length })
          return { outcome: 'accepted-by-browser-storage' }
        }
        logDevEvent('info', '[Folders][sync]', 'browser-sync.local-replica.repair-needed', { accountScopeId, ...context, snapshotId: remote.manifest.snapshotId })
      }
      if (!await this.repository.applyBrowserSyncSnapshot(accountScopeId, remote.data, remote.manifest, capture.dataRevision)) {
        return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
      }
      logDevEvent('info', '[Folders][sync]', 'browser-sync.snapshot.applied', { accountScopeId, ...context, snapshotId: remote.manifest.snapshotId, dataRevision: capture.dataRevision })
      this.recover(accountScopeId)
      await this.invalidate(accountScopeId, true)
      return { outcome: 'accepted-by-browser-storage' }
    } catch (error) {
      if (error instanceof BrowserSyncReplicaChangedError) return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
      return await this.failed(accountScopeId, error, context)
    } finally { await this.repository.releaseCoordinatorLease(accountScopeId, this.ownerId) }
  }

  async recreateMissingReplica(accountScopeId: string, request: BrowserSyncRecreationRequest): Promise<FolderSyncRunResult> {
    const context = { syncRunId: nanoid() }
    try { await this.repository.acquireCoordinatorLease(accountScopeId, this.ownerId) }
    catch (error) {
      if (error instanceof FolderCoordinatorLeaseBusyError) return { outcome: 'busy', retryAt: error.retryAt }
      throw error
    }
    try {
      const state = await this.repository.getSyncState(accountScopeId)
      if (state?.localDataRevision !== request.expectedRevision || state.baseSnapshotId !== request.baseSnapshotId
        || state.provider !== 'browser-sync') return { outcome: 'deferred' }
      const remote = await this.transport.read(accountScopeId)
      if (remote.status === 'unsupported-schema-version') throw new BrowserSyncUnsupportedVersionError(remote.schemaVersion)
      // A newly arrived replica requires ordinary reconciliation, not recreation.
      if (remote.status !== 'absent' || remote.hasChunks) return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
      if (await this.repository.getBrowserSyncConflict(accountScopeId)) return { outcome: 'conflict' }
      const pending = await this.repository.getBrowserSyncPublication(accountScopeId)
      if (pending?.state === 'writing') return await this.publish(accountScopeId, pending, context)
      if (!await this.repository.prepareBrowserSyncRecreation(accountScopeId, request)) return { outcome: 'deferred' }
      logDevEvent('info', '[Folders][sync]', 'browser-sync.replica.recreation-authorized', { accountScopeId, ...context, ...request })
      return await this.publish(accountScopeId, undefined, context)
    } catch (error) {
      if (error instanceof BrowserSyncReplicaChangedError) return { outcome: 'deferred', retryAt: new Date(Date.now() + 60_000).toISOString() }
      return await this.failed(accountScopeId, error, context)
    } finally { await this.repository.releaseCoordinatorLease(accountScopeId, this.ownerId) }
  }

  async resolveConflict(accountScopeId: string, choice: 'remote' | 'local', expectedRevision: string, snapshotId: string): Promise<FolderSyncRunResult> {
    const context = { syncRunId: nanoid() }
    logDevEvent('debug', '[Folders][sync]', 'browser-sync.conflict.resolution-started', { accountScopeId, ...context, choice, snapshotId, dataRevision: expectedRevision })
    try { await this.repository.acquireCoordinatorLease(accountScopeId, this.ownerId) }
    catch (error) {
      if (error instanceof FolderCoordinatorLeaseBusyError) return { outcome: 'busy', retryAt: error.retryAt }
      throw error
    }
    const protections: FolderSnapshotRow[] = []
    try {
      const candidate = await this.repository.getBrowserSyncConflict(accountScopeId)
      const captured = await this.repository.getAccountDataWithRevision(accountScopeId)
      if (captured.dataRevision !== expectedRevision || candidate?.localRevision !== expectedRevision
        || candidate.manifest.snapshotId !== snapshotId) return { outcome: 'deferred' }
      const remote = await this.transport.read(accountScopeId)
      if (remote.status === 'unsupported-schema-version') throw new BrowserSyncUnsupportedVersionError(remote.schemaVersion)
      if (remote.status !== 'complete') return { outcome: 'deferred' }
      if (stableStringify(remote.manifest) !== stableStringify(candidate.manifest)) {
        await this.repository.recordBrowserSyncConflict(accountScopeId, remote.data, remote.manifest, captured.dataRevision)
        await this.invalidate(accountScopeId)
        return { outcome: 'conflict' }
      }
      try {
        protections.push(await this.repository.createSnapshot(accountScopeId, 'before-sync', true, captured))
        protections.push(await this.repository.createSnapshot(accountScopeId, 'before-sync', true, {
          data: fromFolderSyncData(accountScopeId, candidate.data), dataRevision: `snapshot:${snapshotId}`,
        }))
      } catch (error) { throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error }) }
      const latest = await this.transport.read(accountScopeId)
      if (latest.status === 'unsupported-schema-version') throw new BrowserSyncUnsupportedVersionError(latest.schemaVersion)
      if (latest.status !== 'complete' || stableStringify(latest.manifest) !== stableStringify(candidate.manifest)) {
        if (latest.status === 'complete') {
          await this.repository.recordBrowserSyncConflict(accountScopeId, latest.data, latest.manifest, expectedRevision)
          await this.invalidate(accountScopeId)
        }
        return { outcome: 'deferred' }
      }
      if (choice === 'remote') {
        if (!await this.repository.applyBrowserSyncSnapshot(accountScopeId, remote.data, candidate.manifest, expectedRevision, true)) return { outcome: 'deferred' }
        logDevEvent('info', '[Folders][sync]', 'browser-sync.conflict.resolved', { accountScopeId, ...context, choice, snapshotId })
        this.recover(accountScopeId)
        await this.invalidate(accountScopeId, true)
        return { outcome: 'accepted-by-browser-storage' }
      }
      if (!await this.repository.selectLocalConflictVersion(accountScopeId, expectedRevision, snapshotId)) return { outcome: 'deferred' }
      logDevEvent('info', '[Folders][sync]', 'browser-sync.conflict.resolved', { accountScopeId, ...context, choice, snapshotId })
      return await this.publish(accountScopeId, undefined, context)
    } catch (error) { return await this.failed(accountScopeId, error, context) }
    finally {
      for (const protection of protections) {
        if (!protection.protectionToken) continue
        try { await this.repository.releaseSnapshot(accountScopeId, protection.id, protection.protectionToken) }
        catch (error) { logDevError('[Folders][sync]', 'protection-release-failed', error) }
      }
      await this.repository.releaseCoordinatorLease(accountScopeId, this.ownerId)
    }
  }
}
