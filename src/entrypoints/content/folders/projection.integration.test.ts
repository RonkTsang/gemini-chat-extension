import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/integrations/extension-rpc/client', () => ({ ExtensionRpcClient: class { request = transport.request } }))

import { resetStorage, scopeA, scopeB } from '@/services/folder-sync/test-storage'
import { FolderBackgroundClient } from './client'
import { FolderCommandService } from '@/entrypoints/background/folders/command-service'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'
import { folderRepository } from '@/data/repositories/folderRepository'
import { db } from '@/data/db'
import { rebuildFolderSummary } from '@/data/folder-summary'
import { indexFolder, indexMembership } from '@/domain/folder/local-indexes'
import { rebalanceOrderKeys } from '@/domain/folder/order-key'
import { ROOT_FOLDER_ID, type FolderAccountData, type FolderProjection, type FolderRow, type FolderSettingsRow } from '@/domain/folder/types'
import type { FolderRpcEnvelope } from '@/domain/folder/rpc'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import type { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import { observeFolderIndexedDB } from '@/test/folder-idb-observer'

const client = new FolderBackgroundClient()
const queries = new FolderQueryService()
const service = new FolderCommandService({ requestRun: vi.fn() } as unknown as FolderSyncScheduler,
  queries, { requestRun: vi.fn() } as unknown as FolderRecoveryRunner)
let native: ReturnType<typeof observeFolderIndexedDB> | undefined
const timestamp = '2026-10-18T00:00:00.000Z'

beforeEach(async () => {
  await resetStorage()
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const ids = ['folder-1', 'folder-2', 'folder-3']
  const folderKeys = rebalanceOrderKeys(ids)
  const chatIds = Array.from({ length: 35 }, (_, i) => `chat-${i}`)
  const keys = rebalanceOrderKeys(chatIds)
  const data: FolderAccountData = { accountScopeId: scopeA,
    folders: ids.map((id) => ({ id, accountScopeId: scopeA, parentFolderId: ROOT_FOLDER_ID, name: id, iconKey: 'folder', colorValue: 'neutral', orderKey: folderKeys.get(id)!, createdAt: timestamp, updatedAt: timestamp })),
    memberships: ids.flatMap((folderId) => chatIds.map((chatId) => ({ id: `${scopeA}:${folderId}:${chatId}`, accountScopeId: scopeA, folderId, chatId, orderKey: keys.get(chatId)!, createdAt: timestamp, updatedAt: timestamp }))),
    chatReferences: chatIds.map((chatId) => ({ accountScopeId: scopeA, chatId, cachedTitle: 'PRIVATE-TITLE', createdAt: timestamp, updatedAt: timestamp })),
  }
  await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_organization_summaries], async (transaction) => {
    await db.folders.bulkPut(data.folders.map(indexFolder))
    await db.folder_memberships.bulkPut(data.memberships.map(indexMembership))
    await db.folder_chat_references.bulkPut(data.chatReferences)
    await rebuildFolderSummary(transaction, data)
  })
  await folderRepository.getSettings(scopeA)
  transport.request.mockReset().mockImplementation(async (request: FolderRpcEnvelope) => {
    const params = request.params as { folderId: string; folderIds: string[]; chatIds: string[]; cursor?: string; limit: number; folderLimit: number }
    let capture: { data: unknown; dataRevision: string }
    switch (request.method) {
      case 'getSidebarState': capture = await queries.readProjection(scopeA, () => queries.getSidebarState(scopeA, params.folderLimit)); break
      case 'listFolders': capture = await queries.readProjection(scopeA, () => queries.listFolders(scopeA, params.cursor, params.limit), 'listFolders'); break
      case 'listFolderChats': capture = await queries.readProjection(scopeA, () => queries.listFolderChats(scopeA, params.folderId, params.cursor, params.limit), 'listFolderChats'); break
      case 'getFolderSummaries': capture = await queries.readProjection(scopeA, () => queries.getFolderSummaries(scopeA, params.folderIds), 'getFolderSummaries'); break
      case 'getChatReferences': capture = await queries.readProjection(scopeA, () => queries.getChatReferences(scopeA, params.chatIds), 'getChatReferences'); break
      case 'getSettings': capture = await queries.readProjection(scopeA, () => queries.getSettings(scopeA), 'getSettings'); break
      default: {
        const result = await service.execute(request)
        return { ok: true, requestId: request.requestId, data: result.data, dataRevision: result.commit.dataRevision,
          change: { ...result.commit, requestId: request.requestId } }
      }
    }
    return { ok: true, requestId: request.requestId, ...capture }
  })
})
afterEach(() => { native?.stop(); native = undefined; vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function projectionWithTwoPages(): Promise<FolderProjection> {
  const projection = await client.getProjection(scopeA, 'observed')
  const page = await client.getChatPage(scopeA, 'observed', 'folder-1', projection.chatCursors?.['folder-1'])
  return { ...projection, memberships: [...projection.memberships, ...page.memberships],
    chatReferences: [...new Map([...projection.chatReferences, ...page.chatReferences].map((row) => [row.chatId, row])).values()],
    chatCursors: { ...projection.chatCursors, 'folder-1': page.nextCursor } }
}

it.each([true, false])('pin refresh preserves loaded pages and only reads the affected Folder (DEV=%s)', async (development) => {
  vi.stubEnv('DEV', development)
  const previous = await projectionWithTwoPages()
  const result = await client.request(scopeA, 'observed', 'setMembershipPinned', { folderId: 'folder-1', chatId: 'chat-30', pinned: true })
  native = observeFolderIndexedDB(); transport.request.mockClear()
  const next = await client.getChangedProjection(previous, result.change!, 'observed')
  expect(next.dataRevision).toBe(result.dataRevision)
  expect(next.memberships.filter((row) => row.folderId === 'folder-1')).toHaveLength(20)
  expect(next.memberships.find((row) => row.folderId === 'folder-1')?.chatId).toBe('chat-30')
  expect(next.memberships.filter((row) => row.folderId !== 'folder-1')).toEqual(previous.memberships.filter((row) => row.folderId !== 'folder-1'))
  expect(next.chatCursors?.['folder-2']).toBe(previous.chatCursors?.['folder-2'])
  expect(native.tables.folder_memberships.records).toBe(22)
  expect(native.tables.folder_memberships.countRequests).toBe(1)
  expect(native.tables.folders.records).toBe(1)
  expect(transport.request.mock.calls.filter(([request]) => request.method === 'listFolderChats').map(([request]) => request.params.folderId)).toEqual(['folder-1', 'folder-1'])
  expect(transport.request.mock.calls.some(([request]) => ['getSidebarState', 'listFolders'].includes(request.method))).toBe(false)
})

it('refreshes Folder metadata without reading membership bodies or dropping loaded cursors', async () => {
  const previous = await projectionWithTwoPages()
  const result = await client.request<FolderRow>(scopeA, 'observed', 'updateFolder', { folderId: 'folder-1', patch: { name: 'Renamed' } })
  native = observeFolderIndexedDB()
  const next = await client.getChangedProjection(previous, result.change!, 'observed')
  expect(next.folders.find((row) => row.id === 'folder-1')?.name).toBe('Renamed')
  expect(next.memberships).toEqual(previous.memberships)
  expect(next.chatCursors).toEqual(previous.chatCursors)
  expect(native.tables.folder_memberships.records).toBe(0)
  expect(native.tables.folder_memberships.countRequests).toBe(1)
  expect(native.tables.folders.records).toBe(1)
  expect(native.tables.folder_chat_references).toBeUndefined()
})

it('applies returned collapsed settings with no database reads and reads only settings in another tab', async () => {
  const previous = await projectionWithTwoPages()
  const result = await client.request<FolderSettingsRow>(scopeA, 'observed', 'updateSettings', { patch: { collapsedFolderIds: ['folder-1'] } })
  expect(result.change?.baseRevision).toBe(result.change?.dataRevision)
  native = observeFolderIndexedDB()
  const local = await client.getChangedProjection(previous, result.change!, 'observed', { settings: result.data })
  expect(local.settings.collapsedFolderIds).toEqual(['folder-1'])
  expect(local.memberships).toBe(previous.memberships)
  expect(native.tables).toEqual({})
  // An independent organization edit must not make a local-view event advance or rebuild organization data.
  await folderRepository.updateFolder(scopeA, 'folder-2', { name: 'Other edit' })
  native.reset(); transport.request.mockClear()
  const remote = await client.getChangedProjection(previous, result.change!, 'observed')
  expect(remote.settings.collapsedFolderIds).toEqual(['folder-1'])
  expect(remote.dataRevision).toBe(previous.dataRevision)
  expect(Object.keys(native.tables).sort()).toEqual(['folder_settings', 'folder_sync_states'])
  expect(transport.request).toHaveBeenCalledTimes(1)
})

it('updates a shared title from the committed response without page or reference rereads', async () => {
  const previous = await projectionWithTwoPages()
  const result = await client.request(scopeA, 'observed', 'updateChatTitle', { chatId: 'chat-1', title: 'Updated' })
  native = observeFolderIndexedDB()
  const next = await client.getChangedProjection(previous, result.change!, 'observed', { reference: result.data as FolderProjection['chatReferences'][number] })
  expect(next.chatReferences.filter((row) => row.chatId === 'chat-1')).toHaveLength(1)
  expect(next.chatReferences.find((row) => row.chatId === 'chat-1')?.cachedTitle).toBe('Updated')
  expect(next.memberships.filter((row) => row.chatId === 'chat-1')).toHaveLength(3)
  expect(next.memberships).toBe(previous.memberships)
  expect(next.chatCursors).toBe(previous.chatCursors)
  expect(native.tables).toEqual({})
  await expect(client.getChangedProjection({ ...previous, dataRevision: 'unknown' }, result.change!, 'observed')).rejects.toThrow('STALE_REVISION')
})

it('drops a deleted Folder and its loaded rows without refreshing surviving chat pages', async () => {
  const previous = await projectionWithTwoPages()
  const result = await client.request(scopeA, 'observed', 'deleteFolder', { folderId: 'folder-1' })
  native = observeFolderIndexedDB(); transport.request.mockClear()
  const next = await client.getChangedProjection(previous, result.change!, 'observed')
  expect(next.folders.map((row) => row.id)).toEqual(['folder-2', 'folder-3'])
  expect(next.memberships.some((row) => row.folderId === 'folder-1')).toBe(false)
  expect(next.memberships).toEqual(previous.memberships.filter((row) => row.folderId !== 'folder-1'))
  expect(next.chatCursors?.['folder-1']).toBeUndefined()
  expect(native.tables.folder_memberships.records).toBe(0)
  expect(transport.request.mock.calls.some(([request]) => request.method === 'listFolderChats')).toBe(false)
})

it('rejects mixed partial pages when another Folder changes between page reads', async () => {
  const previous = await projectionWithTwoPages()
  const result = await client.request(scopeA, 'observed', 'setMembershipPinned', { folderId: 'folder-1', chatId: 'chat-30', pinned: true })
  const route = transport.request.getMockImplementation()!
  let edited = false
  transport.request.mockImplementation(async (request: FolderRpcEnvelope) => {
    const response = await route(request)
    if (!edited && request.method === 'listFolderChats') {
      edited = true
      await folderRepository.upsertMembership(scopeA, { folderId: 'folder-2', chatId: 'concurrent-chat' })
    }
    return response
  })
  await expect(client.getChangedProjection(previous, result.change!, 'observed')).rejects.toThrow('STALE_REVISION')
  expect(previous.memberships.filter((row) => row.folderId === 'folder-1')).toHaveLength(20)
  const complete = await client.getProjection(scopeA, 'observed', previous)
  expect(complete.dataRevision).not.toBe(result.dataRevision)
  expect((complete.folders.find((row) => row.id === 'folder-2') as FolderRow & { chatCount: number }).chatCount).toBe(36)
})

it('keeps targeted summaries and references account-scoped and deduplicates requested IDs', async () => {
  const folder = (await db.folders.get('folder-1'))!
  await db.folders.put({ ...folder, id: 'foreign', accountScopeId: scopeB })
  await db.folder_chat_references.put({ accountScopeId: scopeB, chatId: 'foreign-chat', cachedTitle: 'PRIVATE-FOREIGN-TITLE', createdAt: timestamp, updatedAt: timestamp })
  native = observeFolderIndexedDB()
  const summaries = await client.request<FolderRow[]>(scopeA, 'observed', 'getFolderSummaries', { folderIds: ['folder-1', 'folder-1', 'foreign'] })
  expect(summaries.data.map((row) => row.id)).toEqual(['folder-1'])
  expect(native.tables.folder_memberships.countRequests).toBe(1)
  native.reset()
  const references = await client.request<FolderProjection['chatReferences']>(scopeA, 'observed', 'getChatReferences', { chatIds: ['chat-1', 'chat-1', 'foreign-chat'] })
  expect(references.data.map((row) => row.chatId)).toEqual(['chat-1'])
  expect(native.tables.folder_chat_references.records).toBe(1)
})
