import Dexie from 'dexie'

import { db } from '@/data/db'
import { compareMembershipOrder } from '@/domain/folder/membership-order'
import type { FolderChatSummary, FolderSidebarState } from '@/domain/folder/sidebar'
import { BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT, ROOT_FOLDER_ID, type FolderRow, type FolderSettingsRow } from '@/domain/folder/types'

const DEFAULT_SETTINGS: Omit<FolderSettingsRow, 'accountScopeId'> = {
  enabled: true,
  hideOrganizedChats: false,
  collapsedFolderIds: [],
  updatedAt: '',
  settingsVersion: '0000000000000:000000:default',
  settingsPending: false,
}

export interface CursorPage<T> { items: T[]; nextCursor?: string }
export interface FolderSummary extends FolderRow {
  chatCount: number
  collapsed: boolean
}

function parseCursor(cursor?: string): { orderKey: string; id: string } | undefined {
  if (!cursor) return undefined
  const separator = cursor.indexOf('.')
  if (separator <= 0) throw new Error('Cursor is invalid')
  return { orderKey: cursor.slice(0, separator), id: cursor.slice(separator + 1) }
}

function page<T extends { id: string; orderKey: string }>(rows: T[], cursor: string | undefined, limit: number, getOrderKey = (row: T) => row.orderKey): CursorPage<T> {
  const boundary = parseCursor(cursor)
  const eligible = boundary
    ? rows.filter((row) => getOrderKey(row) > boundary.orderKey || (getOrderKey(row) === boundary.orderKey && row.id > boundary.id))
    : rows
  const items = eligible.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: eligible.length > items.length && last ? `${getOrderKey(last)}.${last.id}` : undefined }
}

export class FolderQueryService {
  async getSettings(accountScopeId: string): Promise<FolderSettingsRow> {
    return (await db.folder_settings.get(accountScopeId)) ?? {
      accountScopeId,
      ...DEFAULT_SETTINGS,
    }
  }

  async revision(accountScopeId: string): Promise<string> {
    return (await db.folder_sync_states.get(accountScopeId))?.localDataRevision ?? 'uninitialized'
  }

  async getSidebarState(accountScopeId: string, folderLimit: number): Promise<FolderSidebarState> {
    const [settings, folders] = await Promise.all([
      this.getSettings(accountScopeId),
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
    const chatPages = await Promise.all(result.items.map(async (folder) => (
      [folder.id, await this.listFolderChats(accountScopeId, folder.id, undefined, 10)] as const
    )))
    return {
      settings,
      folders: result.items.map((folder) => this.summary(folder, countById.get(folder.id) ?? 0, settings)),
      nextCursor: result.nextCursor,
      chatsByFolder: Object.fromEntries(chatPages),
    }
  }

  async listFolders(accountScopeId: string, cursor: string | undefined, limit: number): Promise<CursorPage<FolderSummary>> {
    const [settings, rows] = await Promise.all([
      this.getSettings(accountScopeId),
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
      .filter((row) => !row.deletedAt).sort(compareMembershipOrder)
    const result = page(rows, cursor, limit, (row) => row.pinnedOrderKey ? `0${row.pinnedOrderKey}` : `1${row.orderKey}`)
    const references = await Promise.all(result.items.map((row) => db.folder_chat_references.get([accountScopeId, row.chatId])))
    return {
      items: result.items.map((row, index) => ({
        chatId: row.chatId, cachedTitle: references[index]?.cachedTitle ?? '', orderKey: row.orderKey,
        ...(row.pinnedOrderKey ? { pinnedOrderKey: row.pinnedOrderKey } : {}),
      })),
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
    const [state, pending, settings] = await Promise.all([
      db.folder_sync_states.get(accountScopeId),
      db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_settings.get(accountScopeId),
    ])
    const usagePercent = state?.browserSyncCurrentUsageBytes !== undefined && state.browserSyncBudgetBytes
      ? state.browserSyncCurrentUsageBytes / state.browserSyncBudgetBytes * 100
      : undefined
    return {
      mode: 'browser-sync' as const,
      state: state?.browserSyncWarning
        ? 'needs-attention' as const
        : settings?.settingsPending || pending.some((operation) => operation.state === 'pending')
          ? 'local-changes-pending' as const
          : 'accepted-by-browser-storage' as const,
      lastLocalSaveAt: [state?.updatedAt, settings?.updatedAt].filter((value): value is string => !!value).sort().at(-1),
      lastBrowserStorageWriteAt: state?.lastBrowserStorageWriteAt,
      retryAt: state?.retryAt,
      warning: state?.browserSyncWarning,
      currentUsageBytes: state?.browserSyncCurrentUsageBytes,
      currentTotalBytes: state?.browserSyncCurrentTotalBytes,
      quotaBytes: state?.browserSyncQuotaBytes,
      projectedUsageBytes: state?.browserSyncProjectedUsageBytes,
      projectedTotalBytes: state?.browserSyncProjectedTotalBytes,
      usageMeasuredAt: state?.browserSyncUsageMeasuredAt,
      usageBudgetBytes: state?.browserSyncBudgetBytes,
      usagePercent,
      showCapacityNotice: !state?.browserSyncWarning
        && usagePercent !== undefined
        && usagePercent >= BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT
        && (state?.browserSyncLastDismissedUsagePercent === undefined
          || usagePercent >= state.browserSyncLastDismissedUsagePercent + 10),
    }
  }

  async listSnapshots(accountScopeId: string, cursor: string | undefined, limit: number) {
    const rows = await db.folder_snapshots.where('[accountScopeId+createdAt]')
      .between([accountScopeId, Dexie.minKey], [accountScopeId, Dexie.maxKey]).reverse().toArray()
    const normalized = rows.map((row) => ({ ...row, orderKey: row.createdAt }))
    const result = page(normalized, cursor, limit)
    return { items: result.items.map(({ orderKey: _, ...row }) => row), nextCursor: result.nextCursor }
  }

  private summary(folder: FolderRow, chatCount: number, settings: FolderSettingsRow): FolderSummary {
    return { ...folder, chatCount, collapsed: settings.collapsedFolderIds.includes(folder.id) }
  }
}
