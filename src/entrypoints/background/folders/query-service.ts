import { observeFolderQuery } from '@/data/folder-access'
import Dexie from 'dexie'

import { db } from '@/data/db'
import { newestSnapshots } from '@/services/folder-recovery/storage'
import { withSnapshotCounts } from '@/services/folder-recovery/snapshots'
import { readRecoveryFailure } from '@/services/folder-recovery/failure-fallback'
import { membershipDisplayOrderKey } from '@/domain/folder/local-indexes'
import type { FolderChatSummary, FolderSidebarState } from '@/domain/folder/sidebar'
import { BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT, ROOT_FOLDER_ID, type FolderRow, type FolderSettingsRow } from '@/domain/folder/types'

const DEFAULT_SETTINGS: Omit<FolderSettingsRow, 'accountScopeId'> = {
  enabled: true,
  hideOrganizedChats: false,
  collapsedFolderIds: [],
  updatedAt: '',
}

export interface CursorPage<T> { items: T[]; nextCursor?: string }
export interface FolderSummary extends FolderRow {
  chatCount: number
  collapsed: boolean
}

function parseCursor(cursor?: string): { orderKey: string; id: string } | undefined {
  if (!cursor) return undefined
  const separator = cursor.indexOf('.')
  if (separator <= 0 || separator === cursor.length - 1
    || !/^(?:[0-9A-Za-z]{32}|[01][0-9A-Za-z]{32})$/u.test(cursor.slice(0, separator))) throw new Error('Cursor is invalid')
  return { orderKey: cursor.slice(0, separator), id: cursor.slice(separator + 1) }
}

function page<T extends { id: string; orderKey: string }>(rows: T[], limit: number, getOrderKey = (row: T) => row.orderKey): CursorPage<T> {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? `${getOrderKey(last)}.${last.id}` : undefined }
}

function pageBounds(scope: string, container: string, cursor?: string) {
  const boundary = parseCursor(cursor)
  return { lower: [scope, container, boundary?.orderKey ?? Dexie.minKey, boundary?.id ?? Dexie.minKey],
    upper: [scope, container, Dexie.maxKey] }
}

function pageLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Page limit is invalid')
  return limit
}

const QUERY_TABLES = {
  getSidebarState: [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings],
  listFolders: [db.folders, db.folder_memberships, db.folder_settings],
  listFolderChats: [db.folder_memberships, db.folder_chat_references],
  getPickerOptions: [db.folders, db.folder_memberships, db.folder_settings],
  resolveChatMemberships: [db.folder_memberships],
  getFolderDeleteImpact: [db.folder_memberships],
  getSettings: [db.folder_settings],
  getSyncStatus: [db.folder_sync_states, db.folder_settings, db.folder_recovery_states, db.folders, db.folder_organization_summaries],
  getFolderSummaries: [db.folders, db.folder_memberships, db.folder_settings],
  getChatReferences: [db.folder_chat_references],
}
export type FolderQueryName = keyof typeof QUERY_TABLES

export class FolderQueryService {
  private read<T>(operation: FolderQueryName, read: () => Promise<T>): Promise<T> {
    // Internal helpers use the consistency transaction already owned by their caller.
    if (Dexie.currentTransaction) return read()
    return db.transaction('r', QUERY_TABLES[operation], async (transaction) => (
      import.meta.env.DEV ? observeFolderQuery(transaction, operation, read) : read()
    ))
  }

  /** Capture the requested data and its guard revision in the same transaction. */
  async readProjection<T>(accountScopeId: string, read: () => Promise<T>, operation: FolderQueryName = 'getSidebarState'): Promise<{ data: T; dataRevision: string }> {
    return db.transaction('r', [...QUERY_TABLES[operation], db.folder_sync_states], async (transaction) => {
      const capture = async () => ({ data: await read(), dataRevision: await this.revision(accountScopeId) })
      return import.meta.env.DEV ? observeFolderQuery(transaction, operation, capture) : capture()
    })
  }

  async getSettings(accountScopeId: string): Promise<FolderSettingsRow> {
    return this.read('getSettings', async () => (await db.folder_settings.get(accountScopeId)) ?? { accountScopeId, ...DEFAULT_SETTINGS })
  }

  async getFolderSummaries(accountScopeId: string, folderIds: string[]): Promise<FolderSummary[]> {
    return this.read('getFolderSummaries', async () => {
      const settings = await this.getSettings(accountScopeId)
      const folders = (await db.folders.bulkGet([...new Set(folderIds)]))
        .filter((row): row is FolderRow => !!row && row.accountScopeId === accountScopeId)
      return Promise.all(folders.map(async (folder) => this.summary(folder,
        await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folder.id]).count(), settings)))
    })
  }

  async getChatReferences(accountScopeId: string, chatIds: string[]) {
    return this.read('getChatReferences', async () => (await db.folder_chat_references.bulkGet(
      [...new Set(chatIds)].map((chatId) => [accountScopeId, chatId]),
    )).filter((row) => row !== undefined))
  }

  async revision(accountScopeId: string): Promise<string> {
    return (await db.folder_sync_states.get(accountScopeId))?.localDataRevision ?? 'uninitialized'
  }

  async getSidebarState(accountScopeId: string, folderLimit: number): Promise<FolderSidebarState> {
    return this.read('getSidebarState', async () => {
      const settings = await this.getSettings(accountScopeId)
      const result = await this.folderPage(accountScopeId, undefined, folderLimit, settings)
      const chatPages = await Promise.all(result.items.map(async (folder) => (
        [folder.id, await this.listFolderChats(accountScopeId, folder.id, undefined, 10)] as const
      )))
      return { settings, folders: result.items, nextCursor: result.nextCursor, chatsByFolder: Object.fromEntries(chatPages) }
    })
  }

  private async folderPage(accountScopeId: string, cursor: string | undefined, limit: number, settings: FolderSettingsRow): Promise<CursorPage<FolderSummary>> {
    pageLimit(limit)
    const { lower, upper } = pageBounds(accountScopeId, ROOT_FOLDER_ID, cursor)
    const rows = await db.folders.where('[accountScopeId+parentFolderId+orderKey+id]')
      .between(lower, upper, false, false).limit(limit + 1).toArray()
    const result = page(rows, limit)
    const counts = await Promise.all(result.items.map((folder) => (
      db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folder.id]).count()
    )))
    return { items: result.items.map((folder, index) => this.summary(folder, counts[index], settings)), nextCursor: result.nextCursor }
  }

  async listFolders(accountScopeId: string, cursor: string | undefined, limit: number): Promise<CursorPage<FolderSummary>> {
    return this.read('listFolders', async () => this.folderPage(accountScopeId, cursor, limit, await this.getSettings(accountScopeId)))
  }

  async listFolderChats(accountScopeId: string, folderId: string, cursor: string | undefined, limit: number): Promise<CursorPage<FolderChatSummary>> {
    return this.read('listFolderChats', async () => {
      pageLimit(limit)
      const { lower, upper } = pageBounds(accountScopeId, folderId, cursor)
      const rows = await db.folder_memberships.where('[accountScopeId+folderId+displayOrderKey+id]')
        .between(lower, upper, false, false).limit(limit + 1).toArray()
      const result = page(rows, limit, membershipDisplayOrderKey)
      const references = await db.folder_chat_references.bulkGet(result.items.map((row) => [accountScopeId, row.chatId]))
      return {
        items: result.items.map((row, index) => ({
          chatId: row.chatId, cachedTitle: references[index]?.cachedTitle ?? '', orderKey: row.orderKey,
          ...(row.pinnedOrderKey ? { pinnedOrderKey: row.pinnedOrderKey } : {}),
        })),
        nextCursor: result.nextCursor,
      }
    })
  }

  async getPickerOptions(accountScopeId: string, chatId: string, cursor: string | undefined, limit: number) {
    return this.read('getPickerOptions', async () => {
      const folders = await this.listFolders(accountScopeId, cursor, limit)
      const memberships = await db.folder_memberships.bulkGet(folders.items.map((folder) => `${accountScopeId}:${folder.id}:${chatId}`))
      return { ...folders, membershipFolderIds: memberships.filter((row) => row).map((row) => row!.folderId) }
    })
  }

  async resolveChatMemberships(accountScopeId: string, chatIds: string[]): Promise<string[]> {
    return this.read('resolveChatMemberships', async () => {
      const unique = [...new Set(chatIds)]
      const exists = await Promise.all(unique.map((chatId) => db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).limit(1).primaryKeys()))
      return unique.filter((_chatId, index) => exists[index].length > 0)
    })
  }

  async getFolderDeleteImpact(accountScopeId: string, folderId: string): Promise<{ chatCount: number }> {
    return this.read('getFolderDeleteImpact', async () => {
      return { chatCount: await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folderId]).count() }
    })
  }

  async getSyncStatus(accountScopeId: string) {
    return this.read('getSyncStatus', async () => {
      const [state, settings, recovery, folderCount, summary] = await Promise.all([
        db.folder_sync_states.get(accountScopeId), db.folder_settings.get(accountScopeId), db.folder_recovery_states.get(accountScopeId),
        db.folders.where('accountScopeId').equals(accountScopeId).count(), db.folder_organization_summaries.get(accountScopeId),
      ])
      const conflict = state?.conflictSummary
      const usagePercent = state?.browserSyncCurrentUsageBytes !== undefined && state.browserSyncBudgetBytes
        ? state.browserSyncCurrentUsageBytes / state.browserSyncBudgetBytes * 100
        : undefined
      return {
        mode: 'browser-sync' as const,
        localRevision: state?.localDataRevision ?? 'uninitialized',
        baseSnapshotId: state?.baseSnapshotId,
        folderCount, chatCount: summary?.chatCount ?? 0,
        localRecoveryWarning: readRecoveryFailure(accountScopeId) ?? recovery?.warning,
        localAutomaticSnapshotFailed: !!readRecoveryFailure(accountScopeId) || recovery?.automaticSnapshotFailed,
        conflict,
        state: conflict ? 'conflict' as const : state?.browserSyncWarning
          ? 'needs-attention' as const
          : state?.dirty
            ? 'local-changes-pending' as const
            : state?.baseSnapshotId ? 'accepted-by-browser-storage' as const : 'idle' as const,
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
    })
  }

  async listSnapshots(accountScopeId: string, cursor: string | undefined, limit: number) {
    const rows = await db.folder_snapshots.where('[accountScopeId+createdAt]')
      .between([accountScopeId, Dexie.minKey], [accountScopeId, Dexie.maxKey]).reverse().toArray()
    const sorted = newestSnapshots(rows)
    const boundary = cursor ? sorted.findIndex((row) => row.id === cursor) + 1 : 0
    const items = await Promise.all(sorted.slice(boundary, boundary + limit).map(withSnapshotCounts))
    return { items, nextCursor: boundary + limit < sorted.length ? items.at(-1)?.id : undefined }
  }

  private summary(folder: FolderRow, chatCount: number, settings: FolderSettingsRow): FolderSummary {
    return { ...folder, chatCount, collapsed: settings.collapsedFolderIds.includes(folder.id) }
  }
}
