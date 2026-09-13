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
import { decodeAndVerifyEnvelopePayload } from '@/services/folder-sync/codec'

const scopeA = 'account-scope-0001'
const scopeB = 'account-scope-0002'

async function clearFolderTables(): Promise<void> {
  await Promise.all([
    db.folders.clear(),
    db.folder_memberships.clear(),
    db.folder_chat_references.clear(),
    db.folder_settings.clear(),
    db.folder_operations.clear(),
    db.folder_sync_states.clear(),
    db.folder_snapshots.clear(),
    db.folder_coordinator_leases.clear(),
  ])
}

describe('FolderRepository', () => {
  beforeEach(async () => {
    storage.clear()
    await clearFolderTables()
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
    expect(state).toMatchObject({ accountScopeId: scopeA, provider: 'browser-sync', authorityEpoch: expect.any(String), dataRevision: expect.any(String) })
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
    const snapshot = await repository.createSnapshot(scopeA, 'automatic')
    await repository.updateSettings(scopeA, { enabled: false, hideOrganizedChats: true, collapsedFolderIds: [folder.id] })
    const currentSettings = await repository.getSettings(scopeA)
    await repository.deleteFolder(scopeA, folder.id)

    await repository.restoreSnapshot(scopeA, snapshot.id)

    expect((await repository.listFolders(scopeA)).map((entry) => entry.name)).toEqual(['Before restore'])
    expect(await repository.getSettings(scopeA)).toMatchObject({ enabled: false, hideOrganizedChats: true, collapsedFolderIds: [] })
    expect((await repository.getSettings(scopeA)).fieldVersions).toEqual(currentSettings.fieldVersions)
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

  it('rejects a different-scope import, retains 30 snapshots, and honors lease expiry', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Scope data' })
    const exported = await repository.exportAccountData(scopeA)
    await expect(repository.importAccountData(scopeB, exported)).rejects.toThrow('different account scope')
    const stale = await repository.createSnapshot(scopeA, 'automatic')
    await db.folder_snapshots.update(stale.id, { createdAt: '2000-01-01T00:00:00.000Z' })
    await repository.createSnapshot(scopeA, 'automatic')
    expect((await repository.listSnapshots(scopeA)).some((snapshot) => snapshot.id === stale.id)).toBe(false)
    for (let index = 0; index < 31; index += 1) await repository.createSnapshot(scopeA, 'automatic')
    expect(await repository.listSnapshots(scopeA)).toHaveLength(30)
    await repository.acquireCoordinatorLease(scopeA, 'owner-a', 10_000)
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).rejects.toThrow('held by another')
    await db.folder_coordinator_leases.update(scopeA, { expiresAt: '2000-01-01T00:00:00.000Z' })
    await expect(repository.acquireCoordinatorLease(scopeA, 'owner-b')).resolves.toMatchObject({ ownerId: 'owner-b' })
  })

  it('verifies the compressed Envelope content hash before decoding it', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Envelope data' })
    const envelope = await repository.createSyncEnvelope(scopeA)
    await expect(decodeAndVerifyEnvelopePayload(envelope)).resolves.toMatchObject({ accountScopeId: scopeA })
    await expect(decodeAndVerifyEnvelopePayload({ ...envelope, payload: `${envelope.payload}A` })).rejects.toThrow('hash')
  })

  it('rebuilds a locally malformed prepared generation from the durable outbox', async () => {
    const repository = new FolderRepositoryImpl()
    await repository.createFolder(scopeA, { name: 'Recoverable generation' })
    const malformed = await repository.getOrCreateBrowserSyncGeneration(scopeA)
    await db.folder_sync_generations.update(malformed.id, { serializedEnvelope: '{not-json' })

    const rebuilt = await repository.getOrCreateBrowserSyncGeneration(scopeA)

    expect(rebuilt.id).not.toBe(malformed.id)
    expect(await db.folder_sync_generations.get(malformed.id)).toMatchObject({ state: 'superseded' })
    await expect(decodeAndVerifyEnvelopePayload(JSON.parse(rebuilt.serializedEnvelope))).resolves.toMatchObject({ accountScopeId: scopeA })
  })

  it('persists a single authority epoch and revision when an empty account creates consecutive Envelopes', async () => {
    const repository = new FolderRepositoryImpl()
    const [first, second] = await Promise.all([
      repository.createSyncEnvelope(scopeA),
      repository.createSyncEnvelope(scopeA),
    ])
    expect(second.authority).toEqual(first.authority)
    expect(second.dataRevision).toBe(first.dataRevision)
    expect(await db.folder_sync_states.get(scopeA)).toMatchObject({ authorityEpoch: first.authority.epoch, dataRevision: first.dataRevision })
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
