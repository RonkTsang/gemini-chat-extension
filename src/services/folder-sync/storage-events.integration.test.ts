import { storage, resetStorage, scopeA, scopeB, publication, data } from './test-storage'
import { beforeEach, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { FolderSyncCoordinator } from './coordinator'
import { FolderSyncScheduler } from './scheduler'
import { BrowserSyncFolderProvider } from './providers/browser-sync'

beforeEach(resetStorage)
const idle = async (scheduler: FolderSyncScheduler) => {
  // Notification filtering resolves the shared installation identity asynchronously.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await vi.waitFor(() => expect((scheduler as unknown as { runs: Map<string, unknown> }).runs.size).toBe(0))
}

it('coalesces fixed manifest/chunk events, quiets self echoes, and applies a remote change exactly once', async () => {
  const repo = new FolderRepositoryImpl()
  const sync = new FolderSyncCoordinator(repo)
  const scheduler = new FolderSyncScheduler(sync)
  const runs = vi.spyOn(sync, 'sync')
  const reads = vi.spyOn(BrowserSyncFolderProvider.prototype, 'read')
  storage.onChanged = (changes) => scheduler.requestStorageChanges(changes)
  const writes = vi.mocked(browser.storage.sync.set)
  writes.mockClear()
  const created = await repo.createFolder(scopeA, { name: 'First' })
  scheduler.requestRun(scopeA, 'local-changes-committed')
  await idle(scheduler)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(runs).toHaveBeenCalledTimes(1)
  expect(reads).toHaveBeenCalledTimes(1)
  expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
  await repo.updateFolder(scopeA, created.data.id, { name: 'Second' })
  scheduler.requestRun(scopeA, 'local-changes-committed')
  await idle(scheduler)
  expect(writes).toHaveBeenCalledTimes(2)
  expect(runs).toHaveBeenCalledTimes(2)
  expect(reads).toHaveBeenCalledTimes(2)
  const base = (await repo.getSyncState(scopeA))!.baseSnapshotId!
  await new BrowserSyncFolderProvider({ getDeviceId: async () => 'remote-device' }).publish(await publication('remote', data('Remote'), scopeA, base), async () => undefined)
  await idle(scheduler)
  expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual(['Remote'])
  expect(runs).toHaveBeenCalledTimes(3)
  expect(reads).toHaveBeenCalledTimes(3)
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

it('restores a valid same-installation snapshot through background resume into empty IndexedDB', async () => {
  await new BrowserSyncFolderProvider().publish(await publication('same-device', data('Restored')), async () => undefined)
  const repo = new FolderRepositoryImpl()
  const scheduler = new FolderSyncScheduler(new FolderSyncCoordinator(repo))
  scheduler.requestRun(scopeA, 'background-resume')
  await idle(scheduler)
  expect((await repo.listFolders(scopeA))[0]?.name).toBe('Restored')
})

it('publishes an edit committed during publication despite split own echoes', async () => {
  const repo = new FolderRepositoryImpl()
  const coordinator = new FolderSyncCoordinator(repo)
  const runs = vi.spyOn(coordinator, 'sync')
  const scheduler = new FolderSyncScheduler(coordinator)
  storage.onChanged = (changes) => scheduler.requestStorageChanges(changes)
  const folder = await repo.createFolder(scopeA, { name: 'Before' })
  storage.onSet = async () => {
    storage.onSet = undefined
    await repo.updateFolder(scopeA, folder.data.id, { name: 'During publication' })
    scheduler.requestRun(scopeA, 'local-changes-committed')
  }
  scheduler.requestRun(scopeA, 'local-changes-committed')
  await idle(scheduler)
  expect(runs).toHaveBeenCalledTimes(2)
  expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'During publication' }] } })
  expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
})

it('resumes an interrupted same-device publication through the full background path', async () => {
  const repo = new FolderRepositoryImpl()
  await repo.createFolder(scopeA, { name: 'Interrupted' })
  const coordinator = new FolderSyncCoordinator(repo)
  storage.failAfterItems = 1
  expect((await coordinator.sync(scopeA)).outcome).toBe('failed')
  storage.failAfterItems = undefined
  const scheduler = new FolderSyncScheduler(coordinator)
  storage.onChanged = (changes) => scheduler.requestStorageChanges(changes)
  scheduler.requestRun(scopeA, 'background-resume')
  await idle(scheduler)
  expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
  expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'Interrupted' }] } })
})
