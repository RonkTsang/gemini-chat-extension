import type { FolderColorValue, FolderIconKey } from './appearance'

export const ROOT_FOLDER_ID = '__root__' as const
export const BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT = 80

export interface BrowserSyncUsage {
  folderBytes: number
  folderBudgetBytes: number
  totalBytes: number
  quotaBytes: number
  usagePercent: number
}

export type FolderVersionStamp = string
export type FolderOrderKey = string
export type FolderParentId = string | typeof ROOT_FOLDER_ID
export type FolderSyncProvider = 'browser-sync' | 'google-drive'

export interface FolderSyncSettings {
  enabled: boolean
  hideOrganizedChats: boolean
}

export interface BrowserSyncManifest {
  schemaVersion: 3
  accountScopeId: string
  generationId: string
  dataRevision: string
  authorityEpoch: string
  chunkCount: number
  payloadBytes: number
  payloadHash: string
  settings: FolderSyncSettings
  settingsVersion: string
}

export interface FolderRow {
  id: string
  accountScopeId: string
  parentFolderId: FolderParentId
  name: string
  iconKey: FolderIconKey
  colorValue: FolderColorValue
  orderKey: FolderOrderKey
  createdAt: string
  updatedAt: string
  versionStamp: FolderVersionStamp
  fieldVersions: {
    name: FolderVersionStamp
    iconKey: FolderVersionStamp
    colorValue: FolderVersionStamp
    position: FolderVersionStamp
  }
  deletedAt?: string
  deleteVersionStamp?: FolderVersionStamp
}

export interface FolderMembershipRow {
  id: string
  accountScopeId: string
  folderId: string
  chatId: string
  orderKey: FolderOrderKey
  createdAt: string
  updatedAt: string
  versionStamp: FolderVersionStamp
  positionVersionStamp: FolderVersionStamp
  pinnedOrderKey?: FolderOrderKey
  pinVersionStamp?: FolderVersionStamp
  deletedAt?: string
  deleteVersionStamp?: FolderVersionStamp
}

export interface ChatReferenceRow {
  accountScopeId: string
  chatId: string
  cachedTitle: string
  createdAt: string
  updatedAt: string
  titleVersionStamp: FolderVersionStamp
}

export interface FolderSettingsRow {
  accountScopeId: string
  enabled: boolean
  hideOrganizedChats: boolean
  collapsedFolderIds: string[]
  updatedAt: string
  settingsVersion: FolderVersionStamp
  settingsPending: boolean
}

export type FolderOperationType =
  | 'folder.create'
  | 'folder.update'
  | 'folder.move'
  | 'folder.delete-subtree'
  | 'membership.add'
  | 'membership.move'
  | 'membership.pin'
  | 'membership.remove'
  | 'chat-reference.update'
  | 'order.rebalance'
  | 'snapshot.restore'

export interface FolderOperationRow {
  id: string
  opId: string
  accountScopeId: string
  deviceId: string
  baseRevision?: string
  operationType: FolderOperationType
  entityId: string
  versionStamp: FolderVersionStamp
  payload: Record<string, unknown>
  createdAt: string
  state: 'pending' | 'accepted-by-browser-storage' | 'confirmed-by-remote-provider'
}

export interface FolderSyncGenerationRow {
  id: string
  accountScopeId: string
  syncMode: 'browser-sync' | 'google-drive'
  syncEpoch: string
  dataRevision: string
  includedOperationIds: string[]
  payloadHash: string
  payload: string
  createdAt: string
  /** Active replica replaced by this local write; retained for crash recovery. */
  replacedGenerationId?: string
  state: 'prepared' | 'writing' | 'accepted-by-browser-storage' | 'confirmed-by-remote-provider' | 'superseded'
}

export interface FolderSyncStateRow {
  accountScopeId: string
  deviceId: string
  provider: FolderSyncProvider
  authorityEpoch: string
  localDataRevision: string
  lastObservedReplicaGenerationId?: string
  lastAppliedReplicaRevision?: string
  lastWrittenReplicaGenerationId?: string
  lastBrowserStorageWriteAt?: string
  driveFileId?: string
  driveFileVersion?: string
  driveChangePageToken?: string
  lastAttemptAt?: string
  retryAt?: string
  retryCount?: number
  lastErrorCode?: string
  browserSyncWarning?: 'quota-exceeded' | 'write-failed' | 'incomplete-replica' | 'invalid-replica'
  browserSyncCurrentUsageBytes?: number
  browserSyncCurrentTotalBytes?: number
  browserSyncQuotaBytes?: number
  browserSyncProjectedUsageBytes?: number
  browserSyncProjectedTotalBytes?: number
  browserSyncUsageMeasuredAt?: string
  browserSyncBudgetBytes?: number
  browserSyncLastDismissedUsagePercent?: number
  incompleteReplicaSince?: string
  updatedAt: string
}

export interface FolderSnapshotRow {
  id: string
  accountScopeId: string
  reason: 'automatic' | 'before-delete' | 'before-import' | 'before-restore'
  schemaVersion: 1
  dataRevision: string
  createdAt: string
  contentHash: string
  /** LZ-String Base64 of raw, validated account data including tombstones. */
  compressedPayload: string
}

export interface FolderCoordinatorLeaseRow {
  accountScopeId: string
  ownerId: string
  expiresAt: string
}

export interface FolderProjection {
  chatCursors?: Record<string, string | undefined>
  folders: FolderRow[]
  memberships: FolderMembershipRow[]
  chatReferences: ChatReferenceRow[]
  settings: FolderSettingsRow
}

export interface FolderAccountData {
  accountScopeId: string
  folders: FolderRow[]
  memberships: FolderMembershipRow[]
  chatReferences: ChatReferenceRow[]
}

/** Account ownership is supplied by the validated Manifest when persisted locally. */
export interface FolderSyncData {
  folders: Omit<FolderRow, 'accountScopeId'>[]
  memberships: Omit<FolderMembershipRow, 'accountScopeId'>[]
  chatReferences: Omit<ChatReferenceRow, 'accountScopeId'>[]
}

export interface FolderExportPayload extends FolderAccountData {
  schemaVersion: 1
  settings: FolderSyncSettings
  settingsVersion: string
  exportedAt: string
}
