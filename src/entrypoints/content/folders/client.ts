import { logDevEvent } from '@/utils/devLogger'
import { nanoid } from 'nanoid'

import { ExtensionRpcClient } from '@/integrations/extension-rpc/client'
import { folderRpcResponseSchema, type FolderRpcMethod, type FolderRpcResponse } from '@/domain/folder/rpc'
import type { ChatReferenceRow, FolderProjection, FolderRow, FolderSettingsRow } from '@/domain/folder/types'
import type { FolderChange } from '@/domain/folder/changes'
import { tt } from '@/utils/i18n'
import type { FolderChatSummaryPage, FolderSidebarState } from '@/domain/folder/sidebar'

export interface FolderChatPage {
  dataRevision?: string
  memberships: FolderProjection['memberships']
  chatReferences: FolderProjection['chatReferences']
  nextCursor?: string
}

export interface BrowserSyncStatusProjection {
  localRevision?: string
  baseSnapshotId?: string
  mode: 'browser-sync'
  state: 'idle' | 'local-changes-pending' | 'accepted-by-browser-storage' | 'needs-attention' | 'conflict'
  lastLocalSaveAt?: string
  lastBrowserStorageWriteAt?: string
  conflict?: { snapshotId: string; localRevision: string }
  retryAt?: string
  warning?: 'quota-exceeded' | 'write-failed' | 'incomplete-replica' | 'invalid-replica' | 'missing-replica' | 'recovery-protection-failed' | 'unsupported-schema-version'
  currentUsageBytes?: number
  folderCount?: number
  chatCount?: number
  currentTotalBytes?: number
  quotaBytes?: number
  projectedUsageBytes?: number
  projectedTotalBytes?: number
  usageMeasuredAt?: string
  usageBudgetBytes?: number
  usagePercent?: number
  showCapacityNotice: boolean
  localRecoveryWarning?: 'snapshot-failed' | 'quota-exceeded' | 'budget-exceeded' | 'snapshot-too-large'
  localAutomaticSnapshotFailed?: boolean
}

export class FolderRpcError extends Error {
  constructor(readonly response: Extract<FolderRpcResponse, { ok: false }>) {
    const keys = {
      LOCAL_STORAGE_FULL: 'folders_storage_quota_error',
      SNAPSHOT_BUDGET_EXCEEDED: 'folders_snapshot_protected_budget_error',
      SNAPSHOT_TOO_LARGE: 'folders_snapshot_too_large_error',
      SNAPSHOT_PROTECTION_FAILED: 'folders_recovery_protection_failed',
      FOLDER_SAVE_FAILED: 'folders_current_change_unsaved',
      STALE_REVISION: 'folders_draft_stale',
      MANUAL_SNAPSHOT_FAILED: 'folders_recovery_manual_failed',
    }
    const code = response.error.code
    super(code in keys ? tt(keys[code as keyof typeof keys], response.error.message) : response.error.message)
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
    traceId?: string,
  ): Promise<{ data: T; dataRevision: string; change?: FolderChange }> {
    const requestId = nanoid()
    const startedAt = import.meta.env.DEV ? performance.now() : 0
    const diagnosticParams = import.meta.env.DEV && params && typeof params === 'object' ? params as Record<string, unknown> : undefined
    const diagnostic = import.meta.env.DEV ? {
      traceId: traceId ?? requestId, requestId, accountScopeId, method, context: 'content', phase: 'rpc',
      folderId: typeof diagnosticParams?.folderId === 'string' ? diagnosticParams.folderId : undefined,
      limit: typeof diagnosticParams?.limit === 'number' ? diagnosticParams.limit : diagnosticParams?.folderLimit,
      hasCursor: typeof diagnosticParams?.cursor === 'string',
    } : undefined
    if (import.meta.env.DEV) logDevEvent('debug', '[Folders][rpc]', 'rpc.started', diagnostic)
    try {
      const response = await this.rpc.request({
        namespace: 'folders', protocolVersion: 1, requestId, ...(import.meta.env.DEV && traceId ? { traceId } : {}), method, accountScopeId, identitySource, params,
      }, folderRpcResponseSchema)
      if (!response.ok) {
        console.error('[Folders][rpc] background rejected request', {
          requestId, method, accountScopeId, code: response.error.code, retryable: response.error.retryable,
        })
        throw new FolderRpcError(response)
      }
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][rpc]', 'rpc.completed', () => ({ ...diagnostic, result: 'success',
        durationMs: performance.now() - startedAt, dataRevision: response.dataRevision,
        ...(import.meta.env.VITE_FOLDER_DIAGNOSTIC_RPC_BYTES === 'true'
          ? { responseBytes: new TextEncoder().encode(JSON.stringify(response)).byteLength } : {}),
      }))
      return { data: response.data as T, dataRevision: response.dataRevision, ...(response.change ? { change: response.change } : {}) }
    } catch (error) {
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][rpc]', 'rpc.failed', { ...diagnostic, result: 'failed', durationMs: performance.now() - startedAt })
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
  async getProjection(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', previousProjection?: FolderProjection, traceId = import.meta.env.DEV ? `folder-projection-${nanoid(10)}` : undefined): Promise<FolderProjection> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await this.captureProjection(accountScopeId, identitySource, previousProjection, traceId) }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'STALE_REVISION' || attempt === 1) throw error
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.retry', { traceId, context: 'content', phase: 'projection', result: 'retry', reason: 'STALE_REVISION', attempt: attempt + 1 })
      }
    }
    throw new Error('STALE_REVISION')
  }

  private async captureProjection(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', previousProjection: FolderProjection | undefined, traceId?: string): Promise<FolderProjection> {
    const first = await this.request<FolderSidebarState>(accountScopeId, identitySource, 'getSidebarState', { folderLimit: 5 }, traceId)
    const folders = [...first.data.folders]
    let requestedFolderPages = 0
    let requestedChatPages = 0
    let foldersCursor = first.data.nextCursor
    while (foldersCursor) {
      const next = await this.request<{
        items: typeof folders
        nextCursor?: string
      }>(accountScopeId, identitySource, 'listFolders', { cursor: foldersCursor, limit: 100 }, traceId)
      if (next.dataRevision !== first.dataRevision) throw new Error('STALE_REVISION')
      if (import.meta.env.DEV) requestedFolderPages += 1
      folders.push(...next.data.items)
      foldersCursor = next.data.nextCursor
    }
    const memberships: FolderProjection['memberships'] = []
    const chatReferences: FolderProjection['chatReferences'] = []
    const referenceIds = new Set<string>()
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
          ? this.projectChatPage(accountScopeId, folder.id, initialPage, first.dataRevision)
          : await this.getChatPage(accountScopeId, identitySource, folder.id, cursor, traceId)
        if (chats.dataRevision !== first.dataRevision) throw new Error('STALE_REVISION')
        if (import.meta.env.DEV && !initialPage) requestedChatPages += 1
        initialPage = undefined
        memberships.push(...chats.memberships)
        loadedCount += chats.memberships.length
        for (const reference of chats.chatReferences) {
          if (!referenceIds.has(reference.chatId)) { referenceIds.add(reference.chatId); chatReferences.push(reference) }
        }
        cursor = chats.nextCursor
      } while (cursor && loadedCount < targetCount)
      chatCursors[folder.id] = cursor
    }
    if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.capture', {
      traceId, context: 'content', phase: 'projection', mode: 'full', dataRevision: first.dataRevision,
      requestedFolderPages, requestedChatPages, sidebarRequests: 1,
    })
    return {
      dataRevision: first.dataRevision,
      folders: folders as FolderProjection['folders'],
      memberships,
      chatReferences,
      settings: first.data.settings,
      chatCursors,
    }
  }

  /** Rebuild affected ranges from their first page; all reads must match the committed revision. */
  async getChangedProjection(previous: FolderProjection, change: FolderChange, identitySource: 'observed' | 'manual-confirmed', returned?: { settings?: FolderSettingsRow; reference?: ChatReferenceRow }): Promise<FolderProjection> {
    const { accountScopeId, dataRevision, affected } = change
    const settingsOnly = affected.settings && !affected.all && !affected.folders && !affected.folderMetadataIds && !affected.folderIds && !affected.chatIds
    if (settingsOnly && change.baseRevision === dataRevision) {
      const settings = returned?.settings ?? (await this.request<FolderSettingsRow>(accountScopeId, identitySource, 'getSettings', {})).data
      return { ...previous, settings }
    }
    if (previous.dataRevision !== change.baseRevision || affected.all) throw new Error('STALE_REVISION')
    const read = async <T>(method: FolderRpcMethod, params: unknown): Promise<T> => {
      const result = await this.request<T>(accountScopeId, identitySource, method, params)
      if (result.dataRevision !== dataRevision) throw new Error('STALE_REVISION')
      return result.data
    }
    let folders = previous.folders
    if (affected.folders) {
      folders = []
      let cursor: string | undefined
      do {
        const result = await read<{ items: FolderRow[]; nextCursor?: string }>('listFolders', { cursor, limit: 100 })
        folders.push(...result.items); cursor = result.nextCursor
      } while (cursor)
    } else if (affected.folderIds?.length || affected.folderMetadataIds?.length) {
      const summaryIds = [...new Set([...(affected.folderIds ?? []), ...(affected.folderMetadataIds ?? [])])]
      const summaries = await read<FolderRow[]>('getFolderSummaries', { folderIds: summaryIds })
      const byId = new Map(summaries.map((folder) => [folder.id, folder]))
      const affectedIds = new Set(summaryIds)
      folders = folders.flatMap((folder) => affectedIds.has(folder.id) ? byId.has(folder.id) ? [byId.get(folder.id)!] : [] : [folder])
    }
    const folderIds = new Set(folders.map((folder) => folder.id))
    const previousIds = new Set(previous.folders.map((folder) => folder.id))
    const reloadIds = new Set([...(affected.folderIds ?? []), ...folders.filter((folder) => !previousIds.has(folder.id)).map((folder) => folder.id)])
    const previousCounts = new Map<string, number>()
    for (const row of previous.memberships) previousCounts.set(row.folderId, (previousCounts.get(row.folderId) ?? 0) + 1)
    const rangesChanged = affected.folders || !!affected.folderIds?.length
    const memberships = rangesChanged ? previous.memberships.filter((row) => folderIds.has(row.folderId) && !reloadIds.has(row.folderId)) : previous.memberships
    const references = new Map(previous.chatReferences.map((row) => [row.chatId, row]))
    const chatCursors = rangesChanged ? Object.fromEntries(Object.entries(previous.chatCursors ?? {}).filter(([id]) => folderIds.has(id))) : previous.chatCursors ?? {}
    let requestedChatPages = 0
    for (const folderId of reloadIds) {
      if (!folderIds.has(folderId)) continue
      let loaded = 0
      let cursor: string | undefined
      do {
        const page = await this.getChatPage(accountScopeId, identitySource, folderId, cursor)
        if (import.meta.env.DEV) requestedChatPages += 1
        if (page.dataRevision !== dataRevision) throw new Error('STALE_REVISION')
        memberships.push(...page.memberships)
        for (const reference of page.chatReferences) references.set(reference.chatId, reference)
        loaded += page.memberships.length; cursor = page.nextCursor
      } while (cursor && loaded < Math.max(10, previousCounts.get(folderId) ?? 0))
      chatCursors[folderId] = cursor
    }
    if (affected.chatIds?.length) {
      for (const chatId of affected.chatIds) references.delete(chatId)
      const changedReferences = returned?.reference && affected.chatIds.length === 1 && returned.reference.chatId === affected.chatIds[0]
        ? [returned.reference] : await read<ChatReferenceRow[]>('getChatReferences', { chatIds: affected.chatIds })
      for (const reference of changedReferences) references.set(reference.chatId, reference)
    }
    const visibleChatIds = new Set(memberships.map((row) => row.chatId))
    const nextSettings = affected.settings ? returned?.settings ?? await read<FolderSettingsRow>('getSettings', {}) : previous.settings
    if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.partial', {
      context: 'content', phase: 'projection', requestId: change.requestId, dataRevision, affectedFolders: reloadIds.size, requestedChatPages,
    })
    return { dataRevision, folders, memberships, chatReferences: [...references.values()].filter((row) => visibleChatIds.has(row.chatId)), chatCursors, settings: nextSettings }
  }

  async getChatPage(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', folderId: string, cursor?: string, traceId?: string): Promise<FolderChatPage> {
    const result = await this.request<FolderChatSummaryPage>(accountScopeId, identitySource, 'listFolderChats', { folderId, cursor, limit: 10 }, traceId)
    return this.projectChatPage(accountScopeId, folderId, result.data, result.dataRevision)
  }

  private projectChatPage(accountScopeId: string, folderId: string, page: FolderChatSummaryPage, dataRevision: string): FolderChatPage {
    return {
      dataRevision,
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

  async getSyncStatus(accountScopeId: string, identitySource: 'observed' | 'manual-confirmed', traceId?: string): Promise<BrowserSyncStatusProjection> {
    const result = await this.request<BrowserSyncStatusProjection>(accountScopeId, identitySource, 'getSyncStatus', {}, traceId)
    return result.data
  }
}

export const folderBackgroundClient = new FolderBackgroundClient()
