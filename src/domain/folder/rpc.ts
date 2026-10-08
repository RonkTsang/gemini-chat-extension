import { z } from 'zod'

import { chatReferenceRowSchema, folderExportPayloadSchema, folderSettingsPatchSchema, folderMembershipRowSchema, folderRowSchema } from './schemas'
import { BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT } from './types'

export const FOLDER_RPC_NAMESPACE = 'folders' as const
export const FOLDER_RPC_PROTOCOL_VERSION = 1 as const

const accountScopeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u)
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u)
const cursorSchema = z.string().min(1).max(512)
const limitSchema = z.number().int().min(1).max(100)
const positionSchema = z.object({ beforeId: z.string().min(1).optional(), afterId: z.string().min(1).optional() })
const folderInputSchema = z.object({
  name: z.string().min(1).max(500),
  iconKey: z.string().optional(),
  colorValue: z.string().optional(),
  parentFolderId: z.string().min(1).optional(),
}).merge(positionSchema)

export const folderRpcMethodSchema = z.enum([
  'getSidebarState', 'listFolders', 'listFolderChats', 'getPickerOptions',
  'resolveChatMemberships', 'getFolderDeleteImpact', 'getSettings', 'getSyncStatus',
  'listSnapshots', 'getRestoreImpact', 'createFolder', 'createFolderAndAddChat',
  'updateFolder', 'moveFolder', 'deleteFolder', 'addMembership', 'moveMembership',
  'setMembershipPinned', 'removeMembership', 'removeChatAfterGeminiDelete', 'updateChatTitle', 'updateSettings', 'createSnapshot',
  'importBackup', 'restoreSnapshot', 'exportBackup', 'retrySync', 'activityHint',
  'dismissCapacityNotice',
  'measureBrowserSyncUsage',
  'getLocalStorageStatus', 'prepareChatDeletion', 'releaseSnapshot',
])
export type FolderRpcMethod = z.infer<typeof folderRpcMethodSchema>

export const folderRpcEnvelopeSchema = z.object({
  namespace: z.literal(FOLDER_RPC_NAMESPACE),
  protocolVersion: z.literal(FOLDER_RPC_PROTOCOL_VERSION),
  requestId: requestIdSchema,
  method: folderRpcMethodSchema,
  accountScopeId: accountScopeIdSchema,
  identitySource: z.enum(['observed', 'manual-confirmed']),
  params: z.unknown(),
})
export type FolderRpcEnvelope = z.infer<typeof folderRpcEnvelopeSchema>

export const folderRpcErrorCodeSchema = z.enum([
  'INVALID_REQUEST', 'INVALID_SENDER', 'IDENTITY_UNAVAILABLE', 'ACCOUNT_SCOPE_MISMATCH',
  'NOT_FOUND', 'DUPLICATE_NAME', 'STALE_REVISION', 'VALIDATION_FAILED',
  'STORAGE_UNAVAILABLE', 'SYNC_DEFERRED', 'INTERNAL_ERROR',
  'LOCAL_STORAGE_FULL', 'SNAPSHOT_BUDGET_EXCEEDED', 'SNAPSHOT_TOO_LARGE', 'SNAPSHOT_PROTECTION_FAILED',
  'FOLDER_SAVE_FAILED', 'MANUAL_SNAPSHOT_FAILED',
])
export type FolderRpcErrorCode = z.infer<typeof folderRpcErrorCodeSchema>

export const folderRpcResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestId: requestIdSchema, dataRevision: z.string().min(1), data: z.unknown() }),
  z.object({ ok: z.literal(false), requestId: requestIdSchema, error: z.object({
    code: folderRpcErrorCodeSchema,
    message: z.string().min(1).max(240),
    retryable: z.boolean(),
    currentRevision: z.string().min(1).optional(),
  }) }),
])
export type FolderRpcResponse<T = unknown> =
  | { ok: true; requestId: string; dataRevision: string; data: T }
  | { ok: false; requestId: string; error: { code: FolderRpcErrorCode; message: string; retryable: boolean; currentRevision?: string } }

export const folderRpcParams = {
  getSidebarState: z.object({ folderLimit: limitSchema.max(20) }),
  listFolders: z.object({ cursor: cursorSchema.optional(), limit: limitSchema }),
  listFolderChats: z.object({ folderId: z.string().min(1), cursor: cursorSchema.optional(), limit: limitSchema }),
  getPickerOptions: z.object({ chatId: z.string().min(1), cursor: cursorSchema.optional(), limit: limitSchema }),
  resolveChatMemberships: z.object({ chatIds: z.array(z.string().min(1)).min(1).max(100) }),
  getFolderDeleteImpact: z.object({ folderId: z.string().min(1) }),
  getSettings: z.object({}),
  getSyncStatus: z.object({}),
  getLocalStorageStatus: z.object({}),
  prepareChatDeletion: z.object({}),
  releaseSnapshot: z.object({ snapshotId: z.string().min(1), protectionToken: z.string().min(1) }),
  listSnapshots: z.object({ cursor: cursorSchema.optional(), limit: limitSchema }),
  getRestoreImpact: z.object({ snapshotId: z.string().min(1) }),
  createFolder: folderInputSchema,
  createFolderAndAddChat: z.object({ folder: folderInputSchema, chatId: z.string().min(1), cachedTitle: z.string().max(500).optional() }),
  updateFolder: z.object({ folderId: z.string().min(1), patch: z.object({ name: z.string().min(1).max(500).optional(), iconKey: z.string().optional(), colorValue: z.string().optional() }) }),
  moveFolder: z.object({ folderId: z.string().min(1), parentFolderId: z.string().min(1).optional(), expectedRevision: z.string().min(1).optional() }).merge(positionSchema),
  deleteFolder: z.object({ folderId: z.string().min(1), expectedRevision: z.string().min(1).optional() }),
  addMembership: z.object({ folderId: z.string().min(1), chatId: z.string().min(1), cachedTitle: z.string().max(500).optional() }).merge(positionSchema),
  moveMembership: z.object({ folderId: z.string().min(1), targetFolderId: z.string().min(1), chatId: z.string().min(1), expectedRevision: z.string().min(1).optional() }).merge(positionSchema),
  removeMembership: z.object({ folderId: z.string().min(1), chatId: z.string().min(1) }),
  setMembershipPinned: z.object({ folderId: z.string().min(1), chatId: z.string().min(1), pinned: z.boolean() }),
  removeChatAfterGeminiDelete: z.object({ chatId: z.string().min(1), deletionReceipt: z.string().min(1).max(512), protectionSnapshotId: z.string().min(1).optional() }),
  updateChatTitle: z.object({
    chatId: z.string().regex(/^(?:c_)?[a-z0-9]+$/i),
    title: z.string().transform((value) => value.normalize('NFKC').trim()).pipe(z.string().min(1).max(500)),
    expectedTitle: z.string().max(500).optional(),
  }),
  updateSettings: z.object({ patch: folderSettingsPatchSchema }),
  createSnapshot: z.object({}),
  importBackup: z.object({ payload: folderExportPayloadSchema }),
  restoreSnapshot: z.object({ snapshotId: z.string().min(1), expectedRevision: z.string().min(1).optional() }),
  exportBackup: z.object({}),
  retrySync: z.object({}),
  activityHint: z.object({}),
  dismissCapacityNotice: z.object({ displayedUsagePercent: z.number().finite().min(BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT).max(100) }),
  measureBrowserSyncUsage: z.object({}),
} as const

export const folderRpcDataSchemas = {
  folder: folderRowSchema,
  membership: folderMembershipRowSchema,
  chatReference: chatReferenceRowSchema,
} as const
