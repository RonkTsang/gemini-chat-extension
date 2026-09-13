import type { FolderColorValue, FolderIconKey } from './appearance'

export const ROOT_FOLDER_ID = '__root__' as const

export type FolderVersionStamp = string
export type FolderOrderKey = string
export type FolderParentId = string | typeof ROOT_FOLDER_ID
export type FolderSyncProvider = 'browser-sync' | 'google-drive'

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
  fieldVersions: Record<string, FolderVersionStamp>
}

export type FolderOperationType =
  | 'folder.create'
  | 'folder.update'
  | 'folder.move'
  | 'folder.delete-subtree'
  | 'membership.add'
  | 'membership.move'
  | 'membership.remove'
  | 'chat-reference.update'
  | 'order.rebalance'
  | 'settings.update'
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
  parentRevisions: string[]
  includedOperationIds: string[]
  contentHash: string
  serializedEnvelope: string
  createdAt: string
  state: 'prepared' | 'writing' | 'accepted-by-browser-storage' | 'confirmed-by-remote-provider' | 'superseded'
}

export interface FolderSyncStateRow {
  accountScopeId: string
  deviceId: string
  provider: FolderSyncProvider
  authorityEpoch: string
  dataRevision: string
  lastAppliedRevision?: string
  lastUploadedRevision?: string
  driveFileId?: string
  driveFileVersion?: string
  driveChangePageToken?: string
  lastSuccessfulSyncAt?: string
  lastAttemptAt?: string
  retryAt?: string
  lastErrorCode?: string
  browserSyncWarning?: 'near-quota' | 'write-failed'
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
  folders: FolderRow[]
  memberships: FolderMembershipRow[]
  chatReferences: ChatReferenceRow[]
  settings: FolderSettingsRow
}

export interface FolderExportPayload {
  schemaVersion: 1
  accountScopeId: string
  folders: FolderRow[]
  memberships: FolderMembershipRow[]
  chatReferences: ChatReferenceRow[]
  settings: FolderSettingsRow
  exportedAt: string
}

export interface FolderSyncEnvelope {
  appId: 'gemini-power-kit-folders'
  schemaVersion: 1
  syncProtocolVersion: 1
  accountScopeId: string
  authority: { provider: FolderSyncProvider; epoch: string }
  dataRevision: string
  parentRevisions: string[]
  generatedByDeviceId: string
  generatedAt: string
  encoding: { codec: 'lz-string-base64'; codecVersion: 1 }
  contentHash: string
  payload: string
}
