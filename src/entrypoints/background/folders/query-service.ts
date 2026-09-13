import Dexie from 'dexie'

import { db } from '@/data/db'
import { ROOT_FOLDER_ID, type FolderSettingsRow } from '@/domain/folder/types'

const DEFAULT_SETTINGS: Omit<FolderSettingsRow, 'accountScopeId'> = {
  enabled: true,
  hideOrganizedChats: false,
  collapsedFolderIds: [],
  updatedAt: '',
  fieldVersions: {},
}

export interface CursorPage<T> { items: T[]; nextCursor?: string }
export interface FolderSummary {
  id: string
  parentFolderId: string
  name: string
  iconKey: string
  colorValue: string
  orderKey: string
  chatCount: number
  collapsed: boolean
}
export interface FolderChatSummary { chatId: string; cachedTitle: string; orderKey: string }

function parseCursor(cursor?: string): { orderKey: string; id: string } | undefined {
  if (!cursor) return undefined
  const separator = cursor.indexOf('.')
  if (separator <= 0) throw new Error('Cursor is invalid')
  return { orderKey: cursor.slice(0, separator), id: cursor.slice(separator + 1) }
}

function page<T extends { id: string; orderKey: string }>(rows: T[], cursor: string | undefined, limit: number): CursorPage<T> {
  const boundary = parseCursor(cursor)
  const eligible = boundary
    ? rows.filter((row) => row.orderKey > boundary.orderKey || (row.orderKey === boundary.orderKey && row.id > boundary.id))
    : rows
  const items = eligible.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: eligible.length > items.length && last ? `${last.orderKey}.${last.id}` : undefined }
}

export class FolderQueryService {
  private async settings(accountScopeId: string): Promise<FolderSettingsRow> {
    return (await db.folder_settings.get(accountScopeId)) ?? {
      accountScopeId,
      ...DEFAULT_SETTINGS,
    }
  }

  async revision(accountScopeId: string): Promise<string> {
    return (await db.folder_sync_states.get(accountScopeId))?.dataRevision ?? 'uninitialized'
  }

  async getSidebarState(accountScopeId: string, folderLimit: number) {
    const [settings, folders] = await Promise.all([
      this.settings(accountScopeId),
      db.folders.where('[accountScopeId+parentFolderId+orderKey]')
        .between([accountScopeId, ROOT_FOLDER_ID, Dexie.minKey], [accountScopeId, ROOT_FOLDER_ID, Dexie.maxKey])
        .toArray(),
    ])
    const live = folders.filter((folder) => !folder.deletedAt).sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))
    const counts = await Promise.all(live.slice(0, folderLimit).map(async (folder) => ({
      id: folder.id,
      count: (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folder.id]).toArray())
        .filter((membership) => !membership.deletedAt).length,
    })))
    const countById = new Map(counts.map(({ id, count }) => [id, count]))
    const result = page(live, undefined, folderLimit)
    return {
      settings,
      folders: result.items.map((folder) => this.summary(folder, countById.get(folder.id) ?? 0, settings)),
      nextCursor: result.nextCursor,
    }
  }

  async listFolders(accountScopeId: string, cursor: string | undefined, limit: number): Promise<CursorPage<FolderSummary>> {
    const [settings, rows] = await Promise.all([
      this.settings(accountScopeId),
      db.folders.where('[accountScopeId+parentFolderId+orderKey]')
        .between([accountScopeId, ROOT_FOLDER_ID, Dexie.minKey], [accountScopeId, ROOT_FOLDER_ID, Dexie.maxKey]).toArray(),
    ])
    const candidates = rows.filter((row) => !row.deletedAt).sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))
    const result = page(candidates, cursor, limit)
    const counts = await Promise.all(result.items.map(async (folder) => ({
      id: folder.id,
      count: (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folder.id]).toArray()).filter((row) => !row.deletedAt).length,
    })))
    const countById = new Map(counts.map(({ id, count }) => [id, count]))
    return { items: result.items.map((folder) => this.summary(folder, countById.get(folder.id) ?? 0, settings)), nextCursor: result.nextCursor }
  }

  async listFolderChats(accountScopeId: string, folderId: string, cursor: string | undefined, limit: number): Promise<CursorPage<FolderChatSummary>> {
    const rows = (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folderId]).toArray())
      .filter((row) => !row.deletedAt).sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))
    const result = page(rows, cursor, limit)
    const references = await Promise.all(result.items.map((row) => db.folder_chat_references.get([accountScopeId, row.chatId])))
    return {
      items: result.items.map((row, index) => ({ chatId: row.chatId, cachedTitle: references[index]?.cachedTitle ?? '', orderKey: row.orderKey })),
      nextCursor: result.nextCursor,
    }
  }

  async getPickerOptions(accountScopeId: string, chatId: string, cursor: string | undefined, limit: number) {
    const folders = await this.listFolders(accountScopeId, cursor, limit)
    const memberships = await Promise.all(folders.items.map((folder) => db.folder_memberships.get(`${accountScopeId}:${folder.id}:${chatId}`)))
    return { ...folders, membershipFolderIds: memberships.filter((row) => row && !row.deletedAt).map((row) => row!.folderId) }
  }

  async resolveChatMemberships(accountScopeId: string, chatIds: string[]): Promise<string[]> {
    const rows = await Promise.all(chatIds.map((chatId) => db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()))
    return rows.flat().filter((row) => !row.deletedAt).map((row) => row.chatId)
  }

  async getFolderDeleteImpact(accountScopeId: string, folderId: string): Promise<{ chatCount: number }> {
    const rows = await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folderId]).toArray()
    return { chatCount: new Set(rows.filter((row) => !row.deletedAt).map((row) => row.chatId)).size }
  }

  async getSyncStatus(accountScopeId: string) {
    const [state, pending] = await Promise.all([
      db.folder_sync_states.get(accountScopeId),
      db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray(),
    ])
    return {
      mode: 'browser-sync' as const,
      state: state?.browserSyncWarning === 'write-failed'
        ? 'needs-attention' as const
        : pending.some((operation) => operation.state === 'pending')
          ? 'local-changes-pending' as const
          : 'accepted-by-browser-storage' as const,
      lastLocalSaveAt: state?.updatedAt,
      lastBrowserStorageWriteAt: state?.lastSuccessfulSyncAt,
      retryAt: state?.retryAt,
      warning: state?.browserSyncWarning,
    }
  }

  async listSnapshots(accountScopeId: string, cursor: string | undefined, limit: number) {
    const rows = await db.folder_snapshots.where('[accountScopeId+createdAt]')
      .between([accountScopeId, Dexie.minKey], [accountScopeId, Dexie.maxKey]).reverse().toArray()
    const normalized = rows.map((row) => ({ ...row, orderKey: row.createdAt }))
    const result = page(normalized, cursor, limit)
    return { items: result.items.map(({ orderKey: _, ...row }) => row), nextCursor: result.nextCursor }
  }

  private summary(folder: { id: string; parentFolderId: string; name: string; iconKey: string; colorValue: string; orderKey: string }, chatCount: number, settings: FolderSettingsRow): FolderSummary {
    return { ...folder, chatCount, collapsed: settings.collapsedFolderIds.includes(folder.id) }
  }
}
