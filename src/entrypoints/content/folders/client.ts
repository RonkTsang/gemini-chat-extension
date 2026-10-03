import { nanoid } from 'nanoid'

import { ExtensionRpcClient } from '@/integrations/extension-rpc/client'
import { folderRpcResponseSchema, type FolderRpcMethod, type FolderRpcResponse } from '@/domain/folder/rpc'
import type { FolderProjection } from '@/domain/folder/types'
import type { FolderChatSummaryPage, FolderSidebarState } from '@/domain/folder/sidebar'

export interface FolderChatPage {
  memberships: FolderProjection['memberships']
  chatReferences: FolderProjection['chatReferences']
  nextCursor?: string
}

export interface BrowserSyncStatusProjection {
  mode: 'browser-sync'
  state: 'local-changes-pending' | 'accepted-by-browser-storage' | 'needs-attention'
  lastLocalSaveAt?: string
  lastBrowserStorageWriteAt?: string
  retryAt?: string
  warning?: 'quota-exceeded' | 'write-failed' | 'incomplete-replica' | 'invalid-replica'
  currentUsageBytes?: number
  currentTotalBytes?: number
  quotaBytes?: number
  projectedUsageBytes?: number
  projectedTotalBytes?: number
  usageMeasuredAt?: string
  usageBudgetBytes?: number
  usagePercent?: number
  showCapacityNotice: boolean
}

export class FolderRpcError extends Error {
  constructor(readonly response: Extract<FolderRpcResponse, { ok: false }>) {
    super(response.error.message)
  }
}

/** Content-side Folder boundary. It owns no persistent domain state. */
export class FolderBackgroundClient {
  private readonly rpc = new ExtensionRpcClient()

  async request<T>(
    accountScopeId: string,
    identitySource: 'observed' | 'manual-confirmed',
    method: FolderRpcMethod,
    params: unknown,
  ): Promise<{ data: T; dataRevision: string }> {
    const requestId = nanoid()
    try {
      const response = await this.rpc.request({
        namespace: 'folders', protocolVersion: 1, requestId, method, accountScopeId, identitySource, params,
      }, folderRpcResponseSchema)
      if (!response.ok) {
        console.error('[Folders][rpc] background rejected request', {
          requestId, method, accountScopeId, code: response.error.code, retryable: response.error.retryable,
        })
        throw new FolderRpcError(response)
      }
      return { data: response.data as T, dataRevision: response.dataRevision }
    } catch (error) {
      if (!(error instanceof FolderRpcError)) {
        console.error('[Folders][rpc] transport or response failure', {
          requestId, method, accountScopeId,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
        })
      }
      throw error
    }
  }

  /** Loads all Folder summaries so SideNav can reveal rows beyond its preview. */
  async getProjection(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', previousProjection?: FolderProjection): Promise<FolderProjection> {
    const first = await this.request<FolderSidebarState>(accountScopeId, identitySource, 'getSidebarState', { folderLimit: 5 })
    const folders = first.data.folders
    let foldersCursor = first.data.nextCursor
    while (foldersCursor) {
      const next = await this.request<{
        items: typeof folders
        nextCursor?: string
      }>(accountScopeId, identitySource, 'listFolders', { cursor: foldersCursor, limit: 100 })
      folders.push(...next.data.items)
      foldersCursor = next.data.nextCursor
    }
    const memberships: FolderProjection['memberships'] = []
    const chatReferences: FolderProjection['chatReferences'] = []
    const chatCursors: Record<string, string | undefined> = {}
    const previousCounts = new Map<string, number>()
    for (const membership of previousProjection?.memberships ?? []) {
      previousCounts.set(membership.folderId, (previousCounts.get(membership.folderId) ?? 0) + 1)
    }
    // Prepare the first page even for collapsed folders so opening never starts with an empty layout.
    for (const folder of folders) {
      const targetCount = Math.max(10, previousCounts.get(folder.id) ?? 0)
      let loadedCount = 0
      let cursor: string | undefined
      let initialPage: FolderChatSummaryPage | undefined = first.data.chatsByFolder[folder.id]
      do {
        const chats = initialPage
          ? this.projectChatPage(accountScopeId, folder.id, initialPage)
          : await this.getChatPage(accountScopeId, identitySource, folder.id, cursor)
        initialPage = undefined
        memberships.push(...chats.memberships)
        loadedCount += chats.memberships.length
        for (const reference of chats.chatReferences) {
          if (!chatReferences.some((row) => row.chatId === reference.chatId)) chatReferences.push(reference)
        }
        cursor = chats.nextCursor
      } while (cursor && loadedCount < targetCount)
      chatCursors[folder.id] = cursor
    }
    return {
      folders: folders as FolderProjection['folders'],
      memberships,
      chatReferences,
      settings: first.data.settings,
      chatCursors,
    }
  }

  async getChatPage(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', folderId: string, cursor?: string): Promise<FolderChatPage> {
    const result = await this.request<FolderChatSummaryPage>(accountScopeId, identitySource, 'listFolderChats', { folderId, cursor, limit: 10 })
    return this.projectChatPage(accountScopeId, folderId, result.data)
  }

  private projectChatPage(accountScopeId: string, folderId: string, page: FolderChatSummaryPage): FolderChatPage {
    return {
      memberships: page.items.map((chat) => ({
        id: `${accountScopeId}:${folderId}:${chat.chatId}`, accountScopeId, folderId,
        chatId: chat.chatId, orderKey: chat.orderKey, pinnedOrderKey: chat.pinnedOrderKey,
      } as FolderProjection['memberships'][number])),
      chatReferences: page.items.map((chat) => ({
        accountScopeId, chatId: chat.chatId, cachedTitle: chat.cachedTitle,
      } as FolderProjection['chatReferences'][number])),
      nextCursor: page.nextCursor,
    }
  }

  async getSyncStatus(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed'): Promise<BrowserSyncStatusProjection> {
    const result = await this.request<BrowserSyncStatusProjection>(accountScopeId, identitySource, 'getSyncStatus', {})
    return result.data
  }
}

export const folderBackgroundClient = new FolderBackgroundClient()
