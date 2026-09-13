import { createExtensionRpcRouter, type ExtensionRpcMessageListener } from '@/integrations/extension-rpc/router'
import { folderRpcEnvelopeSchema, folderRpcParams, folderRpcResponseSchema, type FolderRpcEnvelope, type FolderRpcErrorCode } from '@/domain/folder/rpc'
import { folderRepository } from '@/data/repositories/folderRepository'

import { FolderCommandService } from './command-service'
import { publishFolderInvalidation } from './invalidation'
import { FolderQueryService } from './query-service'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { browser, type Browser } from 'wxt/browser'

const mutatingMethods = new Set<FolderRpcEnvelope['method']>([
  'createFolder', 'createFolderAndAddChat', 'updateFolder', 'moveFolder', 'deleteFolder',
  'addMembership', 'moveMembership', 'removeMembership', 'removeChatAfterGeminiDelete',
  'updateSettings', 'createSnapshot', 'importBackup', 'restoreSnapshot',
])

function mapError(error: unknown): { code: FolderRpcErrorCode; message: string; retryable: boolean } {
  const message = error instanceof Error ? error.message : 'Folders request failed'
  if (message === 'STALE_REVISION') return { code: 'STALE_REVISION', message: 'Folders changed in another view. Refresh and try again.', retryable: true }
  if (message === 'SYNC_DEFERRED') return { code: 'SYNC_DEFERRED', message: 'Browser Sync requires an observed Gemini identity.', retryable: false }
  if (/already exists/i.test(message)) return { code: 'DUPLICATE_NAME', message: 'A Folder with that name already exists.', retryable: false }
  if (/unavailable|not found/i.test(message)) return { code: 'NOT_FOUND', message: 'The requested Folder item is unavailable.', retryable: false }
  if (/valid|required|invalid|must/i.test(message)) return { code: 'VALIDATION_FAILED', message: 'The Folder request is invalid.', retryable: false }
  return { code: 'INTERNAL_ERROR', message: 'Folders could not complete that request.', retryable: true }
}

function summarizeRpcParams(method: FolderRpcEnvelope['method'], params: unknown): unknown {
  // Backups can contain every Folder name and cached chat title. Keep console
  // diagnostics useful without dumping a potentially large user-data payload.
  if (method === 'importBackup') {
    return { payload: '[redacted]', payloadBytes: JSON.stringify(params).length }
  }
  return params
}

function rpcLogContext(request: FolderRpcEnvelope, params?: unknown): Record<string, unknown> {
  return {
    requestId: request.requestId,
    method: request.method,
    accountScopeId: request.accountScopeId,
    identitySource: request.identitySource,
    ...(params === undefined ? {} : { params: summarizeRpcParams(request.method, params) }),
  }
}

function isGeminiContentSender(sender: Browser.runtime.MessageSender): boolean {
  if (sender.id !== browser.runtime.id) return false
  const url = sender.url ?? sender.tab?.url
  return typeof url === 'string' && /^https:\/\/gemini\.google\.com\//u.test(url)
}

export function createFolderRpcHandler(scheduler: FolderSyncScheduler): ExtensionRpcMessageListener {
  const queries = new FolderQueryService()
  const commands = new FolderCommandService(scheduler, queries)
  return createExtensionRpcRouter([{
    namespace: 'folders',
    method: '*',
    // The outer router selects this route; this handler dispatches the fixed
    // Folder method set so no dynamic feature handlers are exposed.
    requestSchema: folderRpcEnvelopeSchema,
    responseSchema: folderRpcResponseSchema,
    validateSender: isGeminiContentSender,
    async handle(rawRequest: unknown, sender) {
      const request = rawRequest as FolderRpcEnvelope
      const parameters = folderRpcParams[request.method].safeParse(request.params)
      if (!parameters.success) {
        console.warn('[Folders][rpc] rejected invalid parameters', rpcLogContext(request, request.params))
        return { ok: false as const, requestId: request.requestId, error: { code: 'INVALID_REQUEST' as const, message: 'The Folder request is invalid.', retryable: false } }
      }
      const params = parameters.data as never
      try {
        console.info('[Folders][rpc] handling request', rpcLogContext(request, params))
        let data: unknown
        switch (request.method) {
          case 'getSidebarState': data = await queries.getSidebarState(request.accountScopeId, (params as { folderLimit: number }).folderLimit); break
          case 'listFolders': { const input = params as { cursor?: string; limit: number }; data = await queries.listFolders(request.accountScopeId, input.cursor, input.limit); break }
          case 'listFolderChats': { const input = params as { folderId: string; cursor?: string; limit: number }; data = await queries.listFolderChats(request.accountScopeId, input.folderId, input.cursor, input.limit); break }
          case 'getPickerOptions': { const input = params as { chatId: string; cursor?: string; limit: number }; data = await queries.getPickerOptions(request.accountScopeId, input.chatId, input.cursor, input.limit); break }
          case 'resolveChatMemberships': data = await queries.resolveChatMemberships(request.accountScopeId, (params as { chatIds: string[] }).chatIds); break
          case 'getFolderDeleteImpact': data = await queries.getFolderDeleteImpact(request.accountScopeId, (params as { folderId: string }).folderId); break
          case 'getSettings': data = await queries.getSidebarState(request.accountScopeId, 1).then((result) => result.settings); break
          case 'getSyncStatus': data = await queries.getSyncStatus(request.accountScopeId); break
          case 'listSnapshots': { const input = params as { cursor?: string; limit: number }; data = await queries.listSnapshots(request.accountScopeId, input.cursor, input.limit); break }
          case 'getRestoreImpact': data = { available: true }; break
          case 'exportBackup': data = await folderRepository.exportAccountData(request.accountScopeId); break
          default:
            data = await commands.execute(request)
            break
        }
        const dataRevision = await queries.revision(request.accountScopeId)
        if (mutatingMethods.has(request.method)) {
          // activityHint and retrySync only schedule work; they do not mutate
          // Folder data before their RPC response. Broadcasting them as data
          // changes made every foreground tab reload its Sidebar needlessly.
          void publishFolderInvalidation(
            { accountScopeId: request.accountScopeId, dataRevision, type: 'folders:data-changed', affected: {} },
            { excludeTabId: sender.tab?.id },
          )
        }
        console.info('[Folders][rpc] completed request', { ...rpcLogContext(request, params), dataRevision })
        return { ok: true as const, requestId: request.requestId, dataRevision, data }
      } catch (error) {
        const mapped = mapError(error)
        console.error('[Folders][rpc] request failed', {
          ...rpcLogContext(request, params),
          code: mapped.code,
          error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
        })
        return { ok: false as const, requestId: request.requestId, error: { ...mapped, currentRevision: await queries.revision(request.accountScopeId) } }
      }
    },
  }])
}
