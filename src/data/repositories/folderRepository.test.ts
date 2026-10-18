import 'fake-indexeddb/auto'
import { resetStorage, scopeA, scopeB, data, publication } from '@/services/folder-sync/test-storage'
import { parseFolderSyncData } from '@/domain/folder/schemas'
import { FolderRecoveryError } from '@/services/folder-recovery/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { db, GeminiExtensionDB } from '../db'
import { FolderRepositoryImpl } from './folderRepository'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'
import { fromFolderSyncData, decodeLzStringBase64, toFolderSyncData } from '@/services/folder-sync/codec'
import { BrowserSyncFolderProvider } from '@/services/folder-sync/providers/browser-sync'
import { clearRecoveryFailure } from '@/services/folder-recovery/failure-fallback'
import { getLocalStorageStatus } from '@/services/folder-recovery/storage'

const repository = (budgetBytes?: number) => new FolderRepositoryImpl({ getDeviceId: async () => 'test-device' }, budgetBytes ? { budgetBytes } : {})
beforeEach(async () => { await resetStorage(); clearRecoveryFailure(scopeA); clearRecoveryFailure(scopeB) })

describe('Folder local organization', () => {
  it('physically deletes subtrees and relationships, prunes unused references, and can re-add the same chat', async () => {
    const repo = repository()
    const root = await repo.createFolder(scopeA, { name: 'Root' })
    const child = await repo.createFolder(scopeA, { name: 'Child', parentFolderId: root.data.id })
    const other = await repo.createFolder(scopeA, { name: 'Other' })
    const foreign = await repo.createFolder(scopeB, { name: 'Foreign' })
    await repo.upsertMembership(scopeA, { folderId: child.data.id, chatId: 'orphan' })
    await repo.upsertMembership(scopeA, { folderId: child.data.id, chatId: 'shared' })
    await repo.upsertMembership(scopeA, { folderId: other.data.id, chatId: 'shared' })
    await repo.upsertMembership(scopeB, { folderId: foreign.data.id, chatId: 'orphan' })
    await repo.deleteFolder(scopeA, root.data.id)
    expect(await db.folders.get(root.data.id)).toBeUndefined(); expect(await db.folders.get(child.data.id)).toBeUndefined()
    expect(await repo.listMemberships(scopeA)).toHaveLength(1)
    expect((await repo.listChatReferences(scopeA)).map((row) => row.chatId)).toEqual(['shared'])
    expect(await repo.listMemberships(scopeB)).toHaveLength(1)
    const first = await repo.upsertMembership(scopeA, { folderId: other.data.id, chatId: 'orphan' })
    await repo.removeMembership(scopeA, other.data.id, 'orphan')
    expect(await db.folder_memberships.get(first.data.id)).toBeUndefined()
    const next = await repo.upsertMembership(scopeA, { folderId: other.data.id, chatId: 'orphan' })
    expect(next.data.id).toBe(first.data.id)
    expect(next.data.pinnedOrderKey).toBeUndefined()
    const exported = await repo.exportAccountData(scopeA)
    expect(JSON.stringify(exported.data)).not.toMatch(/deletedAt|Version|versionStamp|account-scope/)
  })

  it('moves relationships physically, preserves normal position while pinning, and pages across pin groups', async () => {
    const repo = repository(); const queries = new FolderQueryService()
    const first = await repo.createFolder(scopeA, { name: 'First' }); const second = await repo.createFolder(scopeA, { name: 'Second' })
    const one = await repo.upsertMembership(scopeA, { folderId: first.data.id, chatId: 'one' })
    await repo.upsertMembership(scopeA, { folderId: first.data.id, chatId: 'two' })
    const pinned = await repo.setMembershipPinned(scopeA, first.data.id, 'one', true)
    expect(pinned.data.orderKey).toBe(one.data.orderKey)
    const repeated = await repo.setMembershipPinned(scopeA, first.data.id, 'one', true)
    expect(repeated.commit.effect).toBeUndefined()
    await repo.upsertMembership(scopeA, { folderId: first.data.id, chatId: 'three' })
    const pageOne = await queries.listFolderChats(scopeA, first.data.id, undefined, 1)
    expect(pageOne.items[0].chatId).toBe('one')
    const rest = await queries.listFolderChats(scopeA, first.data.id, pageOne.nextCursor, 20)
    expect(rest.items.map((row) => row.chatId)).toEqual(['three', 'two'])
    await repo.moveMembership(scopeA, first.data.id, 'one', second.data.id)
    expect(await db.folder_memberships.get(one.data.id)).toBeUndefined()
    expect((await repo.listMemberships(scopeA)).find((row) => row.chatId === 'one')?.pinnedOrderKey).toBeUndefined()
  })

  it('backfills generated titles conditionally and rejects stale or deleted edit targets', async () => {
    const repo = repository(); const folder = await repo.createFolderAndAddChat(scopeA, { name: 'Folder' }, 'chat', 'Prompt')
    await repo.upsertChatReference(scopeA, 'chat', 'Generated', 'Prompt')
    await repo.upsertChatReference(scopeA, 'chat', 'User title')
    const prior = await repo.getSyncState(scopeA)
    const ignored = await repo.upsertChatReference(scopeA, 'chat', 'Late', 'Prompt')
    expect(ignored.data.cachedTitle).toBe('User title'); expect(ignored.commit.effect).toBeUndefined()
    await repo.updateFolder(scopeA, folder.data.folder.id, { name: 'Changed' })
    await expect(repo.updateFolder(scopeA, folder.data.folder.id, { name: 'Draft', expectedRevision: prior!.localDataRevision })).rejects.toThrow('STALE_REVISION')
    await expect(repo.upsertChatReference(scopeA, 'chat', 'Draft', undefined, prior!.localDataRevision)).rejects.toThrow('STALE_REVISION')
    await repo.removeMembership(scopeA, folder.data.folder.id, 'chat')
    await expect(repo.upsertChatReference(scopeA, 'chat', 'Must not recreate')).rejects.toThrow('STALE_REVISION')
    expect(await repo.listChatReferences(scopeA)).toEqual([])
  })

  it('shares portable current organization across publications, recovery and exports without account or sync metadata', async () => {
    const repo = repository(); const created = await repo.createFolderAndAddChat(scopeA, { name: 'First' }, 'chat', 'Title')
    await repo.setMembershipPinned(scopeA, created.data.folder.id, 'chat', true)
    const pending = await repo.getOrCreateBrowserSyncPublication(scopeA)
    const snapshot = await repo.createSnapshot(scopeA, 'manual')
    const backup = await repo.exportAccountData(scopeA)
    expect(decodeLzStringBase64(pending.payload)).toEqual(backup.data)
    expect(snapshot.compressedPayload).toBe(pending.payload)
    expect(JSON.stringify(backup.data)).not.toContain(scopeA)
    expect(toFolderSyncData(fromFolderSyncData(scopeA, backup.data))).toEqual(toFolderSyncData(await repo.getAccountData(scopeA)))
  })

  it('synchronized settings change revision/dirty while collapse changes remain local', async () => {
    const repo = repository(); await repo.getSettings(scopeA)
    const prior = (await repo.getSyncState(scopeA))!
    const local = await repo.updateSettings(scopeA, { collapsedFolderIds: ['folder-1'] })
    expect(local.commit.effect).toBe('local-view')
    expect(await repo.getSyncState(scopeA)).toMatchObject({ localDataRevision: prior.localDataRevision, dirty: false })
    const synced = await repo.updateSettings(scopeA, { enabled: false })
    expect(synced.commit.effect).toBe('sync-settings')
    expect(await repo.getSyncState(scopeA)).toMatchObject({ dirty: true, localDataRevision: synced.commit.dataRevision })
    expect(synced.commit.dataRevision).not.toBe(prior.localDataRevision)
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
  })

  it('captures exact settings/revision and supersedes only prepared publications, never interrupted writes', async () => {
    const repo = repository(); const folder = await repo.createFolder(scopeA, { name: 'First' })
    const first = await repo.getOrCreateBrowserSyncPublication(scopeA)
    expect(await repo.getOrCreateBrowserSyncPublication(scopeA)).toEqual(first)
    await repo.updateSettings(scopeA, { enabled: false })
    const next = await repo.getOrCreateBrowserSyncPublication(scopeA)
    expect(next.id).not.toBe(first.id); expect(next.settings.enabled).toBe(false)
    expect(await db.folder_sync_publications.count()).toBe(1)
    await repo.markBrowserSyncPublicationWriting(scopeA, next.id)
    await repo.updateFolder(scopeA, folder.data.id, { name: 'Later' })
    expect(await repo.getOrCreateBrowserSyncPublication(scopeA)).toEqual({ ...next, state: 'writing' })
    await repo.markBrowserSyncPublicationAccepted(scopeA, next.id, { folderBytes: 100, folderBudgetBytes: 70 * 1024, totalBytes: 100, quotaBytes: 100 * 1024, usagePercent: 1 })
    expect((await repo.getSyncState(scopeA))?.dirty).toBe(true)
    expect(await db.folder_sync_publications.count()).toBe(0)
  })

  it('preserves current collapse for surviving incoming folders, applies full switches atomically, and rejects foreign IDs', async () => {
    const repo = repository(); await repo.getSettings(scopeA)
    await repo.updateSettings(scopeA, { collapsedFolderIds: ['folder-1', 'gone'] })
    const next = await publication('remote', data('Remote'))
    next.settings = { enabled: false, hideOrganizedChats: true }
    await new BrowserSyncFolderProvider().publish(next, async () => undefined)
    const incoming = await new BrowserSyncFolderProvider().read(scopeA)
    if (incoming.status !== 'complete') throw new Error('Invalid fixture')
    await repo.applyBrowserSyncSnapshot(scopeA, incoming.data, incoming.manifest, (await repo.getSyncState(scopeA))!.localDataRevision)
    expect(await repo.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: ['folder-1'] })
    const foreign = await repo.createFolder(scopeB, { name: 'Foreign' })
    const before = await repo.getAccountData(scopeB)
    await expect(repo.applyBrowserSyncSnapshot(scopeA, fromFolderSyncData(scopeA, data('Relabeled', foreign.data.id)), { ...incoming.manifest, snapshotId: 'other' }, (await repo.getSyncState(scopeA))!.localDataRevision)).rejects.toThrow('different account')
    expect(await repo.getAccountData(scopeB)).toEqual(before)
  })

  it('enforces normalized names and top placement while allowing validated custom appearance', async () => {
    const repo = repository(); const first = await repo.createFolder(scopeA, { name: ' Ｔｅｓｔ ', colorValue: '#4285F4' })
    expect(first.data).toMatchObject({ name: 'Test', colorValue: '#4285f4' })
    await expect(repo.createFolder(scopeA, { name: 'test' })).rejects.toThrow('already exists')
    await repo.createFolder(scopeA, { name: 'Second' })
    expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual(['Second', 'Test'])
    await expect(repo.createFolder('bad-scope', { name: 'Bad' })).rejects.toThrow('accountScopeId')
  })

  it('protects destructive mutations, retains saved user commits if automatic recovery fails, and restores organization without reverting preferences', async () => {
    const repo = repository(); const limited = repository(50)
    const folder = await repo.createFolder(scopeA, { name: 'Original' })
    const point = await repo.createSnapshot(scopeA, 'manual')
    await repo.updateFolder(scopeA, folder.data.id, { name: 'Edited' })
    await expect(limited.createSnapshot(scopeA, 'automatic')).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Edited')
    await expect(limited.deleteFolder(scopeA, folder.data.id)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    await repo.updateSettings(scopeA, { enabled: false, collapsedFolderIds: [folder.data.id] })
    await repo.restoreSnapshot(scopeA, point.id)
    expect((await repo.listFolders(scopeA))[0].name).toBe('Original')
    expect(await repo.getSettings(scopeA)).toMatchObject({ enabled: false, collapsedFolderIds: [folder.data.id] })
  })

  it('preserves recovery failure classification if the failure status record cannot be persisted', async () => {
    const repo = repository(); await repo.createFolder(scopeA, { name: 'Durable' })
    const snapshotPut = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
    const statusPut = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Status unavailable'))
    await expect(repo.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
    expect((await repo.listFolders(scopeA))[0].name).toBe('Durable')
    snapshotPut.mockRestore(); statusPut.mockRestore()
    await repo.createSnapshot(scopeA, 'manual')
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: undefined, automaticSnapshotFailed: false })
  })

  it('keeps hard sync errors separate from usage measurement and respects capacity dismissal thresholds', async () => {
    const repo = repository(); await repo.getSettings(scopeA)
    await repo.recordBrowserSyncUsage(scopeA, { folderBytes: 850, folderBudgetBytes: 1000, totalBytes: 950, quotaBytes: 2000, usagePercent: 85 })
    const query = new FolderQueryService()
    expect((await query.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)
    await repo.dismissBrowserSyncCapacityNotice(scopeA, 85)
    expect((await query.getSyncStatus(scopeA)).showCapacityNotice).toBe(false)
    await repo.recordBrowserSyncFailure(scopeA, 'quota', 'quota-exceeded')
    await repo.recordBrowserSyncUsage(scopeA, { folderBytes: 900, folderBudgetBytes: 1000, totalBytes: 1000, quotaBytes: 2000, usagePercent: 90 })
    expect((await query.getSyncStatus(scopeA)).warning).toBe('quota-exceeded')
  })

  it('keeps foreign backup records isolated and protected snapshot leases scoped', async () => {
    const repo = repository(); const folder = await repo.createFolderAndAddChat(scopeB, { name: 'Foreign' }, 'chat')
    const backup = await repo.exportAccountData(scopeB)
    await expect(repo.importAccountData(scopeA, backup)).rejects.toThrow('different account scope')
    await expect(repo.importAccountData(scopeA, { ...backup, accountScopeId: scopeA })).rejects.toThrow('different account scope')
    expect((await repo.listMemberships(scopeB))[0].folderId).toBe(folder.data.folder.id)
    const protectedPoint = await repo.createSnapshot(scopeB, 'before-delete', true)
    await repo.releaseSnapshot(scopeA, protectedPoint.id, protectedPoint.protectionToken!)
    expect((await db.folder_snapshots.get(protectedPoint.id))?.protectedUntil).toBeDefined()
    await repo.releaseSnapshot(scopeB, protectedPoint.id, protectedPoint.protectionToken!)
    expect((await db.folder_snapshots.get(protectedPoint.id))?.protectedUntil).toBeUndefined()
  })

  it('upgrades structural stores monotonically while preserving unrelated product records', async () => {
    db.close()
    await Dexie.delete('gemini_extension')
    const old = new Dexie('gemini_extension')
    old.version(12).stores({ chain_prompts: 'id, name, createdAt, updatedAt', quick_follow_prompts: 'id, updatedAt', quick_follow_settings: 'id', theme_assets: 'id, feature, updatedAt', notification_audio_assets: 'id, updatedAt', gem_avatar_assets: 'gemId, updatedAt' })
    await old.open(); await old.table('chain_prompts').put({ id: 'unrelated', name: 'Keep me' }); old.close()
    const upgraded = new GeminiExtensionDB(); await upgraded.open()
    expect(await upgraded.chain_prompts.get('unrelated')).toMatchObject({ name: 'Keep me' })
    expect(upgraded.tables.map((table) => table.name)).toContain('folder_sync_publications')
    expect(upgraded.tables.map((table) => table.name)).toContain('folder_sync_conflicts')
    upgraded.close(); await db.open()
  })
})

function usage(folderBytes: number) { return { folderBytes, folderBudgetBytes: 1000, totalBytes: folderBytes + 100, quotaBytes: 2000, usagePercent: folderBytes / 10 } }

describe('retained local organization regressions', () => {
  it('reports full account counts and keeps restore point counts tied to their saved payload', async () => {
    const repository = new FolderRepositoryImpl()
    const first = await repository.createFolder(scopeA, { name: 'First' }).then((result) => result.data)
    const second = await repository.createFolder(scopeA, { name: 'Second' }).then((result) => result.data)
    const deleted = await repository.createFolder(scopeA, { name: 'Deleted' }).then((result) => result.data)
    const foreign = await repository.createFolder(scopeB, { name: 'Foreign' }).then((result) => result.data)
    for (let index = 0; index < 12; index += 1) {
      await repository.upsertMembership(scopeA, { folderId: first.id, chatId: `chat-${index}` }).then((result) => result.data)
    }
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'chat-0' }).then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'removed' }).then((result) => result.data)
    await repository.removeMembership(scopeA, second.id, 'removed').then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: deleted.id, chatId: 'deleted' }).then((result) => result.data)
    await repository.deleteFolder(scopeA, deleted.id).then((result) => result.data)
    await repository.upsertMembership(scopeB, { folderId: foreign.id, chatId: 'foreign' }).then((result) => result.data)
    const point = await repository.createSnapshot(scopeA, 'manual')
    expect(point).toMatchObject({ folderCount: 2, chatCount: 12 })
    const queries = new FolderQueryService()
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ folderCount: 2, chatCount: 12 })
    expect((await queries.getSidebarState(scopeA, 5)).chatsByFolder[first.id].items).toHaveLength(10)
    await db.folder_snapshots.update(point.id, { folderCount: undefined, chatCount: undefined })
    await repository.removeMembership(scopeA, first.id, 'chat-1').then((result) => result.data)
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ folderCount: 2, chatCount: 11 })
    const historical = (await queries.listSnapshots(scopeA, undefined, 100)).items.find((row) => row.id === point.id)
    expect(historical).toMatchObject({ folderCount: 2, chatCount: 12 })
    expect((await db.folder_snapshots.get(point.id))?.folderCount).toBeUndefined()
    await db.folder_snapshots.update(point.id, { compressedPayload: 'corrupted' })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const corrupt = (await queries.listSnapshots(scopeA, undefined, 100)).items.find((row) => row.id === point.id)
      expect(corrupt?.folderCount).toBeUndefined()
      expect(corrupt?.chatCount).toBeUndefined()
      expect(warning).toHaveBeenCalled()
    } finally { warning.mockRestore() }
  })

  it('pins only the current membership, preserves ordinary order, and treats repeated pin requests as idempotent', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'First' }).then((result) => result.data)
    const other = await repository.createFolder(scopeA, { name: 'Second' }).then((result) => result.data)
    const foreign = await repository.createFolder(scopeB, { name: 'Foreign' }).then((result) => result.data)
    for (const chatId of ['d', 'c', 'b', 'a']) await repository.upsertMembership(scopeA, { folderId: folder.id, chatId }).then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: other.id, chatId: 'b' }).then((result) => result.data)
    const prior = (await repository.listMemberships(scopeA)).find((row) => row.folderId === folder.id && row.chatId === 'b')!
    await repository.setMembershipPinned(scopeA, folder.id, 'c', true).then((result) => result.data)
    const pinned = await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)
    expect(pinned.orderKey).toBe(prior.orderKey)
    expect((await repository.listMemberships(scopeA)).find((row) => row.folderId === other.id)?.pinnedOrderKey).toBeUndefined()
    const queries = new FolderQueryService()
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['b', 'c', 'a', 'd'])
    const revision = (await repository.getSyncState(scopeA))!.localDataRevision
    expect(await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)).toEqual(pinned)
    expect((await repository.getSyncState(scopeA))!.localDataRevision).toBe(revision)
    await repository.setMembershipPinned(scopeA, folder.id, 'c', false).then((result) => result.data)
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['b', 'a', 'c', 'd'])
    await expect(repository.setMembershipPinned(scopeA, foreign.id, 'b', true).then((result) => result.data)).rejects.toThrow('unavailable')
    await expect(repository.setMembershipPinned(scopeA, folder.id, 'missing', true).then((result) => result.data)).rejects.toThrow('unavailable')
    await repository.removeMembership(scopeA, folder.id, 'b').then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'b' }).then((result) => result.data)
    const readded = (await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items[0]
    expect(readded.chatId).toBe('b')
    expect(readded.pinnedOrderKey).toBeUndefined()
  })

  it('reorders each pin group independently and puts newly added chats below all pins', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Reorder' }).then((result) => result.data)
    const rows = []
    for (const chatId of ['d', 'c', 'b', 'a']) rows.push(await repository.upsertMembership(scopeA, { folderId: folder.id, chatId }).then((result) => result.data))
    await repository.setMembershipPinned(scopeA, folder.id, 'c', true).then((result) => result.data)
    await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)
    await repository.moveMembership(scopeA, folder.id, 'c', folder.id, { beforeId: rows[2].id }).then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'new' }).then((result) => result.data)
    const queries = new FolderQueryService()
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['c', 'b', 'new', 'a', 'd'])
    await expect(repository.moveMembership(scopeA, folder.id, 'a', folder.id, { beforeId: rows[2].id }).then((result) => result.data)).rejects.toThrow('pin groups')
    await repository.moveMembership(scopeA, folder.id, 'd', folder.id, { beforeId: rows[3].id }).then((result) => result.data)
    await repository.setMembershipPinned(scopeA, folder.id, 'c', false).then((result) => result.data)
    await repository.setMembershipPinned(scopeA, folder.id, 'b', false).then((result) => result.data)
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['new', 'd', 'a', 'b', 'c'])
  })

  it('pages in display order across the pinned boundary without omitting or duplicating chats', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Pagination' }).then((result) => result.data)
    for (let index = 0; index < 18; index += 1) await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: `chat-${index}` }).then((result) => result.data)
    for (let index = 0; index < 12; index += 1) await repository.setMembershipPinned(scopeA, folder.id, `chat-${index}`, true).then((result) => result.data)
    const queries = new FolderQueryService()
    const sidebar = await queries.getSidebarState(scopeA, 5)
    const first = sidebar.chatsByFolder[folder.id]
    expect(first.items.map((row) => row.chatId)).toEqual(Array.from({ length: 10 }, (_, index) => `chat-${11 - index}`))
    const next = await queries.listFolderChats(scopeA, folder.id, first.nextCursor, 10)
    expect(next.items.map((row) => row.chatId)).toEqual(['chat-1', 'chat-0', 'chat-17', 'chat-16', 'chat-15', 'chat-14', 'chat-13', 'chat-12'])
    expect(next.nextCursor).toBeUndefined()
    expect(new Set([...first.items, ...next.items].map((row) => row.chatId)).size).toBe(18)
  })

  it('round trips pin data through sync, backups, and restore points and unpinned data', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Recovery' }).then((result) => result.data)
    const membership = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat' }).then((result) => result.data)
    const pinned = await repository.setMembershipPinned(scopeA, folder.id, 'chat', true).then((result) => result.data)
    const sync = parseFolderSyncData(toFolderSyncData(await repository.getAccountData(scopeA)))
    expect(toFolderSyncData(fromFolderSyncData(scopeA, sync)).memberships[0]).toEqual(toFolderSyncData({ accountScopeId: scopeA, folders: [], memberships: [pinned], chatReferences: [] }).memberships[0])
    const backup = await repository.exportAccountData(scopeA)
    const snapshot = await repository.createSnapshot(scopeA, 'manual')
    await repository.setMembershipPinned(scopeA, folder.id, 'chat', false).then((result) => result.data)
    await repository.restoreSnapshot(scopeA, snapshot.id).then((result) => result.data)
    expect((await repository.listMemberships(scopeA))[0]).toEqual(pinned)
    await repository.setMembershipPinned(scopeA, folder.id, 'chat', false).then((result) => result.data)
    await repository.importAccountData(scopeA, backup).then((result) => result.data)
    expect((await repository.listMemberships(scopeA))[0]).toEqual(pinned)
    const { accountScopeId: _, displayOrderKey: _display, ...unpinned } = membership
    await repository.importAccountData(scopeA, { ...backup, data: { ...backup.data, memberships: [unpinned] } }).then((result) => result.data)
    expect((await repository.listMemberships(scopeA))[0].pinnedOrderKey).toBeUndefined()
  })

  it('rebalances exhausted pinned keys without changing ordinary positions', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Rebalance' }).then((result) => result.data)
    const rows = []
    for (const chatId of ['a', 'b', 'c']) rows.push(await repository.upsertMembership(scopeA, { folderId: folder.id, chatId }).then((result) => result.data))
    await repository.setMembershipPinned(scopeA, folder.id, 'a', true).then((result) => result.data)
    await db.folder_memberships.update(rows[0].id, { pinnedOrderKey: '1'.padStart(32, '0'), displayOrderKey: `0${'1'.padStart(32, '0')}` })
    await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)
    const updated = await repository.listMemberships(scopeA)
    for (const row of rows) expect(updated.find((item) => item.id === row.id)?.orderKey).toBe(row.orderKey)
    expect(updated.map((row) => row.chatId)).toEqual(['b', 'a', 'c'])
  })

  it('bundles the first sidebar folders with ten chats and independent cursors, including collapsed folders', async () => {
    const repository = new FolderRepositoryImpl()
    for (let index = 0; index < 5; index += 1) {
      await repository.createFolder(scopeA, { name: `Empty ${index}` }).then((result) => result.data)
    }
    const folder = await repository.createFolder(scopeA, { name: 'With chats' }).then((result) => result.data)
    for (let index = 0; index < 13; index += 1) {
      await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: `chat-${index}`, cachedTitle: `Chat ${index}` }).then((result) => result.data)
    }
    await repository.removeMembership(scopeA, folder.id, 'chat-12').then((result) => result.data)
    await repository.updateSettings(scopeA, { collapsedFolderIds: [folder.id] }).then((result) => result.data)
    const other = await repository.createFolder(scopeB, { name: 'Other account' }).then((result) => result.data)
    await repository.upsertMembership(scopeB, { folderId: other.id, chatId: 'other-chat', cachedTitle: 'Other chat' }).then((result) => result.data)

    const queries = new FolderQueryService()
    const sidebar = await queries.getSidebarState(scopeA, 5)
    expect(sidebar.folders).toHaveLength(5)
    expect(sidebar.nextCursor).toBeDefined()
    expect(sidebar.folders.find((row) => row.id === folder.id)).toMatchObject({ chatCount: 12, collapsed: true })
    expect(Object.keys(sidebar.chatsByFolder).sort()).toEqual(sidebar.folders.map((row) => row.id).sort())
    const firstPage = sidebar.chatsByFolder[folder.id]
    expect(firstPage.items).toHaveLength(10)
    expect(firstPage.items.every((row) => row.cachedTitle.startsWith('Chat '))).toBe(true)
    expect(firstPage.nextCursor).toBeDefined()
    const lastPage = await queries.listFolderChats(scopeA, folder.id, firstPage.nextCursor, 10)
    expect(lastPage.items).toHaveLength(2)
    expect(lastPage.nextCursor).toBeUndefined()
    const ids = [...firstPage.items, ...lastPage.items].map((row) => row.chatId)
    expect(new Set(ids).size).toBe(12)
    expect(ids).not.toContain('chat-12')
    expect(ids).not.toContain('other-chat')
    expect(sidebar.chatsByFolder[other.id]).toBeUndefined()
    for (const row of sidebar.folders.filter((row) => row.id !== folder.id)) {
      expect(sidebar.chatsByFolder[row.id]).toEqual({ items: [], nextCursor: undefined })
    }
  })

  it('shows capacity notice at 80 percent and again only 10 points after dismissal', async () => {
    const repository = new FolderRepositoryImpl()
    const queries = new FolderQueryService()
    await repository.createFolder(scopeA, { name: 'Capacity state' }).then((result) => result.data)
    await repository.recordBrowserSyncUsage(scopeA, usage(790))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(false)
    expect(await repository.dismissBrowserSyncCapacityNotice(scopeA, 79)).toBe(false)

    await repository.recordBrowserSyncUsage(scopeA, usage(800))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)
    expect(await repository.dismissBrowserSyncCapacityNotice(scopeA, 80)).toBe(true)
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(false)

    await repository.recordBrowserSyncUsage(scopeA, usage(899))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(false)
    await repository.recordBrowserSyncUsage(scopeA, usage(900))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)

    // A stale tab can dismiss only the usage it actually displayed.
    await repository.recordBrowserSyncUsage(scopeA, usage(1000))
    expect(await repository.dismissBrowserSyncCapacityNotice(scopeA, 90)).toBe(true)
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)

    await db.folder_sync_states.update(scopeA, { browserSyncWarning: 'quota-exceeded' })
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ state: 'needs-attention', showCapacityNotice: false })

    const generation = await repository.getOrCreateBrowserSyncPublication(scopeA)
    await repository.markBrowserSyncPublicationAccepted(scopeA, generation.id, usage(790))
    expect((await db.folder_sync_states.get(scopeA))?.browserSyncLastDismissedUsagePercent).toBeUndefined()
    await repository.recordBrowserSyncUsage(scopeA, usage(800))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)
  })

  it('keeps rejected projected usage separate and resets dismissal on explicit actual measurement without clearing hard errors', async () => {
    const repository = new FolderRepositoryImpl()
    const queries = new FolderQueryService()
    await repository.createFolder(scopeA, { name: 'Measured state' }).then((result) => result.data)
    const initial = await repository.getSyncState(scopeA)
    await repository.recordBrowserSyncUsage(scopeA, usage(850))
    await repository.dismissBrowserSyncCapacityNotice(scopeA, 85)
    await repository.recordBrowserSyncFailure(scopeA, 'folder-budget-exceeded', 'quota-exceeded', usage(1200))
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({
      currentUsageBytes: 850, projectedUsageBytes: 1200, usagePercent: 85, warning: 'quota-exceeded', showCapacityNotice: false,
    })

    await repository.recordBrowserSyncUsage(scopeA, usage(790))
    expect(await repository.getSyncState(scopeA)).toMatchObject({
      browserSyncCurrentUsageBytes: 790,
      browserSyncProjectedUsageBytes: 1200,
      browserSyncWarning: 'quota-exceeded',
      localDataRevision: initial?.localDataRevision,
    })
    expect((await repository.getSyncState(scopeA))?.browserSyncLastDismissedUsagePercent).toBeUndefined()
    expect(await repository.hasPendingChanges(scopeA)).toBe(true)
    expect(await db.folder_sync_publications.count()).toBe(0)
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ currentUsageBytes: 790, state: 'needs-attention', showCapacityNotice: false })
  })

  it('enforces account scope, NFKC name uniqueness, and default-top position bounds', async () => {
    const repository = new FolderRepositoryImpl()
    const older = await repository.createFolder(scopeA, { name: 'Older' }).then((result) => result.data)
    const newer = await repository.createFolder(scopeA, { name: 'Newest' }).then((result) => result.data)
    const newest = await repository.createFolder(scopeA, { name: 'Newest of all' }).then((result) => result.data)
    const newestAgain = await repository.createFolder(scopeA, { name: 'Newest again' }).then((result) => result.data)
    expect((await repository.listFolders(scopeA)).map((folder) => folder.id)).toEqual([newestAgain.id, newest.id, newer.id, older.id])
    await expect(repository.createFolder(scopeA, { name: 'Ｎｅｗｅｓｔ' }).then((result) => result.data)).rejects.toThrow('already exists')
    await expect(repository.createFolder(scopeA, { name: 'Invalid position', beforeId: 'missing' }).then((result) => result.data)).rejects.toThrow('unavailable')
    await expect(repository.updateFolder(scopeB, newer.id, { name: 'Other account' }).then((result) => result.data)).rejects.toThrow('unavailable')
    await expect(repository.updateFolder(scopeA, newer.id, { name: 'Ｎｅｗｅｓｔ　ｏｆ　ａｌｌ' }).then((result) => result.data)).rejects.toThrow('already exists')
    await expect(repository.moveFolder(scopeA, older.id, '__root__', { beforeId: newestAgain.id, afterId: newer.id }).then((result) => result.data)).rejects.toThrow('adjacent')
  })

  it('stores a validated custom color and preserves unchanged appearance', async () => {
    const repository = new FolderRepositoryImpl()
    const created = await repository.createFolder(scopeA, {
      name: 'Custom appearance',
      iconKey: 'education',
      colorValue: '#A1B2C3',
    }).then((result) => result.data)

    expect(created).toMatchObject({ iconKey: 'education', colorValue: '#a1b2c3' })
    const renamed = await repository.updateFolder(scopeA, created.id, { name: 'Renamed only' }).then((result) => result.data)

    await expect(repository.updateFolder(scopeA, created.id, {
      colorValue: 'url(https://example.com)' as '#badbad',
    }).then((result) => result.data)).rejects.toThrow('color is invalid')
    await expect(repository.updateFolder(scopeA, created.id, {
      iconKey: 'unknown' as 'folder',
    }).then((result) => result.data)).rejects.toThrow('icon is unavailable')
  })

  it('keeps an active membership idempotent while refreshing the chat reference cache', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Work' }).then((result) => result.data)
    const first = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat-1', cachedTitle: 'A chat' }).then((result) => result.data)
    const second = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat-1', cachedTitle: 'Changed title is ignored for an active membership' }).then((result) => result.data)

    expect(second).toEqual(first)
    expect(await db.folder_memberships.where('accountScopeId').equals(scopeA).count()).toBe(1)
    expect(await db.folder_chat_references.get([scopeA, 'chat-1'])).toMatchObject({ cachedTitle: 'Changed title is ignored for an active membership' })
  })

  it('keeps a completed mutation when automatic recovery fails, but blocks delete, import and restore without protection', async () => {
    const repository = new FolderRepositoryImpl(undefined, { budgetBytes: 50 })
    const folder = await repository.createFolder(scopeA, { name: 'Durable without snapshot' }).then((result) => result.data)
    expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
    expect(await repository.hasPendingChanges(scopeA)).toBe(true)
    await expect(repository.createSnapshot(scopeA, 'automatic')).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
    expect(await db.folder_recovery_states.get(scopeA)).toMatchObject({ warning: 'snapshot-too-large' })
    await expect(repository.deleteFolder(scopeA, folder.id).then((result) => result.data)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    const exported = await repository.exportAccountData(scopeA)
    const replaced = { ...exported, data: { ...exported.data, folders: [{ ...exported.data.folders[0], name: 'Imported' }] } }
    await expect(repository.importAccountData(scopeA, replaced).then((result) => result.data)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    const normal = new FolderRepositoryImpl()
    const snapshot = await normal.createSnapshot(scopeA, 'manual')
    await expect(repository.restoreSnapshot(scopeA, snapshot.id).then((result) => result.data)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    expect((await repository.listFolders(scopeA))[0].name).toBe('Durable without snapshot')
    expect((await db.folder_snapshots.get(snapshot.id))?.protectedUntil).toBeUndefined()
  })

  it('keeps the original recovery failure visible when its status record cannot be written', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Saved organization' }).then((result) => result.data)
    const put = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new DOMException('Quota reached', 'QuotaExceededError'))
    await expect(repository.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
    expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
    put.mockRestore()
    await repository.createSnapshot(scopeA, 'manual')
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: undefined, automaticSnapshotFailed: false })
  })

  it('preserves the oversized snapshot reason in fallback status without rolling back saved organization', async () => {
    const repository = new FolderRepositoryImpl(undefined, { budgetBytes: 50 })
    const folder = await repository.createFolder(scopeA, { name: 'Saved organization' }).then((result) => result.data)
    const put = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Failure record write failed'))
    try {
      await expect(repository.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
        expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
      expect(await repository.hasPendingChanges(scopeA)).toBe(true)
      expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeDefined()
      expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'snapshot-too-large', automaticSnapshotFailed: true })
      expect(await new FolderQueryService().getSyncStatus(scopeA)).toMatchObject({
        localRecoveryWarning: 'snapshot-too-large', localAutomaticSnapshotFailed: true,
      })
    } finally { put.mockRestore() }
    await new FolderRepositoryImpl().createSnapshot(scopeA, 'manual')
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: undefined, automaticSnapshotFailed: false })
  })

  it.each([
    [new FolderRecoveryError('SNAPSHOT_BUDGET_EXCEEDED'), 'budget-exceeded'],
    [new DOMException('Full disk', 'QuotaExceededError'), 'quota-exceeded'],
    [new Error('Snapshot write failed'), 'snapshot-failed'],
  ] as const)('preserves the original %s classification when the failure record also fails', async (error, warning) => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Saved organization' }).then((result) => result.data)
    const snapshotPut = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(error)
    const statusPut = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Failure record write failed'))
    try {
      await expect(repository.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
        expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
      expect(await repository.hasPendingChanges(scopeA)).toBe(true)
      expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning, automaticSnapshotFailed: true })
      expect(await new FolderQueryService().getSyncStatus(scopeA)).toMatchObject({
        localRecoveryWarning: warning, localAutomaticSnapshotFailed: true,
      })
    } finally {
      snapshotPut.mockRestore()
      statusPut.mockRestore()
    }
    await repository.createSnapshot(scopeA, 'manual')
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: undefined, automaticSnapshotFailed: false })
  })

  it('imports organization without overwriting current preferences and releases the protection lease', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Before import' }).then((result) => result.data)
    const exported = await repository.exportAccountData(scopeA)
    await repository.updateSettings(scopeA, { enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] }).then((result) => result.data)
    await repository.importAccountData(scopeA, { ...exported, data: { ...exported.data, folders: [{ ...exported.data.folders[0], name: 'Imported' }] } }).then((result) => result.data)
    expect((await repository.listFolders(scopeA))[0].name).toBe('Imported')
    expect(await repository.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] })
    const protection = (await repository.listSnapshots(scopeA)).find((row) => row.reasons?.includes('before-import'))!
    expect(protection).toBeDefined()
    expect(protection.protectedUntil).toBeUndefined()
  })

  it('rejects a different-scope import, retains old restore points, and honors lease expiry', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Scope data' }).then((result) => result.data)
    const exported = await repository.exportAccountData(scopeA)
    await expect(repository.importAccountData(scopeB, exported).then((result) => result.data)).rejects.toThrow('different account scope')
    const stale = await repository.createSnapshot(scopeA, 'manual')
    await db.folder_snapshots.update(stale.id, { createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' })
    await repository.createFolder(scopeA, { name: 'Another folder' }).then((result) => result.data)
    expect((await repository.listSnapshots(scopeA)).some((snapshot) => snapshot.id === stale.id)).toBe(true)
    await repository.acquireCoordinatorLease(scopeA, 'owner-a', 10_000)
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).rejects.toThrow('held by another')
    await db.folder_coordinator_leases.update(scopeA, { expiresAt: '2000-01-01T00:00:00.000Z' })
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).resolves.toMatchObject({ ownerId: 'owner-b' })
  })

  it('rejects foreign record IDs even if an import envelope is relabeled to the current account', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Account A' }).then((result) => result.data)
    await repository.createFolder(scopeB, { name: 'Account B' }).then((result) => result.data)
    const beforeA = await repository.getAccountData(scopeA)
    const beforeB = await repository.getAccountData(scopeB)
    const exported = await repository.exportAccountData(scopeA)
    await expect(repository.importAccountData(scopeB, { ...exported, accountScopeId: scopeB }).then((result) => result.data)).rejects.toThrow('different account scope')
    expect(await repository.getAccountData(scopeA)).toEqual(beforeA)
    expect(await repository.getAccountData(scopeB)).toEqual(beforeB)
  })

  it('removes every local membership and title cache only through the post-Gemini-delete repository command', async () => {
    const repository = new FolderRepositoryImpl()
    const first = await repository.createFolder(scopeA, { name: 'First folder' }).then((result) => result.data)
    const second = await repository.createFolder(scopeA, { name: 'Second folder' }).then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: first.id, chatId: 'chat-delete', cachedTitle: 'Delete me' }).then((result) => result.data)
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'chat-delete' }).then((result) => result.data)

    await repository.removeChatAfterGeminiDelete(scopeA, 'chat-delete').then((result) => result.data)

    expect((await repository.getProjection(scopeA)).memberships).toEqual([])
    expect(await db.folder_chat_references.get([scopeA, 'chat-delete'])).toBeUndefined()
  })
})

it('captures sidebar values and revision in one readonly transaction while a replacement is queued', async () => {
  const repo = repository(); const initial = await repo.createFolder(scopeA, { name: 'Before' })
  const query = new FolderQueryService()
  let write!: Promise<unknown>
  const capture = await query.readProjection(scopeA, async () => {
    const result = await query.getSidebarState(scopeA, 5)
    write = Dexie.ignoreTransaction(() => repo.updateFolder(scopeA, initial.data.id, { name: 'After' }))
    return result
  })
  await write
  expect(capture.data.folders[0].name).toBe('Before')
  expect(capture.dataRevision).toBe(initial.commit.dataRevision)
  expect((await repo.getSyncState(scopeA))!.localDataRevision).not.toBe(capture.dataRevision)
  await expect(repo.updateFolder(scopeA, initial.data.id, { name: 'Old draft', expectedRevision: capture.dataRevision })).rejects.toThrow('STALE_REVISION')
})
