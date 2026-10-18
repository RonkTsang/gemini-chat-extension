import { storage, resetStorage, scopeA, scopeB, publication, data } from './test-storage'
import { beforeEach, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { FolderSyncCoordinator } from './coordinator'
import { FolderSyncScheduler } from './scheduler'
import { BrowserSyncFolderProvider } from './providers/browser-sync'

beforeEach(resetStorage)
const idle = async (scheduler: FolderSyncScheduler) => {
  await vi.waitFor(() => expect((scheduler as unknown as { runs: Map<string, unknown> }).runs.size).toBe(0))
}

it('coalesces fixed manifest/chunk events, quiets self echoes, and applies a remote change exactly once', async () => {
  const repo = new FolderRepositoryImpl({ getDeviceId: async () => 'integration-device' })
  const sync = new FolderSyncCoordinator(repo)
  const scheduler = new FolderSyncScheduler(sync)
  storage.onChanged = (changes) => scheduler.requestStorageChanges(changes)
  const writes = vi.mocked(browser.storage.sync.set)
  writes.mockClear()
  const created = await repo.createFolder(scopeA, { name: 'First' })
  scheduler.requestRun(scopeA, 'local-changes-committed')
  await idle(scheduler)
  expect(writes).toHaveBeenCalledTimes(1)
  expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
  await repo.updateFolder(scopeA, created.data.id, { name: 'Second' })
  scheduler.requestRun(scopeA, 'local-changes-committed')
  await idle(scheduler)
  expect(writes).toHaveBeenCalledTimes(2)
  const base = (await repo.getSyncState(scopeA))!.baseSnapshotId!
  await new BrowserSyncFolderProvider().publish(await publication('remote', data('Remote'), scopeA, base), async () => undefined)
  await idle(scheduler)
  expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual(['Remote'])
  expect(writes).toHaveBeenCalledTimes(3)
  const completed = (await repo.getSyncState(scopeA))!.localDataRevision
  scheduler.requestStorageChanges({ [`folders:${scopeA}:chunk:0`]: {} })
  await idle(scheduler)
  expect((await repo.getSyncState(scopeA))!.localDataRevision).toBe(completed)
  expect(writes).toHaveBeenCalledTimes(3)
})

it('resumes persisted dirty/settings/publication work for each account with a fresh scheduler', async () => {
  const repo = new FolderRepositoryImpl({ getDeviceId: async () => 'restart-device' })
  await repo.createFolder(scopeA, { name: 'Pending' })
  await repo.updateSettings(scopeB, { enabled: false })
  await repo.getOrCreateBrowserSyncPublication(scopeA)
  const scheduler = new FolderSyncScheduler(new FolderSyncCoordinator(repo))
  for (const scope of await repo.listBrowserSyncWakeScopes()) scheduler.requestRun(scope, 'background-resume')
  await idle(scheduler)
  expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
  expect((await repo.getSyncState(scopeB))?.dirty).toBe(false)
  expect(await new BrowserSyncFolderProvider().read(scopeB)).toMatchObject({ status: 'complete', manifest: { settings: { enabled: false } } })
  expect(await repo.listBrowserSyncWakeScopes()).toEqual([])
})
