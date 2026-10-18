import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('wxt/browser', () => ({ browser: { storage: { local: {
  get: vi.fn(async () => ({ 'gpk.folders.device-id.v1': 'integration-device' })), set: vi.fn(),
} }, alarms: { clear: vi.fn(async () => true), create: vi.fn(), get: vi.fn(async () => undefined) } } }))
vi.mock('./invalidation', () => ({ publishFolderInvalidation: vi.fn(async () => undefined) }))

import { folderRepository } from '@/data/repositories/folderRepository'
import { db } from '@/data/db'
import { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { FolderCommandService } from './command-service'
import type { FolderRpcEnvelope } from '@/domain/folder/rpc'

it('returns durable mutations while SYNC and automatic Recovery are both waiting', async () => {
  const scope = 'integration-scope-0001'
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const coordinator = { sync: vi.fn(async () => { await gate; return {} }) }
  const scheduler = new FolderSyncScheduler(coordinator as never)
  const recovery = new FolderRecoveryRunner()
  const save = folderRepository.createSnapshot.bind(folderRepository)
  const snapshot = vi.spyOn(folderRepository, 'createSnapshot').mockImplementation(async (...args) => {
    await gate
    return save(...args)
  })
  const service = new FolderCommandService(scheduler, undefined, recovery)
  const request: FolderRpcEnvelope = {
    namespace: 'folders', protocolVersion: 1, requestId: 'create-1', accountScopeId: scope,
    identitySource: 'observed', method: 'createFolder', params: { name: 'First' },
  }
  const created = await service.execute(request)
  const folderId = (created.data as { id: string }).id
  expect((await db.folders.get(folderId))?.name).toBe('First')
  expect(created.commit.effect).toBe('organization')
  await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1))
  expect(coordinator.sync).toHaveBeenCalledTimes(1)
  const updated = await service.execute({ ...request, requestId: 'update-1', method: 'updateFolder', params: { folderId, patch: { name: 'Second' } } })
  expect(updated.commit.dataRevision).not.toBe(created.commit.dataRevision)
  expect((await db.folders.get(folderId))?.name).toBe('Second')
  expect(await db.folder_snapshots.count()).toBe(0)
  release()
  await vi.waitFor(() => expect((recovery as unknown as { running: boolean }).running).toBe(false))
  await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
  expect(await db.folder_snapshots.count()).toBe(1)
  snapshot.mockRestore()
})
