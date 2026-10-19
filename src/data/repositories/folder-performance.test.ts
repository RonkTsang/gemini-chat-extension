import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { db } from '../db'
import { rebuildFolderSummary } from '../folder-summary'
import { FolderRepositoryImpl } from './folderRepository'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'
import { compareAscii, rebalanceOrderKeys } from '@/domain/folder/order-key'
import { indexFolder, indexMembership, membershipDisplayOrderKey } from '@/domain/folder/local-indexes'
import { compareMembershipOrder } from '@/domain/folder/membership-order'
import { countFolderOrganization } from '@/domain/folder/organization-summary'
import { toFolderOrganizationData } from '@/domain/folder/organization-data'
import { ROOT_FOLDER_ID, type FolderAccountData, type FolderMembershipRow, type FolderRow } from '@/domain/folder/types'
import { observeFolderIndexedDB } from '@/test/folder-idb-observer'
import { resetStorage, scopeA, scopeB, publication } from '@/services/folder-sync/test-storage'
import type { FolderAccessReport } from '../folder-access'
import { folderAccessMiddleware } from '../folder-access'

const timestamp = '2026-10-18T00:00:00.000Z'
const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'performance-device' })
const queries = new FolderQueryService()
let debug: ReturnType<typeof vi.spyOn>
let native: ReturnType<typeof observeFolderIndexedDB> | undefined
beforeEach(async () => {
  await resetStorage()
  debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { native?.stop(); native = undefined; vi.restoreAllMocks() })

function fixture(folderCount: number, chatsPerFolder: number, scope = scopeA): FolderAccountData {
  const ids = Array.from({ length: folderCount }, (_, index) => `${scope}:folder-${index}`)
  const folderKeys = rebalanceOrderKeys(ids)
  const chatIds = Array.from({ length: chatsPerFolder }, (_, index) => `chat-${index}`)
  const keys = rebalanceOrderKeys(chatIds)
  const folders: FolderRow[] = ids.map((id, index) => ({ id, accountScopeId: scope, parentFolderId: ROOT_FOLDER_ID,
    name: `Folder ${index}`, iconKey: 'folder', colorValue: 'neutral', orderKey: folderKeys.get(id)!, createdAt: timestamp, updatedAt: timestamp }))
  const memberships: FolderMembershipRow[] = folders.flatMap((folder) => chatIds.map((chatId, index) => ({
    id: `${scope}:${folder.id}:${chatId}`, accountScopeId: scope, folderId: folder.id, chatId,
    orderKey: keys.get(chatId)!, ...(index % 7 === 0 ? { pinnedOrderKey: keys.get(chatId)! } : {}), createdAt: timestamp, updatedAt: timestamp,
  })))
  return { accountScopeId: scope, folders, memberships,
    chatReferences: chatIds.map((chatId) => ({ accountScopeId: scope, chatId, cachedTitle: 'PRIVATE-SYNTHETIC-TITLE', createdAt: timestamp, updatedAt: timestamp })) }
}

async function seed(data: FolderAccountData, clearAll = false): Promise<void> {
  await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_organization_summaries], async (transaction) => {
    for (const table of [db.folders, db.folder_memberships, db.folder_chat_references]) {
      if (clearAll) await table.clear()
      else await table.where('accountScopeId').equals(data.accountScopeId).delete()
    }
    if (clearAll) { await db.folder_organization_summaries.clear() }
    await db.folders.bulkPut(data.folders.map(indexFolder))
    await db.folder_memberships.bulkPut(data.memberships.map(indexMembership))
    await db.folder_chat_references.bulkPut(data.chatReferences)
    await rebuildFolderSummary(transaction, data)
  })
}
function recordCount(table: string): number { return native?.tables[table]?.records ?? 0 }
function reports(): FolderAccessReport[] {
  return debug.mock.calls.filter(([label]: unknown[]) => label === '[Folders][data-access]').map(([, value]: unknown[]) => JSON.parse(String(value)) as FolderAccessReport)
}
async function expectSummary(): Promise<void> {
  const data = await repository().getAccountData(scopeA)
  const status = await queries.getSyncStatus(scopeA)
  expect({ folderCount: status.folderCount, chatCount: status.chatCount }).toEqual(countFolderOrganization(data.folders, data.memberships))
}

describe('Folder indexed access budgets (native IDB observation)', () => {
  it.each([[1, 10], [5, 1000], [50, 10], [1, 10000], [5, 10000]])(
    '%i folders × %i chats: fixed first pages materialize only limit+1 rows', async (folderCount, chatsPerFolder) => {
      const data = fixture(folderCount, chatsPerFolder)
      await seed(data)
      native = observeFolderIndexedDB()
      const sidebar = await queries.getSidebarState(scopeA, 5)
      const visible = Math.min(5, folderCount)
      expect(sidebar.folders).toHaveLength(visible)
      expect(sidebar.folders.every((row) => row.chatCount === chatsPerFolder)).toBe(true)
      expect(recordCount('folders')).toBe(Math.min(folderCount, 6))
      expect(recordCount('folder_memberships')).toBe(visible * Math.min(chatsPerFolder, 11))
      expect(native.tables.folder_memberships.countRequests).toBe(visible)
      expect(recordCount('folder_chat_references')).toBe(visible * Math.min(chatsPerFolder, 10))
      const report = reports().find((row) => row.operation === 'getSidebarState')!
      expect(report.traceId).toMatch(/^folder-data-/)
      for (const [name, counts] of Object.entries(native.tables)) {
        expect(report.tables[name]?.records ?? 0).toBe(counts.records)
        expect(report.tables[name]?.keys ?? 0).toBe(counts.keys)
        expect(report.tables[name]?.countRequests ?? 0).toBe(counts.countRequests)
      }
      expect(JSON.stringify(report)).not.toContain('PRIVATE-SYNTHETIC-TITLE')
      native.reset()
      const status = await queries.getSyncStatus(scopeA)
      expect(status.chatCount).toBe(chatsPerFolder)
      expect(status.folderCount).toBe(folderCount)
      for (const table of ['folders', 'folder_memberships', 'folder_sync_conflicts']) expect(recordCount(table)).toBe(0)
      expect(native.tables.folders.countRequests).toBe(1)
    }, 60000,
  )

  it('uses strict compound cursors across ties, pins, deleted boundaries, final pages and accounts', async () => {
    const data = fixture(3, 23)
    data.folders.forEach((row, index) => { row.orderKey = 'U'.repeat(32); row.id = ['a', 'Z', 'z'][index] })
    data.memberships.forEach((row, index) => {
      row.folderId = data.folders[Math.floor(index / 23)].id
      row.id = `${scopeA}:${row.folderId}:${row.chatId}`
      row.orderKey = 'U'.repeat(32)
      if (row.pinnedOrderKey) row.pinnedOrderKey = 'V'.repeat(32)
    })
    await seed(data); await seed(fixture(1, 30, scopeB))
    const expectedFolders = [...data.folders].sort((a, b) => compareAscii(a.id, b.id)).map((row) => row.id)
    const actualFolders: string[] = []
    let cursor: string | undefined
    do {
      const result = await queries.listFolders(scopeA, cursor, 1)
      actualFolders.push(...result.items.map((row) => row.id)); cursor = result.nextCursor
    } while (cursor)
    expect(actualFolders).toEqual(expectedFolders)
    const folderId = 'Z'
    const expected = data.memberships.filter((row) => row.folderId === folderId).sort(compareMembershipOrder)
    const actual: string[] = []
    native = observeFolderIndexedDB()
    do {
      native.reset()
      const result = await queries.listFolderChats(scopeA, folderId, cursor, 3)
      expect(recordCount('folder_memberships')).toBeLessThanOrEqual(4)
      actual.push(...result.items.map((row) => row.chatId)); cursor = result.nextCursor
      if (actual.length === 3) await repository().removeMembership(scopeA, folderId, actual[2])
    } while (cursor)
    expect(actual).toEqual(expected.map((row) => row.chatId))
    expect(await queries.listFolderChats(scopeA, 'missing', undefined, 10)).toEqual({ items: [], nextCursor: undefined })
    await expect(queries.listFolders(scopeA, 'invalid', 10)).rejects.toThrow('Cursor')
    await expect(queries.listFolderChats(scopeA, folderId, undefined, 0)).rejects.toThrow('limit')
  })

  it('keeps normal writes bounded when unrelated membership data grows tenfold', async () => {
    const data = fixture(5, 100)
    await seed(data)
    const repo = repository()
    const folderId = data.folders[0].id
    const otherId = data.folders[1].id
    native = observeFolderIndexedDB()
    const run = async () => {
      const read = async (action: () => Promise<unknown>, maximum: number) => {
        native!.reset(); await action()
        expect(recordCount('folder_memberships')).toBeLessThanOrEqual(maximum)
        const report = reports().at(-1)!
        if (report.phase === 'transaction') {
          expect(report.accountScopeId).toBe(scopeA)
          expect(report.tables.folder_memberships?.records ?? 0).toBe(recordCount('folder_memberships'))
        }
        return recordCount('folder_memberships')
      }
      const counts = []
      counts.push(await read(() => repo.upsertMembership(scopeA, { folderId, chatId: 'new' }), 2))
      counts.push(await read(() => repo.setMembershipPinned(scopeA, folderId, 'new', true), 4))
      counts.push(await read(() => repo.setMembershipPinned(scopeA, folderId, 'new', false), 2))
      counts.push(await read(() => repo.moveMembership(scopeA, folderId, 'new', otherId), 5))
      counts.push(await read(() => repo.removeMembership(scopeA, otherId, 'new'), 1))
      return counts
    }
    const before = await run()
    native.stop()
    await seed(fixture(5, 1000), true)
    native = observeFolderIndexedDB()
    expect(await run()).toEqual(before)
    native.stop()
    await seed(fixture(50, 100), true)
    await seed(fixture(1, 100, scopeB))
    native = observeFolderIndexedDB()
    expect(await run()).toEqual(before)
    native.reset()
    await repo.updateFolder(scopeA, folderId, { name: data.folders[0].name })
    expect(recordCount('folders')).toBe(1)
    expect(native.tables.folders.keys).toBe(0)
    native.reset()
    await repo.moveFolder(scopeA, folderId, ROOT_FOLDER_ID)
    expect(recordCount('folders')).toBeLessThanOrEqual(4)
    expect(native.tables.folders.keys).toBe(0)
    const options = await queries.resolveChatMemberships(scopeA, ['chat-1', 'chat-1', 'missing'])
    expect(options).toEqual(['chat-1'])
    await expectSummary()
  }, 60000)

  it('counts picker and helper access completely and separates protection capture from subtree deletion', async () => {
    const data = fixture(5, 100); await seed(data)
    const repo = repository()
    const root = data.folders[0]
    const child = (await repo.createFolder(scopeA, { name: 'Child', parentFolderId: root.id })).data
    await repo.upsertMembership(scopeA, { folderId: child.id, chatId: 'child-only' })
    await repo.upsertMembership(scopeA, { folderId: root.id, chatId: 'root-only' })
    native = observeFolderIndexedDB()
    const picker = await queries.getPickerOptions(scopeA, 'chat-1', undefined, 3)
    expect(picker.items).toHaveLength(3)
    expect(recordCount('folders')).toBe(4)
    expect(recordCount('folder_memberships')).toBe(3)
    expect(reports().at(-1)?.operation).toBe('getPickerOptions')
    expect(reports().at(-1)?.tables.folder_memberships.records).toBe(3)
    native.reset()
    expect(await queries.resolveChatMemberships(scopeA, ['chat-1', 'chat-1', 'missing'])).toEqual(['chat-1'])
    expect(recordCount('folder_memberships')).toBe(0)
    expect(native.tables.folder_memberships.keys).toBe(1)
    native.reset()
    expect(await queries.getFolderDeleteImpact(scopeA, root.id)).toEqual({ chatCount: 101 })
    expect(recordCount('folder_memberships')).toBe(0)
    expect(native.tables.folder_memberships.countRequests).toBe(1)
    native.reset()
    await repo.deleteFolder(scopeA, root.id)
    const report = reports().findLast((row) => row.operation === 'deleteFolder')!
    expect(report.tables.folder_memberships.records).toBe(102)
    expect(report.tables.folders.records).toBe(2)
    expect(reports().some((row) => row.phase === 'full-capture')).toBe(true)
    const business = [...native.transactions].find(([transaction]) => transaction.mode === 'readwrite'
      && transaction.objectStoreNames.contains('folder_organization_summaries'))![1]
    for (const [name, counts] of Object.entries(business)) {
      expect(report.tables[name]?.records ?? 0).toBe(counts.records)
      expect(report.tables[name]?.keys ?? 0).toBe(counts.keys)
      expect(report.tables[name]?.writes ?? 0).toBe(counts.writes)
      expect(report.tables[name]?.deleteRequests ?? 0).toBe(counts.deleteRequests)
    }
    expect(await db.folder_chat_references.get([scopeA, 'child-only'])).toBeUndefined()
    expect(await db.folder_chat_references.get([scopeA, 'root-only'])).toBeUndefined()
    expect(await db.folder_chat_references.get([scopeA, 'chat-1'])).toBeDefined()
    await expectSummary()
  })

  it('declares only operation tables, sharing one transaction with revision guards', async () => {
    const data = fixture(2, 10); await seed(data)
    native = observeFolderIndexedDB()
    const expectTables = async (action: () => Promise<unknown>, names: string[]) => {
      native!.reset(); await action()
      expect(native!.transactions.size).toBe(1)
      const [transaction] = native!.transactions.keys()
      expect([...transaction.objectStoreNames].sort()).toEqual(names.sort())
    }
    await expectTables(() => queries.listFolderChats(scopeA, data.folders[0].id, undefined, 10), ['folder_memberships', 'folder_chat_references'])
    await expectTables(() => queries.getFolderDeleteImpact(scopeA, data.folders[0].id), ['folder_memberships'])
    await expectTables(() => queries.readProjection(scopeA, () => queries.getFolderDeleteImpact(scopeA, data.folders[0].id), 'getFolderDeleteImpact'), ['folder_memberships', 'folder_sync_states'])
    await expectTables(() => queries.getSidebarState(scopeA, 5), ['folders', 'folder_memberships', 'folder_chat_references', 'folder_settings'])
    await expectTables(() => repository().updateFolder(scopeA, data.folders[0].id, { name: 'Renamed' }), ['folders', 'folder_sync_states', 'folder_recovery_states'])
    await expectTables(() => repository().setMembershipPinned(scopeA, data.folders[0].id, 'chat-1', true), ['folders', 'folder_memberships', 'folder_sync_states', 'folder_recovery_states'])
    native.reset()
    await queries.getSyncStatus(scopeA)
    expect(recordCount('folders')).toBe(0)
    expect(recordCount('folder_memberships')).toBe(0)
  })

  it('ignores orphan and foreign-folder memberships when maintaining first and last chat counts', async () => {
    const repo = repository()
    const first = (await repo.createFolder(scopeA, { name: 'First' })).data
    const second = (await repo.createFolder(scopeA, { name: 'Second' })).data
    const foreign = indexFolder({ ...fixture(1, 1, scopeB).folders[0], id: '0-foreign' })
    await db.folders.put(foreign)
    for (const folderId of ['0-orphan', foreign.id]) {
      await db.folder_memberships.put(indexMembership({ ...fixture(1, 1).memberships[0], id: `${scopeA}:${folderId}:shared`, folderId, chatId: 'shared' }))
    }
    native = observeFolderIndexedDB()
    await Promise.all([repo.upsertMembership(scopeA, { folderId: first.id, chatId: 'shared' }), repo.upsertMembership(scopeA, { folderId: second.id, chatId: 'shared' })])
    expect(recordCount('folder_memberships')).toBeLessThanOrEqual(2)
    expect((await queries.getSyncStatus(scopeA)).chatCount).toBe(1)
    await expectSummary()
    await Promise.all([repo.removeMembership(scopeA, first.id, 'shared'), repo.removeMembership(scopeA, second.id, 'shared')])
    expect((await queries.getSyncStatus(scopeA)).chatCount).toBe(0)
    expect(await db.folder_chat_references.get([scopeA, 'shared'])).toBeUndefined()
    expect(await db.folder_memberships.count()).toBe(2)
    await expectSummary()
    await repo.upsertMembership(scopeA, { folderId: first.id, chatId: 'shared' })
    expect((await queries.getSyncStatus(scopeA)).chatCount).toBe(1)
    await repo.removeMembership(scopeA, '0-orphan', 'shared')
    expect((await queries.getSyncStatus(scopeA)).chatCount).toBe(1)
    expect(db.tables.some((table) => table.name === 'folder_chat_usage')).toBe(false)
  })

  it('keeps production query results and transaction scopes without diagnostic reports', async () => {
    const data = fixture(1, 10); await seed(data)
    const repo = repository()
    await repo.updateFolder(scopeA, data.folders[0].id, { name: 'Initial' })
    native = observeFolderIndexedDB()
    const read = () => queries.readProjection(scopeA, () => queries.listFolderChats(scopeA, data.folders[0].id, undefined, 10), 'listFolderChats')
    const observed = await read()
    const observedCounts = structuredClone(native.tables)
    const scopes = () => [...native!.transactions.keys()].map((transaction) => [...transaction.objectStoreNames].sort())
    const observedScopes = scopes()
    expect(observedScopes).toHaveLength(1)
    expect(reports().at(-1)).toMatchObject({ operation: 'listFolderChats', dataRevision: observed.dataRevision })
    native.reset()
    await repo.updateFolder(scopeA, data.folders[0].id, { name: 'Development' })
    const mutationCounts = structuredClone(native.tables)
    const mutationScopes = scopes()
    const mutationReport = reports().at(-1)!
    expect(mutationReport.result).toBe('success')
    native.reset()
    vi.stubEnv('DEV', false)
    try {
      const logCount = debug.mock.calls.length
      const production = await read()
      expect(production.data).toEqual(observed.data)
      expect(production.dataRevision).toBe(mutationReport.committedRevision)
      expect(native.tables).toEqual(observedCounts)
      expect(scopes()).toEqual(observedScopes)
      native.reset()
      await repo.updateFolder(scopeA, data.folders[0].id, { name: 'Production' })
      expect(native.tables).toEqual(mutationCounts)
      expect(scopes()).toEqual(mutationScopes)
      expect(debug.mock.calls.length).toBe(logCount)
    } finally { vi.unstubAllEnvs() }
  })

  it('isolates concurrent query observations after a failed query without request context', async () => {
    const data = fixture(1, 20); await seed(data)
    const folderId = data.folders[0].id
    await expect(queries.listFolderChats(scopeA, folderId, undefined, 0)).rejects.toThrow('limit')
    expect(reports().at(-1)).toMatchObject({ operation: 'listFolderChats', result: 'failed' })
    debug.mockClear()
    const results = await Promise.all([3, 7].map((limit) => queries.readProjection(scopeA,
      () => queries.listFolderChats(scopeA, folderId, undefined, limit), 'listFolderChats')))
    expect(results.map((result) => result.data.items.length)).toEqual([3, 7])
    const access = reports()
    expect(access).toHaveLength(2)
    expect(new Set(access.map((report) => report.traceId)).size).toBe(2)
    expect(access.map((report) => report.tables.folder_memberships.records).sort((a, b) => a - b)).toEqual([4, 8])
    expect(access.map((report) => report.tables.folder_chat_references.records).sort((a, b) => a - b)).toEqual([3, 7])
    expect(access.every((report) => report.result === 'success' && report.dataRevision === results[0].dataRevision)).toBe(true)
  })

  it('rejects foreign or nonadjacent anchors and only rebalances the exhausted target group', async () => {
    const data = fixture(3, 10); await seed(data); await seed(fixture(1, 3, scopeB))
    const repo = repository()
    const [target, unaffected] = data.folders
    const pinned = await db.folder_memberships.get(data.memberships[0].id)
    await db.folder_memberships.update(pinned!.id, { pinnedOrderKey: '1'.padStart(32, '0'), displayOrderKey: `0${'1'.padStart(32, '0')}` })
    const before = await db.folder_memberships.where('[accountScopeId+folderId]').equals([scopeA, unaffected.id]).toArray()
    native = observeFolderIndexedDB()
    await repo.setMembershipPinned(scopeA, target.id, 'chat-1', true)
    expect(reports().some((row) => 'rows' in row)).toBe(true)
    const all = await repo.listMemberships(scopeA)
    for (const prior of data.memberships) expect(all.find((row) => row.id === prior.id)?.orderKey).toBe(prior.orderKey)
    expect(await db.folder_memberships.where('[accountScopeId+folderId]').equals([scopeA, unaffected.id]).toArray()).toEqual(before)
    const foreign = fixture(1, 3, scopeB)
    await expect(repo.moveMembership(scopeA, target.id, 'chat-1', target.id, { beforeId: foreign.memberships[1].id })).rejects.toThrow('unavailable')
    await expect(repo.moveFolder(scopeA, target.id, ROOT_FOLDER_ID, { beforeId: foreign.folders[0].id })).rejects.toThrow('unavailable')
    const ordered = [...data.folders].sort((a, b) => compareAscii(a.orderKey, b.orderKey))
    await expect(repo.createFolder(scopeA, { name: 'Nonadjacent', afterId: ordered[0].id, beforeId: ordered[2].id })).rejects.toThrow('adjacent')
    await expect(repo.updateFolder(scopeA, target.id, { name: ' ＦＯＬＤＥＲ １ ' })).rejects.toThrow('already exists')
  })

  it('maintains deduplicated counts through sharing, subtree deletion, import, restore, remote replacement and restart', async () => {
    const repo = repository()
    const root = (await repo.createFolder(scopeA, { name: 'Root' })).data
    const child = (await repo.createFolder(scopeA, { name: 'Child', parentFolderId: root.id })).data
    const other = (await repo.createFolderAndAddChat(scopeA, { name: 'Other' }, 'shared')).data.folder
    await repo.upsertMembership(scopeA, { folderId: child.id, chatId: 'shared' })
    await repo.upsertMembership(scopeA, { folderId: child.id, chatId: 'unique' })
    await expectSummary()
    await repo.moveMembership(scopeA, child.id, 'unique', other.id)
    await repo.removeMembership(scopeA, child.id, 'shared'); await expectSummary()
    const backup = await repo.exportAccountData(scopeA)
    expect(JSON.stringify(backup)).not.toMatch(/nameKey|displayOrderKey/)
    await repo.deleteFolder(scopeA, root.id); await expectSummary()
    await repo.importAccountData(scopeA, backup); await expectSummary()
    const snapshot = await repo.createSnapshot(scopeA, 'manual')
    await repo.removeChatAfterGeminiDelete(scopeA, 'shared'); await expectSummary()
    await repo.restoreSnapshot(scopeA, snapshot.id); await expectSummary()
    const incoming = fixture(2, 7)
    const revision = (await repo.getSyncState(scopeA))!.localDataRevision
    const pending = await publication('incoming', toFolderOrganizationData(incoming))
    const manifest = { schemaVersion: 4 as const, accountScopeId: scopeA, snapshotId: pending.id, chunkCount: 1,
      payloadBytes: pending.payload.length, payloadHash: pending.payloadHash, settings: pending.settings }
    expect(await repo.recordBrowserSyncConflict(scopeA, incoming, manifest, revision)).toBe(true)
    native = observeFolderIndexedDB()
    expect((await queries.getSyncStatus(scopeA)).conflict?.snapshotId).toBe('incoming')
    expect(recordCount('folder_sync_conflicts')).toBe(0)
    expect(await repo.applyBrowserSyncSnapshot(scopeA, incoming, manifest, revision, true)).toBe(true)
    await expectSummary()
    expect((await queries.getSyncStatus(scopeA)).conflict).toBeUndefined()
    db.close(); await db.open()
    expect((await new FolderQueryService().getSyncStatus(scopeA)).chatCount).toBe(7)
    expect(await db.folder_memberships.toArray()).toEqual(expect.arrayContaining(incoming.memberships.map((row) => expect.objectContaining({
      id: row.id, displayOrderKey: row.pinnedOrderKey ? `0${row.pinnedOrderKey}` : `1${row.orderKey}`,
    }))))
  })

  it('rolls back counters, revision and data together, reports failure, and writes one revision for Gemini deletion', async () => {
    const repo = repository()
    const { folder } = (await repo.createFolderAndAddChat(scopeA, { name: 'Atomic' }, 'one')).data
    const before = await db.folder_sync_states.get(scopeA)
    const recovery = await db.folder_recovery_states.get(scopeA)
    const put = vi.spyOn(db.folder_chat_references, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    await expect(repo.upsertMembership(scopeA, { folderId: folder.id, chatId: 'failed' })).rejects.toThrow('full')
    put.mockRestore()
    expect(await db.folder_sync_states.get(scopeA)).toEqual(before)
    expect(await db.folder_recovery_states.get(scopeA)).toEqual(recovery)
    expect(await db.folder_memberships.get(`${scopeA}:${folder.id}:failed`)).toBeUndefined()
    await expectSummary()
    expect(reports().find((row) => row.operation === 'upsertMembership')?.result).toBe('rollback')
    const stateWrites = vi.spyOn(db.folder_sync_states, 'put')
    await repo.removeChatAfterGeminiDelete(scopeA, 'one')
    expect(stateWrites).toHaveBeenCalledTimes(1)
    await expectSummary()
  })

  it('keeps tree safety while visiting only actual ancestors and descendants', async () => {
    const repo = repository()
    const a = (await repo.createFolder(scopeA, { name: 'A' })).data
    const b = (await repo.createFolder(scopeA, { name: 'B', parentFolderId: a.id })).data
    const c = (await repo.createFolder(scopeA, { name: 'C', parentFolderId: b.id })).data
    await expect(repo.moveFolder(scopeA, a.id, c.id)).rejects.toThrow('descendant')
    const foreign = (await repo.createFolder(scopeB, { name: 'Foreign' })).data
    await expect(repo.moveFolder(scopeA, b.id, foreign.id)).rejects.toThrow('unavailable')
    const foreignMembership = { ...fixture(1, 1, scopeB).memberships[0], folderId: foreign.id, chatId: 'foreign-probe', id: `${scopeA}:${a.id}:foreign-probe` }
    await db.folder_memberships.put(foreignMembership)
    await expect(repo.upsertMembership(scopeA, { folderId: a.id, chatId: 'foreign-probe' })).rejects.toThrow('unavailable')
    await expect(repo.moveMembership(scopeA, a.id, 'foreign-probe', b.id)).rejects.toThrow('unavailable')
    await expect(repo.setMembershipPinned(scopeA, a.id, 'foreign-probe', true)).rejects.toThrow('unavailable')
    await expect(repo.removeMembership(scopeA, a.id, 'foreign-probe')).rejects.toThrow('unavailable')
    expect(await db.folder_memberships.get(foreignMembership.id)).toMatchObject(foreignMembership)
    let parent = c.id
    for (let index = 3; index < 32; index++) parent = (await repo.createFolder(scopeA, { name: `Deep ${index}`, parentFolderId: parent })).data.id
    await expect(repo.createFolder(scopeA, { name: 'Too deep', parentFolderId: parent })).rejects.toThrow('depth')
    const root = (await repo.createFolder(scopeA, { name: 'Target' })).data
    await expect(repo.moveFolder(scopeA, a.id, root.id)).rejects.toThrow('depth')
    await repo.moveFolder(scopeA, c.id, ROOT_FOLDER_ID)
    await expectSummary()
  })

  it('diagnostics disabled add no IDB reads and enabled counts match native writes and reverse cursors', async () => {
    const data = fixture(2, 20); await seed(data)
    native = observeFolderIndexedDB()
    await queries.listFolderChats(scopeA, data.folders[0].id, undefined, 10)
    const enabled = structuredClone(native.tables)
    vi.stubEnv('DEV', false)
    db.close(); db.unuse({ stack: 'dbcore', name: 'FolderAccess' }); await db.open()
    try {
      native.reset()
      const logs = debug.mock.calls.length
      await queries.listFolderChats(scopeA, data.folders[0].id, undefined, 10)
      expect(native.tables).toEqual(enabled)
      expect(debug.mock.calls.length).toBe(logs)
    } finally { vi.unstubAllEnvs(); db.close(); db.use(folderAccessMiddleware); await db.open() }
    native.reset()
    await repository().moveMembership(scopeA, data.folders[0].id, 'chat-9', data.folders[0].id, { beforeId: data.memberships[2].id })
    const report = reports().at(-1)!
    for (const [name, counts] of Object.entries(native.tables)) {
      expect(report.tables[name]?.records ?? 0).toBe(counts.records)
      expect(report.tables[name]?.writes ?? 0).toBe(counts.writes)
    }
  })
})

it('adds the final Folder schema to the pre-Folder database without changing existing feature data', async () => {
  db.close(); await db.delete()
  const old = new Dexie('gemini_extension')
  old.version(5).stores({
    chain_prompts: 'id, name, createdAt, updatedAt',
    quick_follow_prompts: 'id, updatedAt',
    quick_follow_settings: 'id',
    theme_assets: 'id, feature, updatedAt',
    notification_audio_assets: 'id, updatedAt',
    gem_avatar_assets: 'gemId, updatedAt',
  })
  const existing = {
    chain_prompts: { id: 'unrelated', name: 'Preserved', createdAt: timestamp, updatedAt: timestamp },
    quick_follow_prompts: { id: 'prompt', template: 'Preserved' },
    quick_follow_settings: { id: 'default', orderedIds: ['prompt'], enabled: true },
    theme_assets: { id: 'theme', feature: 'background', content: 'Preserved' },
    notification_audio_assets: { id: 'response-complete-notification', fileName: 'Preserved' },
    gem_avatar_assets: { gemId: 'gem', content: 'Preserved' },
  }
  for (const [table, row] of Object.entries(existing)) await old.table(table).put(row)
  old.close()
  try {
    await db.open()
    for (const [table, row] of Object.entries(existing)) expect(await db.table(table).toArray()).toEqual([row])
    for (const table of db.tables.filter((table) => table.name.startsWith('folder'))) expect(await table.count()).toBe(0)
    const connection = db.backendDB()
    expect(connection.objectStoreNames.contains('folder_chat_usage')).toBe(false)
    expect(connection.objectStoreNames.contains('folder_snapshot_payloads')).toBe(true)
    const transaction = connection.transaction(['folders', 'folder_memberships', 'folder_snapshots'])
    expect(transaction.objectStore('folders').indexNames.contains('[accountScopeId+parentFolderId+orderKey]')).toBe(false)
    expect(transaction.objectStore('folder_memberships').indexNames.contains('[accountScopeId+chatId+folderId]')).toBe(true)
    expect(transaction.objectStore('folder_snapshots').indexNames.contains('validationState')).toBe(false)
    await seed(fixture(2, 5))
    expect((await queries.getSyncStatus(scopeA)).chatCount).toBe(5)
    expect((await queries.getSyncStatus(scopeA)).folderCount).toBe(2)
  } finally {
    db.close(); await db.delete(); await db.open()
  }
})
