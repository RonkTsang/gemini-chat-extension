import { data, emptyData, publication, resetStorage, scopeA, scopeB, storage } from './test-storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'

import { db } from '@/data/db'
import { folderAccessMiddleware, type FolderAccessReport } from '@/data/folder-access'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { decodeLzStringBase64, encodeLzStringBase64, sha256Hex } from './codec'
import { observeFolderIndexedDB } from '@/test/folder-idb-observer'
import { FolderSyncCoordinator } from './coordinator'
import { BrowserSyncFolderProvider, browserSyncChunkKey, browserSyncManifestKey } from './providers/browser-sync'

const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'sync-performance' })
const provider = () => new BrowserSyncFolderProvider()
let native: ReturnType<typeof observeFolderIndexedDB> | undefined
let debug: ReturnType<typeof vi.spyOn>
beforeEach(async () => {
  await resetStorage()
  debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(async () => {
  native?.stop(); native = undefined
  vi.unstubAllEnvs(); vi.restoreAllMocks()
  db.close(); db.use(folderAccessMiddleware); await db.open()
})

async function remote(id: string, name = id, base?: string) {
  await provider().publish(await publication(id, data(name), scopeA, base), async () => undefined)
  const result = await provider().read(scopeA)
  if (result.status !== 'complete') throw new Error('Invalid test remote')
  return result
}
function fullCaptures() {
  return [...native!.transactions.keys()].filter((transaction) => transaction.mode === 'readonly'
    && ['folders', 'folder_memberships', 'folder_chat_references'].every((name) => transaction.objectStoreNames.contains(name)))
}
function expectNoOrganizationReads() {
  for (const name of ['folders', 'folder_memberships', 'folder_chat_references']) expect(native!.tables[name]?.records ?? 0).toBe(0)
  expect(fullCaptures()).toHaveLength(0)
}
function reports(): FolderAccessReport[] {
  return debug.mock.calls.filter(([label]: unknown[]) => label === '[Folders][data-access]')
    .map(([, value]: unknown[]) => JSON.parse(String(value)) as FolderAccessReport)
}

describe('Sync capture reuse and commit guards', () => {
  it.each(['prepared', 'writing'] as const)('reuses a %s publication without reading organization records', async (state) => {
    const repo = repository()
    const folder = await repo.createFolderAndAddChat(scopeA, { name: 'Captured' }, 'chat', 'PRIVATE-TITLE')
    const saved = await repo.getOrCreateBrowserSyncPublication(scopeA)
    if (state === 'writing') {
      await repo.markBrowserSyncPublicationWriting(scopeA, saved.id)
      await repo.updateFolder(scopeA, folder.data.folder.id, { name: 'Newer' })
    }
    native = observeFolderIndexedDB()
    expect(await repo.getOrCreateBrowserSyncPublication(scopeA)).toEqual({ ...saved, state })
    expectNoOrganizationReads()
  })

  it.each(['hash', 'schema'] as const)('still rejects a reusable publication with an invalid %s', async (failure) => {
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Local' })
    const point = await repo.getOrCreateBrowserSyncPublication(scopeA)
    const payload = failure === 'schema' ? encodeLzStringBase64({ folders: [] }) : point.payload
    await db.folder_sync_publications.update(scopeA, { payload, payloadHash: failure === 'schema' ? await sha256Hex(payload) : '0'.repeat(64) })
    native = observeFolderIndexedDB()
    await expect(repo.getOrCreateBrowserSyncPublication(scopeA)).rejects.toThrow()
    expectNoOrganizationReads()
  })

  it.each(['absent', 'publish', 'apply', 'repair', 'clean'] as const)('%s stable path captures local organization once', async (mode) => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    if (mode === 'absent' || mode === 'publish') {
      const folder = await repo.createFolderAndAddChat(scopeA, { name: 'First' }, 'chat', 'PRIVATE-TITLE')
      if (mode === 'publish') {
        await sync.sync(scopeA)
        await repo.updateFolder(scopeA, folder.data.folder.id, { name: 'Changed' })
      }
    } else {
      await remote('base')
      await sync.sync(scopeA)
      if (mode === 'apply') await remote('next', 'Next', 'base')
      if (mode === 'repair') await db.folders.clear()
    }
    native = observeFolderIndexedDB(); debug.mockClear()
    const capture = vi.spyOn(repo, 'captureBrowserSyncData')
    const genericCapture = vi.spyOn(repo, 'getAccountDataWithRevision')
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(fullCaptures()).toHaveLength(1)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(genericCapture).not.toHaveBeenCalled()
    expect(reports().filter((report) => report.operation === 'captureBrowserSyncData')).toHaveLength(1)
    expect(JSON.stringify(reports())).not.toContain('PRIVATE-TITLE')
    if (mode === 'apply') expect((await repo.getAccountData(scopeA)).folders[0].name).toBe('Next')
    if (mode === 'repair') expect((await repo.getAccountData(scopeA)).folders[0].name).toBe('base')
  })

  it.each(['absent', 'incomplete', 'invalid'] as const)('does not capture or overwrite local data when a known replica is %s', async (status) => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    const incoming = await remote('base')
    await sync.sync(scopeA)
    if (status === 'absent') storage.values.clear()
    if (status === 'incomplete') storage.values.delete(browserSyncChunkKey(scopeA, 0))
    if (status === 'invalid') storage.values.set(browserSyncManifestKey(scopeA), { ...incoming.manifest, payloadHash: '0'.repeat(64) })
    const before = [...storage.values]
    native = observeFolderIndexedDB()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expectNoOrganizationReads()
    expect([...storage.values]).toEqual(before)
    expect(native.tables.folders?.writes ?? 0).toBe(0)
  })

  it('finishes an interrupted writing snapshot before capturing later edits', async () => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    const folder = await repo.createFolder(scopeA, { name: 'Original' })
    const pending = await repo.getOrCreateBrowserSyncPublication(scopeA)
    await repo.markBrowserSyncPublicationWriting(scopeA, pending.id)
    await repo.updateFolder(scopeA, folder.data.id, { name: 'Later' })
    native = observeFolderIndexedDB()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage', retryAt: expect.any(String) })
    expectNoOrganizationReads()
    expect(await provider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'Original' }] } })
    native.reset()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(fullCaptures()).toHaveLength(1)
    expect(await provider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'Later' }] } })
  })

  it.each(['local', 'remote'] as const)('resolves %s with one capture while retaining both protection versions', async (choice) => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    await remote('base'); await sync.sync(scopeA)
    await repo.createFolder(scopeA, { name: 'Local' })
    await remote('other', 'Remote', 'base'); await sync.sync(scopeA)
    const candidate = (await repo.getBrowserSyncConflict(scopeA))!
    native = observeFolderIndexedDB()
    expect(await sync.resolveConflict(scopeA, choice, candidate.localRevision, candidate.manifest.snapshotId))
      .toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(fullCaptures()).toHaveLength(1)
    const points = await db.folder_snapshot_payloads.toArray()
    const names = points.flatMap((point) => decodeLzStringBase64<{ folders: { name: string }[] }>(point.compressedPayload).folders.map((folder) => folder.name))
    expect(names).toEqual(expect.arrayContaining(['Local', 'Remote']))
    expect(await repo.getBrowserSyncConflict(scopeA)).toBeUndefined()
  })

  it.each(['revision', 'base', 'settings', 'publication', 'conflict'] as const)('rejects remote apply if %s changes after capture, without a second capture', async (change) => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    await remote('base'); await sync.sync(scopeA)
    const incoming = await remote('next', 'Incoming', 'base')
    const captured = await repo.captureBrowserSyncData(scopeA)
    const create = repo.createSnapshot.bind(repo)
    vi.spyOn(repo, 'createSnapshot').mockImplementationOnce(async (...args) => {
      const result = await create(...args)
      if (change === 'revision') await repo.createFolder(scopeA, { name: 'Concurrent edit' })
      if (change === 'base') await db.folder_sync_states.update(scopeA, { baseSnapshotId: 'other-base' })
      if (change === 'settings') await db.folder_settings.update(scopeA, { enabled: !captured.settings.enabled })
      if (change === 'publication') await db.folder_sync_publications.put(await publication('concurrent', emptyData))
      if (change === 'conflict') await repo.recordBrowserSyncConflict(scopeA, incoming.data, incoming.manifest, captured.dataRevision)
      return result
    })
    native = observeFolderIndexedDB()
    expect(await repo.applyBrowserSyncSnapshot(scopeA, incoming.data, incoming.manifest, captured.dataRevision, false, captured)).toBe(false)
    expect(fullCaptures()).toHaveLength(0)
    if (change !== 'revision') expectNoOrganizationReads()
    expect((await repo.getAccountData(scopeA)).folders.some((folder) => folder.name === 'Incoming')).toBe(false)
  })

  it('preserves new collapse preferences while applying a capture whose sync settings still match', async () => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    await remote('base'); await sync.sync(scopeA)
    const incoming = await remote('next', 'Incoming', 'base')
    const captured = await repo.captureBrowserSyncData(scopeA)
    await repo.updateSettings(scopeA, { collapsedFolderIds: ['folder-1'] })
    native = observeFolderIndexedDB()
    expect(await repo.applyBrowserSyncSnapshot(scopeA, incoming.data, incoming.manifest, captured.dataRevision, false, captured)).toBe(true)
    expect(fullCaptures()).toHaveLength(0)
    expect((await repo.getSettings(scopeA)).collapsedFolderIds).toEqual(['folder-1'])
  })

  it('retries a publication after an edit during hashing, with matched data/settings/revision', async () => {
    const repo = repository()
    const folder = await repo.createFolder(scopeA, { name: 'Before' })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    let changed = false
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      expect(Dexie.currentTransaction).toBeFalsy()
      if (!changed) {
        changed = true
        await repo.updateFolder(scopeA, folder.data.id, { name: 'After' })
        await repo.updateSettings(scopeA, { hideOrganizedChats: true })
      }
      return digest(...args)
    })
    native = observeFolderIndexedDB()
    const pending = await repo.getOrCreateBrowserSyncPublication(scopeA)
    expect(fullCaptures()).toHaveLength(2)
    expect(decodeLzStringBase64(pending.payload)).toMatchObject({ folders: [{ name: 'After' }] })
    expect(pending.settings.hideOrganizedChats).toBe(true)
    expect(pending.dataRevision).toBe((await repo.getSyncState(scopeA))!.localDataRevision)
  })

  it('never overwrites a publication that becomes writing during hashing', async () => {
    const repo = repository()
    const folder = await repo.createFolder(scopeA, { name: 'Before' })
    const original = await repo.getOrCreateBrowserSyncPublication(scopeA)
    await repo.updateFolder(scopeA, folder.data.id, { name: 'After' })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    let changed = false
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (!changed) { changed = true; await repo.markBrowserSyncPublicationWriting(scopeA, original.id) }
      return digest(...args)
    })
    expect(await repo.getOrCreateBrowserSyncPublication(scopeA)).toEqual({ ...original, state: 'writing' })
    expect(await repo.getBrowserSyncPublication(scopeA)).toEqual({ ...original, state: 'writing' })
  })

  it('bounds publication retries at three captures if edits keep invalidating the version', async () => {
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Local' })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    let version = 0
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      await db.folder_sync_states.update(scopeA, { localDataRevision: `concurrent:${++version}` })
      return digest(...args)
    })
    native = observeFolderIndexedDB()
    await expect(repo.getOrCreateBrowserSyncPublication(scopeA)).rejects.toThrow('STALE_REVISION')
    expect(fullCaptures()).toHaveLength(3)
    expect(await repo.getBrowserSyncPublication(scopeA)).toBeUndefined()
  })

  it('rejects reuse of a capture from another account', async () => {
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'A' })
    await repo.createFolder(scopeB, { name: 'B' })
    const captured = await repo.captureBrowserSyncData(scopeA)
    native = observeFolderIndexedDB()
    await expect(repo.getOrCreateBrowserSyncPublication(scopeB, captured)).rejects.toThrow('different account')
    expectNoOrganizationReads()
    expect(await repo.getBrowserSyncPublication(scopeB)).toBeUndefined()
  })

  it('keeps a warning if the healthy decision becomes stale without a revision change', async () => {
    const repo = repository(), sync = new FolderSyncCoordinator(repo)
    await remote('base'); await sync.sync(scopeA)
    await repo.recordBrowserSyncFailure(scopeA, 'warning')
    const captured = await repo.captureBrowserSyncData(scopeA)
    await db.folder_sync_publications.put(await publication('concurrent', data('Concurrent')))
    expect(await repo.recordBrowserSyncHealthy(scopeA, 'base', captured.dataRevision, captured)).toBe(false)
    expect((await repo.getSyncState(scopeA))?.lastErrorCode).toBe('warning')
  })

  it('discovers pending account scopes using publication keys only and retains provider filtering', async () => {
    const repo = repository()
    for (const scope of [scopeA, scopeB]) {
      await repo.createFolder(scope, { name: 'Local' })
      await repo.getOrCreateBrowserSyncPublication(scope)
      await db.folder_sync_states.update(scope, { dirty: false, baseSnapshotId: 'base', provider: scope === scopeA ? 'browser-sync' : 'google-drive' })
    }
    native = observeFolderIndexedDB()
    expect(await repo.listBrowserSyncWakeScopes()).toEqual([scopeA])
    expect(native.tables.folder_sync_publications.records).toBe(0)
    expect(native.tables.folder_sync_publications.keys).toBe(2)
  })

  it.each([true, false])('DEV=%s: stable publish has one native capture and consistent access reports', async (development) => {
    const repo = repository()
    await repo.createFolderAndAddChat(scopeA, { name: 'Local' }, 'chat', 'PRIVATE-TITLE')
    vi.stubEnv('DEV', development)
    db.close()
    if (!development) db.unuse({ stack: 'dbcore', name: 'FolderAccess' })
    await db.open(); debug.mockClear()
    native = observeFolderIndexedDB()
    expect(await new FolderSyncCoordinator(repo).sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(fullCaptures()).toHaveLength(1)
    if (!development) expect(debug).not.toHaveBeenCalled()
    else {
      const report = reports().find((entry) => entry.operation === 'captureBrowserSyncData')!
      const counts = native.transactions.get(fullCaptures()[0])!
      for (const [name, access] of Object.entries(counts)) {
        expect(report.tables[name]?.records ?? 0).toBe(access.records)
        expect(report.tables[name]?.countRequests ?? 0).toBe(access.countRequests)
      }
    }
  })
})
