import { describe, expect, it, vi } from 'vitest'

vi.mock('@/entrypoints/background/folders/invalidation', () => ({ publishFolderInvalidation: vi.fn(async () => undefined) }))

import type { FolderRepository } from '@/data/repositories/folderRepository'
import { publishFolderInvalidation } from '@/entrypoints/background/folders/invalidation'
import type { BrowserSyncManifest, FolderSettingsRow, FolderSyncGenerationRow } from '@/domain/folder/types'
import { encodeLzStringBase64, sha256Hex } from './codec'
import { FolderSyncCoordinator, type FolderSyncTransport } from './coordinator'
import { BrowserSyncQuotaError, type BrowserSyncPublishResult, type BrowserSyncReadResult } from './providers/browser-sync'

const scope = 'account-scope-0001'
const settings: FolderSettingsRow = {
  accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [],
  updatedAt: '2026-01-01T00:00:00.000Z', settingsVersion: '0000000000001:000000:device-a', settingsPending: false,
}
const switches = { enabled: true, hideOrganizedChats: false }
const accountData = { accountScopeId: scope, folders: [], memberships: [], chatReferences: [] }

async function generation(): Promise<FolderSyncGenerationRow> {
  const payload = encodeLzStringBase64({ folders: [], memberships: [], chatReferences: [] })
  return {
    id: 'generation-local', accountScopeId: scope, syncMode: 'browser-sync', syncEpoch: 'epoch-a',
    dataRevision: 'local-revision', payloadHash: await sha256Hex(payload), payload,
    includedOperationIds: [], createdAt: '2026-01-01T00:00:00.000Z', state: 'prepared',
  }
}

function manifest(patch: Partial<BrowserSyncManifest> = {}): BrowserSyncManifest {
  return {
    schemaVersion: 3, accountScopeId: scope, generationId: 'remote', dataRevision: 'remote', authorityEpoch: 'epoch-a',
    chunkCount: 1, payloadBytes: 1, payloadHash: 'a'.repeat(64), settings: switches, settingsVersion: settings.settingsVersion,
    ...patch,
  }
}

function published(): BrowserSyncPublishResult {
  return {
    settings: switches, settingsVersion: settings.settingsVersion,
    projectedFolderBytes: 100, projectedTotalBytes: 200, projectedItemCount: 2,
    quotaBytes: 100_000, folderBudgetBytes: 70 * 1024, usagePercent: 1,
  }
}

function repository(overrides: Partial<FolderRepository> = {}): FolderRepository {
  return {
    acquireCoordinatorLease: vi.fn(async () => ({ accountScopeId: scope, ownerId: 'owner', expiresAt: '2026-01-01T00:00:30.000Z' })),
    releaseCoordinatorLease: vi.fn(async () => undefined),
    getSyncState: vi.fn(async () => ({ accountScopeId: scope, provider: 'browser-sync' as const, authorityEpoch: 'epoch-a', localDataRevision: 'local', deviceId: 'device-a', updatedAt: '2026-01-01T00:00:00.000Z' })),
    getSettings: vi.fn(async () => settings),
    applyBrowserSyncSettings: vi.fn(async () => false),
    hasPendingOperations: vi.fn(async () => true),
    getAccountData: vi.fn(async () => accountData),
    getOrCreateBrowserSyncGeneration: vi.fn(generation),
    getRecoverableBrowserSyncGeneration: vi.fn(async () => undefined),
    markBrowserSyncGenerationWriting: vi.fn(async () => undefined),
    markBrowserSyncSettingsAccepted: vi.fn(async () => undefined),
    markBrowserSyncGenerationAccepted: vi.fn(async () => undefined),
    recordBrowserSyncUsage: vi.fn(async () => undefined),
    listReclaimableBrowserSyncGenerationIds: vi.fn(async () => []),
    recordBrowserSyncFailure: vi.fn(async () => '2026-01-01T00:01:00.000Z'),
    recordBrowserSyncReplicaObserved: vi.fn(async () => false),
    applyBrowserSyncPayload: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as FolderRepository
}

function transport(result: BrowserSyncReadResult = { status: 'absent' }): FolderSyncTransport {
  return {
    read: vi.fn(async () => result), publish: vi.fn(async () => published()),
    publishSettings: vi.fn(async () => published()), cleanupLocalOrphans: vi.fn(async () => undefined),
  }
}

describe('FolderSyncCoordinator', () => {
  it('publishes a persisted generation without a confirmation read-back', async () => {
    const repo = repository()
    const remote = transport()
    await new FolderSyncCoordinator(repo, remote).sync(scope)
    expect(remote.publish).toHaveBeenCalledWith(await generation(), settings, undefined)
    expect(repo.markBrowserSyncGenerationWriting).toHaveBeenCalledWith(scope, 'generation-local', undefined)
    expect(repo.markBrowserSyncGenerationAccepted).toHaveBeenCalledWith(scope, 'generation-local', {
      folderBytes: 100, folderBudgetBytes: 70 * 1024, totalBytes: 200, quotaBytes: 100_000, usagePercent: 1,
    })
    expect(remote.read).toHaveBeenCalledTimes(1)
  })

  it('records actual and projected quota separately and retains pending work on rejection', async () => {
    const repo = repository()
    const current = { folderBytes: 100, folderBudgetBytes: 70 * 1024, totalBytes: 200, quotaBytes: 100_000, usagePercent: 1 }
    const projected = { ...published(), projectedFolderBytes: 80_000, projectedTotalBytes: 90_000, usagePercent: 111 }
    const remote = transport()
    remote.publish = vi.fn(async () => { throw new BrowserSyncQuotaError('folder-budget-exceeded', projected, current) })
    await new FolderSyncCoordinator(repo, remote).sync(scope)
    expect(repo.recordBrowserSyncUsage).toHaveBeenCalledWith(scope, current)
    expect(repo.recordBrowserSyncFailure).toHaveBeenCalledWith(scope, 'folder-budget-exceeded', 'quota-exceeded', expect.objectContaining({ folderBytes: 80_000 }))
    expect(repo.markBrowserSyncGenerationAccepted).not.toHaveBeenCalled()
  })

  it('applies incoming switches even when data chunks are incomplete and never applies partial data', async () => {
    const repo = repository()
    const remoteManifest = manifest({ settings: { enabled: false, hideOrganizedChats: true } })
    const remote = transport({ status: 'incomplete', manifest: remoteManifest, missingChunkIndexes: [0] })
    await expect(new FolderSyncCoordinator(repo, remote).sync(scope)).resolves.toEqual({ retryAt: '2026-01-01T00:01:00.000Z' })
    expect(repo.applyBrowserSyncSettings).toHaveBeenCalledWith(scope, remoteManifest.settings, remoteManifest.settingsVersion)
    expect(repo.applyBrowserSyncPayload).not.toHaveBeenCalled()
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('publishes pending switches independently while incomplete data waits for retry', async () => {
    const repo = repository({ getSettings: vi.fn(async () => ({ ...settings, settingsPending: true })) })
    const remote = transport({ status: 'incomplete', manifest: manifest(), missingChunkIndexes: [0] })
    await new FolderSyncCoordinator(repo, remote).sync(scope)
    expect(remote.publishSettings).toHaveBeenCalledWith(scope, expect.objectContaining({ settingsPending: true }))
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('invalidates recovered sync status without rewriting already applied data', async () => {
    const repo = repository({
      hasPendingOperations: vi.fn(async () => false),
      getSyncState: vi.fn(async () => ({ accountScopeId: scope, provider: 'browser-sync' as const, authorityEpoch: 'epoch-a', localDataRevision: 'local', deviceId: 'device-a', lastWrittenReplicaGenerationId: 'remote', updatedAt: '2026-01-01T00:00:00.000Z' })),
      recordBrowserSyncReplicaObserved: vi.fn(async () => true),
    })
    const remote = transport({ status: 'complete', manifest: manifest(), data: accountData })
    vi.mocked(publishFolderInvalidation).mockClear()
    await new FolderSyncCoordinator(repo, remote).sync(scope)
    expect(publishFolderInvalidation).toHaveBeenCalledWith(expect.objectContaining({ accountScopeId: scope, affected: { syncStatus: true } }))
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('publishes pending switches without preparing or writing a data generation', async () => {
    const repo = repository({ hasPendingOperations: vi.fn(async () => false) })
    vi.mocked(repo.getSettings).mockResolvedValueOnce({ ...settings, settingsPending: true }).mockResolvedValue(settings)
    const remote = transport({ status: 'complete', manifest: manifest(), data: accountData })
    await new FolderSyncCoordinator(repo, remote).sync(scope)
    expect(remote.publishSettings).toHaveBeenCalledTimes(1)
    expect(repo.markBrowserSyncSettingsAccepted).toHaveBeenCalledTimes(1)
    expect(repo.getOrCreateBrowserSyncGeneration).not.toHaveBeenCalled()
    expect(remote.publish).not.toHaveBeenCalled()
  })

  it('resumes the same generation after an interrupted removal and write', async () => {
    const resumed = { ...await generation(), id: 'generation-b', replacedGenerationId: 'generation-a', state: 'writing' as const }
    const repo = repository({ getRecoverableBrowserSyncGeneration: vi.fn(async () => resumed) })
    const remote = transport({ status: 'incomplete', manifest: manifest({ generationId: 'generation-a' }), missingChunkIndexes: [0] })
    await expect(new FolderSyncCoordinator(repo, remote).sync(scope)).resolves.toEqual({})
    expect(remote.publish).toHaveBeenCalledWith(resumed, settings, 'generation-a')
    expect(repo.recordBrowserSyncFailure).not.toHaveBeenCalled()
  })

  it('retries orphan collection even without outgoing work', async () => {
    const repo = repository({ hasPendingOperations: vi.fn(async () => false), listReclaimableBrowserSyncGenerationIds: vi.fn(async () => ['orphan-a']) })
    const remote = transport()
    remote.cleanupLocalOrphans = vi.fn().mockRejectedValueOnce(new Error('temporary storage failure')).mockResolvedValue(undefined)
    const coordinator = new FolderSyncCoordinator(repo, remote)
    await expect(coordinator.sync(scope)).resolves.toEqual({ retryAt: '2026-01-01T00:01:00.000Z' })
    await expect(coordinator.sync(scope)).resolves.toEqual({})
    expect(remote.cleanupLocalOrphans).toHaveBeenCalledTimes(2)
    expect(remote.publish).not.toHaveBeenCalled()
  })
})
