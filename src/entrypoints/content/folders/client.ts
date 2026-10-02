import { nanoid } from 'nanoid'

import { ExtensionRpcClient } from '@/integrations/extension-rpc/client'
import { folderRpcResponseSchema, type FolderRpcMethod, type FolderRpcResponse } from '@/domain/folder/rpc'
import type { FolderProjection, FolderSettingsRow } from '@/domain/folder/types'

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
  async getProjection(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed'): Promise<FolderProjection> {
    const first = await this.request<{
      settings: FolderSettingsRow
      folders: Array<{ id: string; parentFolderId: string; name: string; iconKey: string; colorValue: string; orderKey: string }>
      nextCursor?: string
    }>(accountScopeId, identitySource, 'getSidebarState', { folderLimit: 5 })
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
    for (const folder of folders.filter((row) => !first.data.settings.collapsedFolderIds.includes(row.id))) {
      const chats = await this.getChatPage(accountScopeId, identitySource, folder.id)
      memberships.push(...chats.memberships)
      for (const reference of chats.chatReferences) {
        if (!chatReferences.some((row) => row.chatId === reference.chatId)) chatReferences.push(reference)
      }
      chatCursors[folder.id] = chats.nextCursor
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
    const result = await this.request<{
      items: Array<{ chatId: string; cachedTitle: string; orderKey: string }>
      nextCursor?: string
    }>(accountScopeId, identitySource, 'listFolderChats', { folderId, cursor, limit: 10 })
    return {
      memberships: result.data.items.map((chat) => ({
        id: `${accountScopeId}:${folderId}:${chat.chatId}`, accountScopeId, folderId,
        chatId: chat.chatId, orderKey: chat.orderKey,
      } as FolderProjection['memberships'][number])),
      chatReferences: result.data.items.map((chat) => ({
        accountScopeId, chatId: chat.chatId, cachedTitle: chat.cachedTitle,
      } as FolderProjection['chatReferences'][number])),
      nextCursor: result.data.nextCursor,
    }
  }

  async getSyncStatus(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed'): Promise<BrowserSyncStatusProjection> {
    const result = await this.request<BrowserSyncStatusProjection>(accountScopeId, identitySource, 'getSyncStatus', {})
    return result.data
  }
}

export const folderBackgroundClient = new FolderBackgroundClient()
