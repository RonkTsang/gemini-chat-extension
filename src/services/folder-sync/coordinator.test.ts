import { describe, expect, it, vi } from 'vitest'

import type { FolderRepository } from '@/data/repositories/folderRepository'
import type { FolderExportPayload, FolderSyncEnvelope } from '@/domain/folder/types'
import { encodeLzStringBase64, sha256Hex } from './codec'
import { FolderSyncCoordinator, type FolderSyncTransport } from './coordinator'

const scope = 'account-scope-0001'

async function createEnvelope(revision: string): Promise<FolderSyncEnvelope> {
  const payload: FolderExportPayload = {
    schemaVersion: 1, accountScopeId: scope, folders: [], memberships: [], chatReferences: [],
    settings: { accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', fieldVersions: {} },
    exportedAt: '2026-01-01T00:00:00.000Z',
  }
  const encoded = encodeLzStringBase64(payload)
  return {
    appId: 'gemini-power-kit-folders', schemaVersion: 1, syncProtocolVersion: 1, accountScopeId: scope,
    authority: { provider: 'browser-sync', epoch: 'epoch-a' }, dataRevision: revision, parentRevisions: [],
    generatedByDeviceId: 'device-a', generatedAt: '2026-01-01T00:00:00.000Z',
    encoding: { codec: 'lz-string-base64', codecVersion: 1 }, contentHash: await sha256Hex(encoded), payload: encoded,
  }
}

function repository(overrides: Partial<FolderRepository> = {}): FolderRepository {
  return {
    acquireCoordinatorLease: vi.fn(async () => ({ accountScopeId: scope, ownerId: 'owner', expiresAt: '2026-01-01T00:00:30.000Z' })),
    releaseCoordinatorLease: vi.fn(async () => undefined),
    getSyncState: vi.fn(async () => ({ accountScopeId: scope, provider: 'browser-sync', authorityEpoch: 'epoch-a', dataRevision: 'local', deviceId: 'device-a', updatedAt: '2026-01-01T00:00:00.000Z' })),
    hasPendingOperations: vi.fn(async () => true),
    exportAccountData: vi.fn(async () => ({ schemaVersion: 1, accountScopeId: scope, folders: [], memberships: [], chatReferences: [], settings: { accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', fieldVersions: {} }, exportedAt: '2026-01-01T00:00:00.000Z' })),
    createSyncEnvelope: vi.fn(async () => createEnvelope('local-revision')),
    getOrCreateBrowserSyncGeneration: vi.fn(async () => ({
      id: 'generation-local', accountScopeId: scope, syncMode: 'browser-sync', syncEpoch: 'epoch-a',
      dataRevision: 'local-revision', parentRevisions: [], contentHash: '',
      serializedEnvelope: JSON.stringify(await createEnvelope('local-revision')),
      includedOperationIds: [], createdAt: '2026-01-01T00:00:00.000Z', state: 'prepared',
    })),
    applyBrowserSyncPayload: vi.fn(async () => undefined),
    markBrowserSyncGenerationAccepted: vi.fn(async () => undefined),
    recordBrowserSyncFailure: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as FolderRepository
}

describe('FolderSyncCoordinator', () => {
  it('publishes a persisted generation and accepts only that generation after a read-back match', async () => {
    const local = await createEnvelope('local-revision')
    const repo = repository()
    const read = vi.fn<FolderSyncTransport['read']>()
    read.mockResolvedValueOnce(undefined).mockResolvedValueOnce(local)
    const transport: FolderSyncTransport = {
      read,
      publish: vi.fn(async () => ({ usedBytes: 10, quotaBytes: 100_000, warning: undefined })),
      cleanupLocalOrphans: vi.fn(async () => undefined),
    }
    await new FolderSyncCoordinator(repo, transport).sync(scope)
    expect(transport.publish).toHaveBeenCalledWith(local, 'generation-local')
    expect(repo.markBrowserSyncGenerationAccepted).toHaveBeenCalledWith(scope, 'generation-local', undefined)
    expect(transport.cleanupLocalOrphans).toHaveBeenCalledWith(scope, 'device-a')
    expect(repo.recordBrowserSyncFailure).not.toHaveBeenCalled()
  })

  it('applies a verified remote generation without publishing when there are no local operations', async () => {
    const remote = await createEnvelope('remote-revision')
    const repo = repository({
      hasPendingOperations: vi.fn(async () => false),
      getSyncState: vi.fn(async () => ({ accountScopeId: scope, provider: 'browser-sync' as const, authorityEpoch: 'epoch-a', dataRevision: 'remote-revision', deviceId: 'device-a', updatedAt: '2026-01-01T00:00:00.000Z' })),
    })
    const transport: FolderSyncTransport = {
      read: vi.fn(async () => remote),
      publish: vi.fn(),
    }
    await new FolderSyncCoordinator(repo, transport).sync(scope)
    expect(repo.applyBrowserSyncPayload).toHaveBeenCalledWith(scope, expect.any(Object), 'remote-revision', 'epoch-a', false)
    expect(transport.publish).not.toHaveBeenCalled()
  })
})
