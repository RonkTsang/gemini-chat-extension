import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, unknown>())

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          Object.entries(value).forEach(([key, entry]) => storage.set(key, entry))
        }),
      },
    },
  },
}))

import { db } from '../db'
import { FolderRepositoryImpl } from './folderRepository'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'
import { decodeLzStringBase64, toFolderSyncData, fromFolderSyncData } from '@/services/folder-sync/codec'
import { parseFolderSyncData } from '@/domain/folder/schemas'
import { clearRecoveryFailure } from '@/services/folder-recovery/failure-fallback'
import { FolderRecoveryError, getLocalStorageStatus } from '@/services/folder-recovery/storage'

const scopeA = 'account-scope-0001'
const scopeB = 'account-scope-0002'

function usage(folderBytes: number) {
  return { folderBytes, folderBudgetBytes: 1000, totalBytes: folderBytes + 100, quotaBytes: 2000, usagePercent: folderBytes / 10 }
}

async function clearFolderTables(): Promise<void> {
  await Promise.all([
    db.folders.clear(),
    db.folder_memberships.clear(),
    db.folder_chat_references.clear(),
    db.folder_settings.clear(),
    db.folder_operations.clear(),
    db.folder_sync_states.clear(),
    db.folder_sync_generations.clear(),
    db.folder_snapshots.clear(),
    db.folder_recovery_states.clear(),
    db.folder_coordinator_leases.clear(),
  ])
}

describe('FolderRepository', () => {
  beforeEach(async () => {
    storage.clear()
    clearRecoveryFailure(scopeA)
    clearRecoveryFailure(scopeB)
    await clearFolderTables()
  })

  it('reports full account counts and keeps restore point counts tied to their saved payload', async () => {
    const repository = new FolderRepositoryImpl()
    const first = await repository.createFolder(scopeA, { name: 'First' })
    const second = await repository.createFolder(scopeA, { name: 'Second' })
    const deleted = await repository.createFolder(scopeA, { name: 'Deleted' })
    const foreign = await repository.createFolder(scopeB, { name: 'Foreign' })
    for (let index = 0; index < 12; index += 1) {
      await repository.upsertMembership(scopeA, { folderId: first.id, chatId: `chat-${index}` })
    }
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'chat-0' })
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'removed' })
    await repository.removeMembership(scopeA, second.id, 'removed')
    await repository.upsertMembership(scopeA, { folderId: deleted.id, chatId: 'deleted' })
    await repository.deleteFolder(scopeA, deleted.id)
    await repository.upsertMembership(scopeB, { folderId: foreign.id, chatId: 'foreign' })
    await repository.upsertChatReference(scopeA, 'cached-only', 'Cached only')
    const point = await repository.createSnapshot(scopeA, 'manual')
    expect(point).toMatchObject({ folderCount: 2, chatCount: 12 })
    const queries = new FolderQueryService()
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ folderCount: 2, chatCount: 12 })
    expect((await queries.getSidebarState(scopeA, 5)).chatsByFolder[first.id].items).toHaveLength(10)
    await db.folder_snapshots.update(point.id, { folderCount: undefined, chatCount: undefined })
    await repository.removeMembership(scopeA, first.id, 'chat-1')
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
    const folder = await repository.createFolder(scopeA, { name: 'First' })
    const other = await repository.createFolder(scopeA, { name: 'Second' })
    const foreign = await repository.createFolder(scopeB, { name: 'Foreign' })
    for (const chatId of ['d', 'c', 'b', 'a']) await repository.upsertMembership(scopeA, { folderId: folder.id, chatId })
    await repository.upsertMembership(scopeA, { folderId: other.id, chatId: 'b' })
    const prior = (await repository.listMemberships(scopeA)).find((row) => row.folderId === folder.id && row.chatId === 'b')!
    await repository.setMembershipPinned(scopeA, folder.id, 'c', true)
    const pinned = await repository.setMembershipPinned(scopeA, folder.id, 'b', true)
    expect(pinned.orderKey).toBe(prior.orderKey)
    expect(pinned.positionVersionStamp).toBe(prior.positionVersionStamp)
    expect((await repository.listMemberships(scopeA)).find((row) => row.folderId === other.id)?.pinnedOrderKey).toBeUndefined()
    const queries = new FolderQueryService()
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['b', 'c', 'a', 'd'])
    const operations = await db.folder_operations.count()
    expect(await repository.setMembershipPinned(scopeA, folder.id, 'b', true)).toEqual(pinned)
    expect(await db.folder_operations.count()).toBe(operations)
    await repository.setMembershipPinned(scopeA, folder.id, 'c', false)
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['b', 'a', 'c', 'd'])
    await expect(repository.setMembershipPinned(scopeA, foreign.id, 'b', true)).rejects.toThrow('unavailable')
    await expect(repository.setMembershipPinned(scopeA, folder.id, 'missing', true)).rejects.toThrow('unavailable')
    await repository.removeMembership(scopeA, folder.id, 'b')
    await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'b' })
    const readded = (await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items[0]
    expect(readded.chatId).toBe('b')
    expect(readded.pinnedOrderKey).toBeUndefined()
  })

  it('reorders each pin group independently and puts newly added chats below all pins', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Reorder' })
    const rows = []
    for (const chatId of ['d', 'c', 'b', 'a']) rows.push(await repository.upsertMembership(scopeA, { folderId: folder.id, chatId }))
    await repository.setMembershipPinned(scopeA, folder.id, 'c', true)
    await repository.setMembershipPinned(scopeA, folder.id, 'b', true)
    await repository.moveMembership(scopeA, folder.id, 'c', folder.id, { beforeId: rows[2].id })
    await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'new' })
    const queries = new FolderQueryService()
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['c', 'b', 'new', 'a', 'd'])
    await expect(repository.moveMembership(scopeA, folder.id, 'a', folder.id, { beforeId: rows[2].id })).rejects.toThrow('pin groups')
    await repository.moveMembership(scopeA, folder.id, 'd', folder.id, { beforeId: rows[3].id })
    await repository.setMembershipPinned(scopeA, folder.id, 'c', false)
    await repository.setMembershipPinned(scopeA, folder.id, 'b', false)
    expect((await queries.listFolderChats(scopeA, folder.id, undefined, 10)).items.map((row) => row.chatId)).toEqual(['new', 'd', 'a', 'b', 'c'])
  })

  it('pages in display order across the pinned boundary without omitting or duplicating chats', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Pagination' })
    for (let index = 0; index < 18; index += 1) await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: `chat-${index}` })
    for (let index = 0; index < 12; index += 1) await repository.setMembershipPinned(scopeA, folder.id, `chat-${index}`, true)
    const queries = new FolderQueryService()
    const sidebar = await queries.getSidebarState(scopeA, 5)
    const first = sidebar.chatsByFolder[folder.id]
    expect(first.items.map((row) => row.chatId)).toEqual(Array.from({ length: 10 }, (_, index) => `chat-${11 - index}`))
    const next = await queries.listFolderChats(scopeA, folder.id, first.nextCursor, 10)
    expect(next.items.map((row) => row.chatId)).toEqual(['chat-1', 'chat-0', 'chat-17', 'chat-16', 'chat-15', 'chat-14', 'chat-13', 'chat-12'])
    expect(next.nextCursor).toBeUndefined()
    expect(new Set([...first.items, ...next.items].map((row) => row.chatId)).size).toBe(18)
  })

  it('round trips pin data through sync, backups, and restore points while accepting older unpinned data', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Recovery' })
    const membership = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat' })
    const pinned = await repository.setMembershipPinned(scopeA, folder.id, 'chat', true)
    const sync = parseFolderSyncData(toFolderSyncData(await repository.getAccountData(scopeA)))
    expect(fromFolderSyncData(scopeA, sync).memberships[0]).toEqual(pinned)
    const backup = await repository.exportAccountData(scopeA)
    const snapshot = await repository.createSnapshot(scopeA, 'manual')
    await repository.setMembershipPinned(scopeA, folder.id, 'chat', false)
    await repository.restoreSnapshot(scopeA, snapshot.id)
    expect((await repository.listMemberships(scopeA))[0]).toEqual(pinned)
    await repository.setMembershipPinned(scopeA, folder.id, 'chat', false)
    await repository.importAccountData(scopeA, backup)
    expect((await repository.listMemberships(scopeA))[0]).toEqual(pinned)
    const { pinVersionStamp: _, ...legacy } = membership
    await repository.importAccountData(scopeA, { ...backup, memberships: [legacy] })
    expect((await repository.listMemberships(scopeA))[0].pinnedOrderKey).toBeUndefined()
  })

  it('rebalances exhausted pinned keys without changing ordinary positions', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Rebalance' })
    const rows = []
    for (const chatId of ['a', 'b', 'c']) rows.push(await repository.upsertMembership(scopeA, { folderId: folder.id, chatId }))
    await repository.setMembershipPinned(scopeA, folder.id, 'a', true)
    await db.folder_memberships.update(rows[0].id, { pinnedOrderKey: '1'.padStart(32, '0') })
    await repository.setMembershipPinned(scopeA, folder.id, 'b', true)
    const updated = await repository.listMemberships(scopeA)
    for (const row of rows) expect(updated.find((item) => item.id === row.id)?.orderKey).toBe(row.orderKey)
    expect(updated.map((row) => row.chatId)).toEqual(['b', 'a', 'c'])
    expect((await db.folder_operations.toArray()).some((operation) => operation.operationType === 'order.rebalance' && operation.payload.pinned)).toBe(true)
  })

  it('bundles the first sidebar folders with ten chats and independent cursors, including collapsed folders', async () => {
    const repository = new FolderRepositoryImpl()
    for (let index = 0; index < 5; index += 1) {
      await repository.createFolder(scopeA, { name: `Empty ${index}` })
    }
    const folder = await repository.createFolder(scopeA, { name: 'With chats' })
    for (let index = 0; index < 13; index += 1) {
      await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: `chat-${index}`, cachedTitle: `Chat ${index}` })
    }
    await repository.removeMembership(scopeA, folder.id, 'chat-12')
    await repository.updateSettings(scopeA, { collapsedFolderIds: [folder.id] })
    const other = await repository.createFolder(scopeB, { name: 'Other account' })
    await repository.upsertMembership(scopeB, { folderId: other.id, chatId: 'other-chat', cachedTitle: 'Other chat' })

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

  it('uses one persisted installation id and atomically writes a folder, outbox operation, and sync state', async () => {
    const repository = new FolderRepositoryImpl()
    const otherContext = new FolderRepositoryImpl()
    const [first, second] = await Promise.all([
      repository.createFolder(scopeA, { name: 'First' }),
      otherContext.createFolder(scopeA, { name: 'Second' }),
    ])

    expect(first.orderKey < second.orderKey || second.orderKey < first.orderKey).toBe(true)
    const operations = await db.folder_operations.where('accountScopeId').equals(scopeA).toArray()
    const state = await db.folder_sync_states.get(scopeA)
    expect(operations).toHaveLength(2)
    expect(operations.every((operation) => operation.operationType === 'folder.create' && operation.state === 'pending')).toBe(true)
    expect(new Set(operations.map((operation) => operation.deviceId)).size).toBe(1)
    expect(operations[0].deviceId).toMatch(/^folder-device-/u)
    expect(new Set(operations.map((operation) => operation.versionStamp)).size).toBe(2)
    expect(state).toMatchObject({ accountScopeId: scopeA, provider: 'browser-sync', authorityEpoch: expect.any(String), localDataRevision: expect.any(String) })
  })

  it('keeps a transient incomplete replica out of the warning state and clears recovery state once complete', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Sync state' })

    await repository.recordBrowserSyncFailure(scopeA, 'incomplete-replica', 'incomplete-replica')
    expect(await db.folder_sync_states.get(scopeA)).toMatchObject({
      retryCount: 1,
      lastErrorCode: 'incomplete-replica',
      browserSyncWarning: undefined,
      incompleteReplicaSince: expect.any(String),
    })

    await db.folder_sync_states.update(scopeA, {
      incompleteReplicaSince: new Date(Date.now() - 60_000).toISOString(),
    })
    await repository.recordBrowserSyncFailure(scopeA, 'incomplete-replica', 'incomplete-replica')
    expect(await db.folder_sync_states.get(scopeA)).toMatchObject({
      retryCount: 2,
      browserSyncWarning: 'incomplete-replica',
    })

    expect(await repository.recordBrowserSyncReplicaObserved(scopeA, 'complete-generation')).toBe(true)
    const recovered = await db.folder_sync_states.get(scopeA)
    expect(recovered?.lastObservedReplicaGenerationId).toBe('complete-generation')
    for (const field of ['retryAt', 'retryCount', 'lastErrorCode', 'browserSyncWarning', 'incompleteReplicaSince'] as const) {
      expect(recovered?.[field]).toBeUndefined()
    }
  })

  it('shows capacity notice at 80 percent and again only 10 points after dismissal', async () => {
    const repository = new FolderRepositoryImpl()
    const queries = new FolderQueryService()
    await repository.createFolder(scopeA, { name: 'Capacity state' })
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

    const generation = await repository.getOrCreateBrowserSyncGeneration(scopeA)
    await repository.markBrowserSyncGenerationAccepted(scopeA, generation.id, usage(790))
    expect((await db.folder_sync_states.get(scopeA))?.browserSyncLastDismissedUsagePercent).toBeUndefined()
    await repository.recordBrowserSyncUsage(scopeA, usage(800))
    expect((await queries.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)
  })

  it('keeps rejected projected usage separate and resets dismissal on explicit actual measurement without clearing hard errors', async () => {
    const repository = new FolderRepositoryImpl()
    const queries = new FolderQueryService()
    await repository.createFolder(scopeA, { name: 'Measured state' })
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
    expect(await repository.hasPendingOperations(scopeA)).toBe(true)
    expect(await db.folder_sync_generations.count()).toBe(0)
    expect(await queries.getSyncStatus(scopeA)).toMatchObject({ currentUsageBytes: 790, state: 'needs-attention', showCapacityNotice: false })
  })

  it('enforces account scope, NFKC name uniqueness, and default-top position bounds', async () => {
    const repository = new FolderRepositoryImpl()
    const older = await repository.createFolder(scopeA, { name: 'Older' })
    const newer = await repository.createFolder(scopeA, { name: 'Newest' })
    const newest = await repository.createFolder(scopeA, { name: 'Newest of all' })
    const newestAgain = await repository.createFolder(scopeA, { name: 'Newest again' })
    expect((await repository.listFolders(scopeA)).map((folder) => folder.id)).toEqual([newestAgain.id, newest.id, newer.id, older.id])
    await expect(repository.createFolder(scopeA, { name: 'Ｎｅｗｅｓｔ' })).rejects.toThrow('already exists')
    await expect(repository.createFolder(scopeA, { name: 'Invalid position', beforeId: 'missing' })).rejects.toThrow('unavailable')
    await expect(repository.updateFolder(scopeB, newer.id, { name: 'Other account' })).rejects.toThrow('unavailable')
    await expect(repository.updateFolder(scopeA, newer.id, { name: 'Ｎｅｗｅｓｔ　ｏｆ　ａｌｌ' })).rejects.toThrow('already exists')
    await expect(repository.moveFolder(scopeA, older.id, '__root__', { beforeId: newestAgain.id, afterId: newer.id })).rejects.toThrow('adjacent')
  })

  it('stores a validated custom color and preserves unchanged appearance field versions', async () => {
    const repository = new FolderRepositoryImpl()
    const created = await repository.createFolder(scopeA, {
      name: 'Custom appearance',
      iconKey: 'education',
      colorValue: '#A1B2C3',
    })

    expect(created).toMatchObject({ iconKey: 'education', colorValue: '#a1b2c3' })
    const renamed = await repository.updateFolder(scopeA, created.id, { name: 'Renamed only' })
    expect(renamed.fieldVersions.iconKey).toBe(created.fieldVersions.iconKey)
    expect(renamed.fieldVersions.colorValue).toBe(created.fieldVersions.colorValue)

    await expect(repository.updateFolder(scopeA, created.id, {
      colorValue: 'url(https://example.com)' as '#badbad',
    })).rejects.toThrow('color is invalid')
    await expect(repository.updateFolder(scopeA, created.id, {
      iconKey: 'unknown' as 'folder',
    })).rejects.toThrow('icon is unavailable')
  })

  it('keeps an active membership idempotent while refreshing the chat reference cache', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Work' })
    const first = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat-1', cachedTitle: 'A chat' })
    const second = await repository.upsertMembership(scopeA, { folderId: folder.id, chatId: 'chat-1', cachedTitle: 'Changed title is ignored for an active membership' })

    expect(second).toEqual(first)
    expect(await db.folder_memberships.where('accountScopeId').equals(scopeA).count()).toBe(1)
    expect(await db.folder_chat_references.get([scopeA, 'chat-1'])).toMatchObject({ cachedTitle: 'Changed title is ignored for an active membership' })
    const operations = await db.folder_operations.where('accountScopeId').equals(scopeA).toArray()
    expect(operations.filter((operation) => operation.operationType === 'membership.add')).toHaveLength(1)
    expect(operations.filter((operation) => operation.operationType === 'chat-reference.update')).toHaveLength(1)
  })

  it('tombstones an entire subtree and all of its memberships while projections and exports keep their distinct views', async () => {
    const repository = new FolderRepositoryImpl()
    const parent = await repository.createFolder(scopeA, { name: 'Parent' })
    const child = await repository.createFolder(scopeA, { name: 'Child', parentFolderId: parent.id })
    await repository.upsertMembership(scopeA, { folderId: parent.id, chatId: 'chat-parent' })
    await repository.upsertMembership(scopeA, { folderId: child.id, chatId: 'chat-child' })

    await repository.deleteFolder(scopeA, parent.id)

    expect((await repository.getProjection(scopeA)).folders).toEqual([])
    expect((await repository.getProjection(scopeA)).memberships).toEqual([])
    const exported = await repository.exportAccountData(scopeA)
    expect(exported.folders.every((folder) => Boolean(folder.deletedAt))).toBe(true)
    expect(exported.memberships.every((membership) => Boolean(membership.deletedAt))).toBe(true)
    expect((await db.folder_operations.where('accountScopeId').equals(scopeA).toArray()).some((operation) => operation.operationType === 'folder.delete-subtree')).toBe(true)
  })

  it('creates protection snapshots and restores organization without rolling back current UI settings', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Before restore' })
    const snapshot = await repository.createSnapshot(scopeA, 'manual')
    await repository.updateSettings(scopeA, { enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] })
    const currentSettings = await repository.getSettings(scopeA)
    await repository.deleteFolder(scopeA, folder.id)

    await repository.restoreSnapshot(scopeA, snapshot.id)

    expect((await repository.listFolders(scopeA)).map((entry) => entry.name)).toEqual(['Before restore'])
    expect(await repository.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: [] })
    expect((await repository.getSettings(scopeA)).settingsVersion).toEqual(currentSettings.settingsVersion)
    expect((await repository.listSnapshots(scopeA)).some((entry) => entry.reason === 'before-restore')).toBe(true)
  })

  it('rolls back the business row and sync state when Outbox persistence fails', async () => {
    const repository = new FolderRepositoryImpl()
    const put = vi.spyOn(db.folder_operations, 'put').mockRejectedValueOnce(new Error('outbox unavailable'))
    await expect(repository.createFolder(scopeA, { name: 'Must rollback' })).rejects.toThrow('outbox unavailable')
    put.mockRestore()
    expect(await db.folders.where('accountScopeId').equals(scopeA).count()).toBe(0)
    expect(await db.folder_sync_states.get(scopeA)).toBeUndefined()
  })

  it('keeps a completed mutation when automatic recovery fails, but blocks delete, import and restore without protection', async () => {
    const repository = new FolderRepositoryImpl(undefined, { budgetBytes: 50 })
    const folder = await repository.createFolder(scopeA, { name: 'Durable without snapshot' })
    expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
    expect(await repository.hasPendingOperations(scopeA)).toBe(true)
    expect(await db.folder_recovery_states.get(scopeA)).toMatchObject({ warning: 'snapshot-too-large' })
    await expect(repository.deleteFolder(scopeA, folder.id)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    const exported = await repository.exportAccountData(scopeA)
    const replaced = { ...exported, folders: [{ ...exported.folders[0], name: 'Imported' }] }
    await expect(repository.importAccountData(scopeA, replaced)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    const normal = new FolderRepositoryImpl()
    const snapshot = await normal.createSnapshot(scopeA, 'manual')
    await expect(repository.restoreSnapshot(scopeA, snapshot.id)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    expect((await repository.listFolders(scopeA))[0].name).toBe('Durable without snapshot')
    expect((await db.folder_snapshots.get(snapshot.id))?.protectedUntil).toBeUndefined()
  })

  it('keeps the original recovery failure visible when its status record cannot be written', async () => {
    const repository = new FolderRepositoryImpl()
    const put = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new DOMException('Quota reached', 'QuotaExceededError'))
    const folder = await repository.createFolder(scopeA, { name: 'Saved organization' })
    expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
    put.mockRestore()
    await repository.createSnapshot(scopeA, 'manual')
    expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: undefined, automaticSnapshotFailed: false })
  })

  it('preserves the oversized snapshot reason in fallback status without rolling back saved organization', async () => {
    const repository = new FolderRepositoryImpl(undefined, { budgetBytes: 50 })
    const put = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Failure record write failed'))
    try {
      const folder = await repository.createFolder(scopeA, { name: 'Saved organization' })
      expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
      expect(await repository.hasPendingOperations(scopeA)).toBe(true)
      expect(await db.folder_recovery_states.get(scopeA)).toBeUndefined()
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
    const snapshotPut = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(error)
    const statusPut = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Failure record write failed'))
    try {
      const folder = await repository.createFolder(scopeA, { name: 'Saved organization' })
      expect((await repository.listFolders(scopeA))[0].id).toBe(folder.id)
      expect(await repository.hasPendingOperations(scopeA)).toBe(true)
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
    const folder = await repository.createFolder(scopeA, { name: 'Before import' })
    const exported = await repository.exportAccountData(scopeA)
    await repository.updateSettings(scopeA, { enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] })
    await repository.importAccountData(scopeA, { ...exported, folders: [{ ...exported.folders[0], name: 'Imported' }] })
    expect((await repository.listFolders(scopeA))[0].name).toBe('Imported')
    expect(await repository.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] })
    const protection = (await repository.listSnapshots(scopeA)).find((row) => row.reasons?.includes('before-import'))!
    expect(protection).toBeDefined()
    expect(protection.protectedUntil).toBeUndefined()
  })

  it('rejects a different-scope import, retains old restore points, and honors lease expiry', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Scope data' })
    const exported = await repository.exportAccountData(scopeA)
    await expect(repository.importAccountData(scopeB, exported)).rejects.toThrow('different account scope')
    const stale = await repository.createSnapshot(scopeA, 'manual')
    await db.folder_snapshots.update(stale.id, { createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' })
    await repository.createFolder(scopeA, { name: 'Another folder' })
    expect((await repository.listSnapshots(scopeA)).some((snapshot) => snapshot.id === stale.id)).toBe(true)
    await repository.acquireCoordinatorLease(scopeA, 'owner-a', 10_000)
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).rejects.toThrow('held by another')
    await db.folder_coordinator_leases.update(scopeA, { expiresAt: '2000-01-01T00:00:00.000Z' })
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).resolves.toMatchObject({ ownerId: 'owner-b' })
  })

  it('persists compressed business data without settings, export metadata or repeated row scopes', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Business data' })
    await repository.updateSettings(scopeA, { collapsedFolderIds: [folder.id] })
    const generation = await repository.getOrCreateBrowserSyncGeneration(scopeA)
    const data = decodeLzStringBase64<Record<string, unknown>>(generation.payload)
    expect(Object.keys(data).sort()).toEqual(['chatReferences', 'folders', 'memberships'])
    expect((data.folders as object[])[0]).not.toHaveProperty('accountScopeId')
    expect(generation.payloadHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await repository.exportAccountData(scopeA)).toMatchObject({ settings: { enabled: true, hideOrganizedChats: false } })
    expect(JSON.stringify(await repository.exportAccountData(scopeA))).not.toContain('collapsedFolderIds')
  })

  it('rebuilds a corrupted prepared payload from the durable outbox', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Recoverable generation' })
    const malformed = await repository.getOrCreateBrowserSyncGeneration(scopeA)
    await db.folder_sync_generations.update(malformed.id, { payload: 'corrupted' })
    const rebuilt = await repository.getOrCreateBrowserSyncGeneration(scopeA)
    expect(rebuilt.id).not.toBe(malformed.id)
    expect(await db.folder_sync_generations.get(malformed.id)).toMatchObject({ state: 'superseded' })
  })

  it('reuses one persisted epoch, revision and prepared generation for an empty account', async () => {
    const repository = new FolderRepositoryImpl()
    const [first, second] = await Promise.all([
      repository.getOrCreateBrowserSyncGeneration(scopeA), repository.getOrCreateBrowserSyncGeneration(scopeA),
    ])
    expect(second.id).toBe(first.id)
    expect(second.syncEpoch).toBe(first.syncEpoch)
    expect(second.dataRevision).toBe(first.dataRevision)
  })

  it('preserves local collapse on incoming data and import and keeps newer switches pending after an old acknowledgement', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Local view' })
    await repository.updateSettings(scopeA, { collapsedFolderIds: [folder.id] })
    const data = await repository.getAccountData(scopeA)
    await repository.applyBrowserSyncPayload(scopeA, data, 'remote-revision', 'remote-epoch', false)
    expect((await repository.getSettings(scopeA)).collapsedFolderIds).toEqual([folder.id])
    const exported = await repository.exportAccountData(scopeA)
    await repository.importAccountData(scopeA, exported)
    expect((await repository.getSettings(scopeA)).collapsedFolderIds).toEqual([folder.id])
    const first = await repository.updateSettings(scopeA, { enabled: false })
    const latest = await repository.updateSettings(scopeA, { hideOrganizedChats: true })
    await repository.applyBrowserSyncSettings(scopeA, { enabled: first.enabled, hideOrganizedChats: first.hideOrganizedChats }, first.settingsVersion)
    expect(await repository.getSettings(scopeA)).toMatchObject({ settingsVersion: latest.settingsVersion, settingsPending: true, hideOrganizedChats: true })
    expect((await repository.getSettings(scopeB)).collapsedFolderIds).toEqual([])
  })

  it('keeps collapse changes local without outbox operations, revisions or pending settings', async () => {
    const repository = new FolderRepositoryImpl()
    const folder = await repository.createFolder(scopeA, { name: 'Local view' })
    const before = await repository.getSyncState(scopeA)
    const settings = await repository.getSettings(scopeA)
    const operations = await db.folder_operations.count()
    await repository.updateSettings(scopeA, { collapsedFolderIds: [folder.id] })
    expect((await repository.getSyncState(scopeA))?.localDataRevision).toBe(before?.localDataRevision)
    expect(await db.folder_operations.count()).toBe(operations)
    expect(await repository.getSettings(scopeA)).toMatchObject({ collapsedFolderIds: [folder.id], settingsVersion: settings.settingsVersion, settingsPending: false })
  })

  it('merges switches as one register while retaining the local view and detecting later offline edits', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.updateSettings(scopeA, { collapsedFolderIds: ['local-folder'] })
    const newer = '9999999999000:000000:remote-device'
    await repository.applyBrowserSyncSettings(scopeA, { enabled: false, hideOrganizedChats: true }, newer)
    expect(await repository.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: ['local-folder'], settingsPending: false })
    await repository.updateSettings(scopeA, { enabled: true })
    const local = await repository.getSettings(scopeA)
    expect(local.settingsVersion > newer).toBe(true)
    expect(local.settingsPending).toBe(true)
    await repository.applyBrowserSyncSettings(scopeA, { enabled: false, hideOrganizedChats: false }, newer)
    expect(await repository.getSettings(scopeA)).toEqual(local)
    expect(await repository.listBrowserSyncWakeScopes()).toContain(scopeA)
    expect(await db.folder_operations.count()).toBe(0)
  })

  it('removes every local membership and title cache only through the post-Gemini-delete repository command', async () => {
    const repository = new FolderRepositoryImpl()
    const first = await repository.createFolder(scopeA, { name: 'First folder' })
    const second = await repository.createFolder(scopeA, { name: 'Second folder' })
    await repository.upsertMembership(scopeA, { folderId: first.id, chatId: 'chat-delete', cachedTitle: 'Delete me' })
    await repository.upsertMembership(scopeA, { folderId: second.id, chatId: 'chat-delete' })

    await repository.removeChatAfterGeminiDelete(scopeA, 'chat-delete')

    expect((await repository.getProjection(scopeA)).memberships).toEqual([])
    expect(await db.folder_chat_references.get([scopeA, 'chat-delete'])).toBeUndefined()
    expect((await db.folder_operations.where('accountScopeId').equals(scopeA).toArray()).some((operation) => operation.payload.source === 'gemini-delete')).toBe(true)
  })
})
