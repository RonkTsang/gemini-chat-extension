import { nanoid } from 'nanoid'

import { ExtensionRpcClient } from '@/integrations/extension-rpc/client'
import { folderRpcResponseSchema, type FolderRpcMethod, type FolderRpcResponse } from '@/domain/folder/rpc'
import type { FolderProjection, FolderSettingsRow } from '@/domain/folder/types'

export interface BrowserSyncStatusProjection {
  mode: 'browser-sync'
  state: 'local-changes-pending' | 'accepted-by-browser-storage' | 'needs-attention'
  lastLocalSaveAt?: string
  lastBrowserStorageWriteAt?: string
  retryAt?: string
  warning?: 'near-quota' | 'write-failed'
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

  /** Loads only the visible SideNav page and chats for its expanded rows. */
  async getProjection(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed'): Promise<FolderProjection> {
    const first = await this.request<{
      settings: FolderSettingsRow
      folders: Array<{ id: string; parentFolderId: string; name: string; iconKey: string; colorValue: string; orderKey: string }>
      nextCursor?: string
    }>(accountScopeId, identitySource, 'getSidebarState', { folderLimit: 5 })
    const folders = first.data.folders
    const memberships: FolderProjection['memberships'] = []
    const chatReferences: FolderProjection['chatReferences'] = []
    for (const folder of folders.filter((row) => !first.data.settings.collapsedFolderIds.includes(row.id))) {
      let chatsCursor: string | undefined
      do {
        const chats = await this.request<{ items: Array<{ chatId: string; cachedTitle: string; orderKey: string }>; nextCursor?: string }>(accountScopeId, identitySource, 'listFolderChats', { folderId: folder.id, cursor: chatsCursor, limit: 100 })
        chats.data.items.forEach((chat) => {
          memberships.push({ id: `${accountScopeId}:${folder.id}:${chat.chatId}`, accountScopeId, folderId: folder.id, chatId: chat.chatId, orderKey: chat.orderKey } as FolderProjection['memberships'][number])
          if (!chatReferences.some((reference) => reference.chatId === chat.chatId)) {
            chatReferences.push({ accountScopeId, chatId: chat.chatId, cachedTitle: chat.cachedTitle } as FolderProjection['chatReferences'][number])
          }
        })
        chatsCursor = chats.data.nextCursor
      } while (chatsCursor)
    }
    return {
      folders: folders as FolderProjection['folders'],
      memberships,
      chatReferences,
      settings: first.data.settings,
    }
  }

  async getSyncStatus(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed'): Promise<BrowserSyncStatusProjection> {
    const result = await this.request<BrowserSyncStatusProjection>(accountScopeId, identitySource, 'getSyncStatus', {})
    return result.data
  }
}

export const folderBackgroundClient = new FolderBackgroundClient()
