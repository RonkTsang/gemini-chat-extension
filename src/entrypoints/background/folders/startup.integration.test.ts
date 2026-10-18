import { storage, resetStorage, scopeA, scopeB, publication, data } from '@/services/folder-sync/test-storage'
import { beforeEach, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { BrowserSyncFolderProvider, browserSyncManifestKey } from '@/services/folder-sync/providers/browser-sync'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { createFolderSyncResume, startFoldersBackground } from './index'

vi.mock('@/services/folder-recovery/runner', () => ({ FolderRecoveryRunner: class { requestRun() {} } }))
vi.mock('@/services/folder-recovery/storage', async (original) => ({
  ...await original<typeof import('@/services/folder-recovery/storage')>(), pruneRecoveryHistory: vi.fn(async () => undefined),
}))

beforeEach(async () => {
  await resetStorage()
  vi.clearAllMocks()
})

const start = () => {
  const scheduler = new FolderSyncScheduler()
  storage.onChanged = (changes) => scheduler.requestStorageChanges(changes)
  const resume = createFolderSyncResume(scheduler, () => undefined)
  storage.startup = resume
  return resume()
}
const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'startup-test' })

it('discovers and restores multiple accounts on background initialization without a content script or sync writes', async () => {
  const provider = new BrowserSyncFolderProvider()
  const first = data('First')
  first.folders.push(...Array.from({ length: 220 }, (_, index) => data(crypto.randomUUID(), `extra-${index}`).folders[0]))
  await provider.publish(await publication('first', first), async () => undefined)
  expect((storage.values.get(browserSyncManifestKey(scopeA)) as { chunkCount: number }).chunkCount).toBeGreaterThan(1)
  const second = await publication('second', data('Second', 'second-folder'), scopeB)
  second.settings = { enabled: false, hideOrganizedChats: true }
  await provider.publish(second, async () => undefined)
  vi.mocked(browser.storage.sync.set).mockClear()
  startFoldersBackground()
  const repo = repository()
  await vi.waitFor(async () => {
    expect((await repo.listFolders(scopeA)).find((folder) => folder.name === 'First')).toBeDefined()
    expect(await repo.listFolders(scopeA)).toHaveLength(221)
    expect((await repo.listFolders(scopeB))[0]?.name).toBe('Second')
  })
  expect(await repo.getSettings(scopeB)).toMatchObject(second.settings)
  expect(browser.storage.sync.set).not.toHaveBeenCalled()
  expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(2)
})

it('waits quietly for a chunk-only replica and restores it when the manifest arrives', async () => {
  await new BrowserSyncFolderProvider({ getDeviceId: async () => 'foreign-device' }).publish(await publication('arriving', data('Arrived')), async () => undefined)
  const key = browserSyncManifestKey(scopeA)
  const manifest = storage.values.get(key)
  storage.values.delete(key)
  vi.mocked(browser.storage.sync.set).mockClear()
  await start()
  const repo = repository()
  await vi.waitFor(async () => expect(await repo.getSyncState(scopeA)).toBeDefined())
  expect(await repo.listFolders(scopeA)).toEqual([])
  expect(browser.storage.sync.set).not.toHaveBeenCalled()
  expect(browser.alarms.create).not.toHaveBeenCalled()
  storage.values.set(key, manifest)
  storage.onChanged?.({ [key]: { newValue: manifest } })
  await vi.waitFor(async () => expect((await repo.listFolders(scopeA))[0]?.name).toBe('Arrived'))
  expect(browser.storage.sync.set).not.toHaveBeenCalled()
})

it('keeps local pending work and RPC available when the initial Sync scan fails', async () => {
  const repo = repository()
  await repo.createFolder(scopeA, { name: 'Pending local work' })
  vi.spyOn(browser.storage.sync, 'get').mockRejectedValueOnce(new Error('Scan failed'))
  await start()
  await vi.waitFor(async () => expect((await repo.getSyncState(scopeA))?.dirty).toBe(false))
  expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'Pending local work' }] } })
})

it('coalesces overlapping lifecycle scans and releases the scan after completion', async () => {
  let finish!: (values: Record<string, unknown>) => void
  const get = vi.spyOn(browser.storage.sync, 'get').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const scanning = start()
  storage.startup?.()
  storage.startup?.()
  expect(get.mock.calls.filter(([keys]) => keys === null)).toHaveLength(1)
  finish({})
  await scanning
  storage.startup?.()
  await vi.waitFor(() => expect(get.mock.calls.filter(([keys]) => keys === null)).toHaveLength(2))
})
