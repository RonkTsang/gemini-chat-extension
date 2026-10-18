import { storage, scopeA, scopeB, publication, data, emptyData, resetStorage } from './test-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { db } from '@/data/db'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { BrowserSyncFolderProvider, browserSyncManifestKey, browserSyncChunkKey } from './providers/browser-sync'
import { FolderSyncCoordinator } from './coordinator'
import { decodeLzStringBase64 } from './codec'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'

const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'device-test' })
const remote = async (id: string, organization = emptyData, baseSnapshotId?: string, accountScopeId = scopeA) => {
  await new BrowserSyncFolderProvider().publish(await publication(id, organization, accountScopeId, baseSnapshotId), async () => undefined)
}
beforeEach(resetStorage)

describe('whole snapshot decisions', () => {
  it('publishes the first real edit automatically after both Sync and all Folder tables are reset', async () => {
    const priorRepo = repository()
    await priorRepo.createFolder(scopeA, { name: 'Before reset' })
    await new FolderSyncCoordinator(priorRepo).sync(scopeA)
    const oldBase = (await priorRepo.getSyncState(scopeA))!.baseSnapshotId
    storage.values.clear()
    await Promise.all(db.tables.filter((table) => table.name.startsWith('folder')).map((table) => table.clear()))
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    expect(await sync.sync(scopeA)).toEqual({ outcome: 'deferred' })
    expect((await repo.getSyncState(scopeA))?.baseSnapshotId).toBeUndefined()
    await repo.createFolderAndAddChat(scopeA, { name: 'After reset' }, 'chat-1', 'Retained title')
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect((await repo.getSyncState(scopeA))?.baseSnapshotId).not.toBe(oldBase)
    expect((await repo.getSyncState(scopeA))?.browserSyncWarning).toBeUndefined()
    expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', data: {
      folders: [{ name: 'After reset' }], memberships: [{ chatId: 'chat-1' }], chatReferences: [{ cachedTitle: 'Retained title' }],
    } })
  })

  it('recreates a missing replica only after explicit intent and retains all local organization and settings', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.createFolderAndAddChat(scopeA, { name: 'Keep local' }, 'chat-1', 'Title')
    await repo.updateSettings(scopeA, { hideOrganizedChats: true })
    await sync.sync(scopeA)
    const prior = (await repo.getSyncState(scopeA))!
    const before = await repo.getAccountData(scopeA)
    storage.values.clear()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect(storage.values.size).toBe(0)
    expect(await sync.recreateMissingReplica(scopeA, { expectedRevision: prior.localDataRevision, baseSnapshotId: prior.baseSnapshotId! }))
      .toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(await repo.getAccountData(scopeA)).toEqual(before)
    expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete',
      manifest: { settings: { hideOrganizedChats: true } }, data: before })
    expect((await repo.getSyncState(scopeA))?.baseSnapshotId).not.toBe(prior.baseSnapshotId)
    expect((await repo.getSyncState(scopeA))?.browserSyncWarning).toBeUndefined()
  })

  it('persists recreation intent across quota failure and resumes it with ordinary retry', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.createFolder(scopeA, { name: 'Retained' }); await sync.sync(scopeA)
    const state = (await repo.getSyncState(scopeA))!
    storage.values.clear(); storage.quotaBytes = 100
    expect(await sync.recreateMissingReplica(scopeA, { expectedRevision: state.localDataRevision, baseSnapshotId: state.baseSnapshotId! }))
      .toMatchObject({ outcome: 'failed' })
    expect((await repo.getSyncState(scopeA))?.dirty).toBe(true)
    expect((await repo.getBrowserSyncPublication(scopeA))?.state).toBe('prepared')
    storage.quotaBytes = 100 * 1024
    expect(await new FolderSyncCoordinator(repository()).sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Retained')
  })

  it.each(['edit', 'remote', 'future', 'orphan'] as const)('protects data when %s changes the conditions for recreation', async (change) => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.createFolder(scopeA, { name: 'Local' }); await sync.sync(scopeA)
    const state = (await repo.getSyncState(scopeA))!
    storage.values.clear()
    if (change === 'edit') await repo.createFolder(scopeA, { name: 'New edit' })
    if (change === 'remote') await remote('late-arrival', data('Other device'))
    if (change === 'future') storage.values.set(browserSyncManifestKey(scopeA), { accountScopeId: scopeA, schemaVersion: 5 })
    if (change === 'orphan') storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'arriving', payload: 'partial' })
    const before = [...storage.values]
    expect(await sync.recreateMissingReplica(scopeA, { expectedRevision: state.localDataRevision, baseSnapshotId: state.baseSnapshotId! }))
      .toMatchObject({ outcome: change === 'future' ? 'failed' : 'deferred' })
    expect([...storage.values]).toEqual(before)
    expect((await repo.listFolders(scopeA)).some((row) => row.name === 'Local')).toBe(true)
    expect((await repo.getSyncState(scopeA))?.baseSnapshotId).toBe(state.baseSnapshotId)
  })

  it('protects a replica arriving after recreation was prepared and reconciles it as a conflict', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.createFolder(scopeA, { name: 'Local' }); await sync.sync(scopeA)
    const state = (await repo.getSyncState(scopeA))!
    storage.values.clear()
    const prepare = repo.prepareBrowserSyncRecreation.bind(repo)
    vi.spyOn(repo, 'prepareBrowserSyncRecreation').mockImplementationOnce(async (...args) => {
      const result = await prepare(...args)
      await remote('late-arrival', data('Remote'))
      return result
    })
    expect(await sync.recreateMissingReplica(scopeA, { expectedRevision: state.localDataRevision, baseSnapshotId: state.baseSnapshotId! }))
      .toMatchObject({ outcome: 'deferred' })
    expect(await sync.sync(scopeA)).toEqual({ outcome: 'conflict' })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Local')
    expect((await repo.getBrowserSyncConflict(scopeA))?.manifest.snapshotId).toBe('late-arrival')
  })

  it('repairs cleared local organization and settings even when the same snapshot remains the recorded base', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    const saved = await publication('saved', data('Saved'))
    saved.settings = { enabled: false, hideOrganizedChats: true }
    await new BrowserSyncFolderProvider().publish(saved, async () => undefined)
    await sync.sync(scopeA)
    const appliedRevision = (await repo.getSyncState(scopeA))!.localDataRevision
    await db.folders.clear()
    await db.folder_settings.clear()
    vi.mocked(browser.storage.sync.set).mockClear()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Saved')
    expect(await repo.getSettings(scopeA)).toMatchObject(saved.settings)
    expect((await repo.getSyncState(scopeA))?.localDataRevision).not.toBe(appliedRevision)
    expect(browser.storage.sync.set).not.toHaveBeenCalled()
    const repairedRevision = (await repo.getSyncState(scopeA))!.localDataRevision
    await sync.sync(scopeA)
    expect((await repo.getSyncState(scopeA))?.localDataRevision).toBe(repairedRevision)
  })

  it('does not publish defaults or retry while waiting for a first remote snapshot', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.getSettings(scopeA)
    vi.mocked(browser.storage.sync.set).mockClear()
    for (const storageOnly of [false, true]) {
      expect(await sync.sync(scopeA, undefined, storageOnly)).toEqual({ outcome: 'deferred' })
      expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
      expect((await repo.getSyncState(scopeA))?.retryAt).toBeUndefined()
      expect(await repo.getBrowserSyncPublication(scopeA)).toBeUndefined()
      expect((await new FolderQueryService().getSyncStatus(scopeA)).state).toBe('idle')
    }
    storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'arriving', payload: 'partial' })
    expect(await sync.sync(scopeA)).toEqual({ outcome: 'deferred' })
    expect(browser.storage.sync.set).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(1)
  })

  it('keeps local edits, settings and writing publications when the shared key has a future schema', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await repo.createFolder(scopeA, { name: 'Offline work' })
    await repo.updateSettings(scopeA, { enabled: false })
    const pending = await repo.getOrCreateBrowserSyncPublication(scopeA)
    await repo.markBrowserSyncPublicationWriting(scopeA, pending.id)
    await repo.recordBrowserSyncFailure(scopeA, 'prior failure')
    storage.values.set(browserSyncManifestKey(scopeA), { accountScopeId: scopeA, schemaVersion: 5 })
    const before = [...storage.values]
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await sync.sync(scopeA)).toEqual({ outcome: 'failed', retryAt: undefined })
      expect((await repo.getSyncState(scopeA))).toMatchObject({ dirty: true, browserSyncWarning: 'unsupported-schema-version', retryCount: 0 })
      expect((await repo.getSyncState(scopeA))?.retryAt).toBeUndefined()
      expect((await repo.getBrowserSyncPublication(scopeA))?.id).toBe(pending.id)
      expect((await repo.listFolders(scopeA))[0].name).toBe('Offline work')
      expect((await repo.getSettings(scopeA)).enabled).toBe(false)
      expect([...storage.values]).toEqual(before)
    }
  })

  it('restores an existing remote snapshot into a fresh account without publishing, then accepts explicit remote deletion', async () => {
    const repo = repository()
    const sync = new FolderSyncCoordinator(repo)
    await remote('remote-old', data('Old'))
    vi.mocked(browser.storage.sync.set).mockClear()
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect(browser.storage.sync.set).not.toHaveBeenCalled()
    expect((await repo.listFolders(scopeA))[0].name).toBe('Old')
    await remote('deleted', emptyData, 'remote-old')
    await sync.sync(scopeA)
    expect(await repo.getAccountData(scopeA)).toMatchObject(emptyData)
    expect((await repo.listSnapshots(scopeA)).some((row) => row.reasons?.includes('before-sync'))).toBe(true)
    await remote('another-clean-empty', emptyData, 'deleted')
    await sync.sync(scopeA)
    expect(await repo.listFolders(scopeA)).toEqual([])
    expect(await db.folder_sync_publications.count()).toBe(0)
    expect(await db.folder_sync_conflicts.count()).toBe(0)
  })

  it.each(['missing', 'mixed', 'corrupt', 'hash'])('keeps all data and settings intact when incoming storage is %s', async (mode) => {
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Local' })
    const sync = new FolderSyncCoordinator(repo)
    await sync.sync(scopeA)
    const id = (await repo.getSyncState(scopeA))!.baseSnapshotId!
    const before = await repo.getAccountData(scopeA)
    const settings = await repo.getSettings(scopeA)
    const key = browserSyncManifestKey(scopeA)
    const manifest = storage.values.get(key) as Record<string, unknown>
    storage.values.set(key, { ...manifest, settings: { enabled: false, hideOrganizedChats: true } })
    if (mode === 'missing') storage.values.delete(browserSyncChunkKey(scopeA, 0))
    if (mode === 'mixed') storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'other', payload: 'x' })
    if (mode === 'corrupt') storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: id, payload: 'x' })
    if (mode === 'hash') storage.values.set(key, { ...manifest, payloadHash: '0'.repeat(64) })
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect(await repo.getAccountData(scopeA)).toEqual(before)
    expect(await repo.getSettings(scopeA)).toEqual(settings)
  })

  it('rejects disappearance of a known base and clears stale warnings after that same replica heals', async () => {
    const repo = repository()
    const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA)
    const values = [...storage.values]
    storage.values.clear()
    await repo.createFolder(scopeA, { name: 'Offline' })
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect(storage.values.size).toBe(0)
    expect((await repo.getSyncState(scopeA))?.browserSyncWarning).toBe('missing-replica')
    values.forEach(([key, value]) => storage.values.set(key, value))
    await sync.sync(scopeA)
    await repo.recordBrowserSyncFailure(scopeA, 'past', 'invalid-replica')
    await sync.sync(scopeA)
    const healed = (await repo.getSyncState(scopeA))!
    expect(healed.dirty).toBe(false); expect(healed.browserSyncWarning).toBeUndefined()
    expect(healed.retryAt).toBeUndefined(); expect(healed.lastErrorCode).toBeUndefined()
  })

  it.each(['remote', 'local'] as const)('preserves divergent versions and resolves with %s without union', async (choice) => {
    const repo = repository()
    const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA)
    const base = (await repo.getSyncState(scopeA))!.baseSnapshotId!
    await repo.createFolder(scopeA, { name: 'Local' })
    await remote('remote-new', data('Remote', 'remote-folder'), base)
    expect(await sync.sync(scopeA)).toEqual({ outcome: 'conflict' })
    expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual(['Local'])
    const candidate = (await repo.getBrowserSyncConflict(scopeA))!
    expect(await sync.resolveConflict(scopeA, choice, candidate.localRevision, candidate.manifest.snapshotId)).toMatchObject({ outcome: 'accepted-by-browser-storage' })
    expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual([choice === 'remote' ? 'Remote' : 'Local'])
    const points = await repo.listSnapshots(scopeA)
    const savedNames = points.flatMap((row) => decodeLzStringBase64<{ folders: { name: string }[] }>(row.compressedPayload).folders.map((folder) => folder.name))
    expect(savedNames).toContain('Remote'); expect(savedNames).toContain('Local')
    expect(points.length).toBeLessThanOrEqual(10)
    expect(await repo.getBrowserSyncConflict(scopeA)).toBeUndefined()
    expect(await db.folder_sync_publications.count()).toBe(0)
    expect((await repo.getSyncState(scopeA))!.dirty).toBe(false)
    if (choice === 'local') {
      const replica = await new BrowserSyncFolderProvider().read(scopeA)
      expect(replica).toMatchObject({ status: 'complete', manifest: { baseSnapshotId: 'remote-new' }, data: { folders: [{ name: 'Local' }] } })
    }
  })

  it.each(['remote', 'local'] as const)('blocks %s choice when protection cannot be saved', async (choice) => {
    const repo = repository()
    const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA)
    await repo.createFolder(scopeA, { name: 'Local' })
    await remote('remote', data('Remote'), (await repo.getSyncState(scopeA))?.baseSnapshotId)
    await sync.sync(scopeA)
    const candidate = (await repo.getBrowserSyncConflict(scopeA))!
    const before = [...storage.values]
    const put = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new Error('Disk full'))
    expect(await sync.resolveConflict(scopeA, choice, candidate.localRevision, 'remote')).toMatchObject({ outcome: 'failed' })
    put.mockRestore()
    expect((await repo.listFolders(scopeA))[0].name).toBe('Local')
    expect(await repo.getBrowserSyncConflict(scopeA)).toEqual(candidate)
    expect([...storage.values]).toEqual(before)
    expect((await repo.getSyncState(scopeA))?.browserSyncWarning).toBe('recovery-protection-failed')
  })

  it('rejects stale choice and refreshes a changed candidate before applying a selection', async () => {
    const repo = repository()
    const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA)
    await repo.createFolder(scopeA, { name: 'Local' })
    await remote('remote-1', data('Remote one'), (await repo.getSyncState(scopeA))?.baseSnapshotId)
    await sync.sync(scopeA)
    const candidate = (await repo.getBrowserSyncConflict(scopeA))!
    await remote('remote-2', data('Remote two'), 'remote-1')
    expect(await sync.resolveConflict(scopeA, 'remote', candidate.localRevision, 'remote-1')).toEqual({ outcome: 'conflict' })
    expect((await repo.getBrowserSyncConflict(scopeA))!.manifest.snapshotId).toBe('remote-2')
    await repo.createFolder(scopeA, { name: 'New edit' })
    expect(await sync.resolveConflict(scopeA, 'remote', candidate.localRevision, 'remote-2')).toEqual({ outcome: 'deferred' })
    expect(await repo.listFolders(scopeA)).toHaveLength(2)
    await sync.sync(scopeA)
    expect((await repo.getBrowserSyncConflict(scopeA))!.localRevision).toBe((await repo.getSyncState(scopeA))!.localDataRevision)
    expect(await db.folder_sync_conflicts.count()).toBe(1)
  })

  it('refreshes candidate content when the same ID has a different manifest', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA); await repo.createFolder(scopeA, { name: 'Local' })
    await remote('candidate', data('Remote'), (await repo.getSyncState(scopeA))?.baseSnapshotId)
    await sync.sync(scopeA)
    const key = browserSyncManifestKey(scopeA)
    storage.values.set(key, { ...(storage.values.get(key) as object), settings: { enabled: false, hideOrganizedChats: true } })
    await sync.sync(scopeA)
    expect((await repo.getBrowserSyncConflict(scopeA))!.manifest.settings.enabled).toBe(false)
  })

  it('retains edits and synchronized settings made during publication as dirty', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    const first = await repo.createFolder(scopeA, { name: 'Captured' })
    storage.onSet = async () => {
      storage.onSet = undefined
      await repo.updateFolder(scopeA, first.data.id, { name: 'New edit' })
      await repo.updateSettings(scopeA, { enabled: false })
    }
    await sync.sync(scopeA)
    expect((await repo.getSyncState(scopeA))!.dirty).toBe(true)
    expect(await repo.getSettings(scopeA)).toMatchObject({ enabled: false })
    expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', manifest: { settings: { enabled: true } }, data: { folders: [{ name: 'Captured' }] } })
    await sync.sync(scopeA)
    expect((await repo.getSyncState(scopeA))!.dirty).toBe(false)
    expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', manifest: { settings: { enabled: false } }, data: { folders: [{ name: 'New edit' }] } })
  })

  it('reuses interrupted fixed-write identity across restart, then publishes later edits separately', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    const first = await repo.createFolder(scopeA, { name: 'Before' }); await sync.sync(scopeA)
    await repo.updateFolder(scopeA, first.data.id, { name: 'Captured' })
    storage.failAfterItems = 1
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    const pending = (await repo.getBrowserSyncPublication(scopeA))!
    expect(pending.state).toBe('writing')
    expect((await new BrowserSyncFolderProvider().read(scopeA)).status).toBe('incomplete')
    await repo.updateFolder(scopeA, first.data.id, { name: 'Later' })
    storage.failAfterItems = undefined
    const restarted = new FolderSyncCoordinator(repository())
    await restarted.sync(scopeA)
    expect((await repo.getSyncState(scopeA))?.baseSnapshotId).toBe(pending.id)
    expect((await repo.getSyncState(scopeA))?.dirty).toBe(true)
    await restarted.sync(scopeA)
    expect((await repo.getSyncState(scopeA))?.dirty).toBe(false)
    expect(await db.folder_sync_publications.count()).toBe(0)
    expect(await new BrowserSyncFolderProvider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [{ name: 'Later' }] } })
  })

  it('does not overwrite unrelated incomplete replica or settings, and quota rejection keeps current keys', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA); await repo.createFolder(scopeA, { name: 'Local' })
    const before = [...storage.values]
    storage.quotaBytes = 100
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect([...storage.values]).toEqual(before)
    expect((await repo.getBrowserSyncPublication(scopeA))!.state).toBe('prepared')
    storage.quotaBytes = 100 * 1024
    const key = browserSyncManifestKey(scopeA)
    storage.values.set(key, { ...(storage.values.get(key) as object), snapshotId: 'unrelated' })
    const incomplete = [...storage.values]
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect([...storage.values]).toEqual(incomplete)
  })

  it('prevents remote collisions from overwriting another account', async () => {
    const repo = repository(); const foreign = await repo.createFolderAndAddChat(scopeB, { name: 'Foreign' }, 'chat')
    const sync = new FolderSyncCoordinator(repo)
    await remote('malicious', data('Relabeled', foreign.data.folder.id))
    const before = await repo.getAccountData(scopeB)
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'failed' })
    expect(await repo.getAccountData(scopeB)).toEqual(before)
    expect(await repo.listFolders(scopeA)).toEqual([])
  })

  it('rejects a stale revision during protection before applying remote data', async () => {
    const repo = repository(); const sync = new FolderSyncCoordinator(repo)
    await remote('base')
    await sync.sync(scopeA)
    await remote('remote-1', data('Remote'), (await repo.getSyncState(scopeA))?.baseSnapshotId)
    const save = repo.createSnapshot.bind(repo)
    vi.spyOn(repo, 'createSnapshot').mockImplementationOnce(async (...args) => {
      await repo.createFolder(scopeA, { name: 'Concurrent edit' }); return save(...args)
    })
    expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'deferred' })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Concurrent edit')
    expect((await repo.getSyncState(scopeA))?.dirty).toBe(true)
  })

  it('returns lease deferral rather than silently consuming durable pending work', async () => {
    const repo = repository(); await repo.createFolder(scopeA, { name: 'Pending' })
    const held = await repo.acquireCoordinatorLease(scopeA, 'other', 60_000)
    expect(await new FolderSyncCoordinator(repo).sync(scopeA)).toEqual({ outcome: 'busy', retryAt: held.expiresAt })
    expect(await repo.listBrowserSyncWakeScopes()).toContain(scopeA)
    expect((await new FolderQueryService().getSyncStatus(scopeA)).state).toBe('local-changes-pending')
  })
})

it('does not repair foreign mixed chunks merely because a writing marker and base manifest exist', async () => {
  const repo = repository(); const sync = new FolderSyncCoordinator(repo)
  await repo.createFolder(scopeA, { name: 'Base' }); await sync.sync(scopeA)
  await repo.createFolder(scopeA, { name: 'Pending' })
  const pending = await repo.getOrCreateBrowserSyncPublication(scopeA)
  await repo.markBrowserSyncPublicationWriting(scopeA, pending.id)
  storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'third-device-writing', payload: 'partial' })
  const before = [...storage.values]
  expect(await sync.sync(scopeA)).toMatchObject({ outcome: 'deferred' })
  expect([...storage.values]).toEqual(before)
  expect((await repo.getBrowserSyncPublication(scopeA))!.id).toBe(pending.id)
})
