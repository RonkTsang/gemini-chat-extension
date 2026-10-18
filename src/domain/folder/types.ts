import type { FolderColorValue, FolderIconKey } from './appearance'
import type { FolderAffected } from './changes'

export const ROOT_FOLDER_ID = '__root__' as const
export const BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT = 80
export const BROWSER_SYNC_SCHEMA_VERSION = 4 as const

export interface BrowserSyncUsage {
  folderBytes: number
  folderBudgetBytes: number
  totalBytes: number
  quotaBytes: number
  usagePercent: number
}

export type FolderOrderKey = string
export type FolderParentId = string | typeof ROOT_FOLDER_ID
export type FolderSyncProvider = 'browser-sync' | 'google-drive'

export interface FolderSyncSettings { enabled: boolean; hideOrganizedChats: boolean }

export interface BrowserSyncManifest {
  did?: string
  schemaVersion: typeof BROWSER_SYNC_SCHEMA_VERSION
  accountScopeId: string
  snapshotId: string
  baseSnapshotId?: string
  chunkCount: number
  payloadBytes: number
  payloadHash: string
  settings: FolderSyncSettings
}

export interface FolderRow {
  /** Local index only; excluded from portable organization data. */
  nameKey?: string
  id: string
  accountScopeId: string
  parentFolderId: FolderParentId
  name: string
  iconKey: FolderIconKey
  colorValue: FolderColorValue
  orderKey: FolderOrderKey
  createdAt: string
  updatedAt: string
}

export interface FolderMembershipRow {
  /** Local index only; excluded from portable organization data. */
  displayOrderKey?: string
  id: string
  accountScopeId: string
  folderId: string
  chatId: string
  orderKey: FolderOrderKey
  pinnedOrderKey?: FolderOrderKey
  createdAt: string
  updatedAt: string
}

export interface ChatReferenceRow {
  accountScopeId: string
  chatId: string
  cachedTitle: string
  createdAt: string
  updatedAt: string
}

export interface FolderSettingsRow extends FolderSyncSettings {
  accountScopeId: string
  collapsedFolderIds: string[]
  updatedAt: string
}

/** One durable publication per account; retries reuse these exact captured bytes. */
export interface FolderSyncPublicationRow {
  accountScopeId: string
  id: string
  baseSnapshotId?: string
  dataRevision: string
  payloadHash: string
  payload: string
  settings: FolderSyncSettings
  createdAt: string
  state: 'prepared' | 'writing'
}

/** One fully validated incoming candidate per account. */
export interface FolderSyncConflictRow {
  accountScopeId: string
  manifest: BrowserSyncManifest
  data: FolderOrganizationData
  localRevision: string
  createdAt: string
}

export type FolderSyncOutcome = 'accepted-by-browser-storage' | 'failed' | 'conflict' | 'busy' | 'deferred'
export interface FolderSyncRunResult { outcome: FolderSyncOutcome; retryAt?: string }

export interface BrowserSyncRecreationRequest { expectedRevision: string; baseSnapshotId: string }

export interface FolderSyncStateRow {
  conflictSummary?: { snapshotId: string; localRevision: string }
  accountScopeId: string
  deviceId: string
  provider: FolderSyncProvider
  localDataRevision: string
  baseSnapshotId?: string
  dirty: boolean
  lastBrowserStorageWriteAt?: string
  driveFileId?: string
  driveFileVersion?: string
  driveChangePageToken?: string
  lastAttemptAt?: string
  retryAt?: string
  retryCount?: number
  lastErrorCode?: string
  browserSyncWarning?: 'quota-exceeded' | 'write-failed' | 'incomplete-replica' | 'invalid-replica' | 'missing-replica' | 'recovery-protection-failed' | 'unsupported-schema-version'
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
  reason: 'automatic' | 'manual' | 'before-delete' | 'before-import' | 'before-restore' | 'before-sync'
  reasons?: FolderSnapshotRow['reason'][]
  organizationHash?: string
  folderCount?: number
  chatCount?: number
  updatedAt?: string
  protectedUntil?: string
  protectionLeases?: Array<{ token: string; expiresAt: string }>
  /** Returned only to the caller holding a protection lease. */
  protectionToken?: string
  schemaVersion: 1
  dataRevision: string
  createdAt: string
  contentHash: string
  /** LZ-String Base64 of FolderOrganizationData, containing current entities. */
  compressedPayload: string
}

/** Local recovery bookkeeping; never included in backups or sync payloads. */
export interface FolderRecoveryStateRow {
  accountScopeId: string
  pendingRevision?: string
  groupSnapshotId?: string
  groupStartedAt?: string
  lastActionAt?: string
  warning?: 'snapshot-failed' | 'quota-exceeded' | 'budget-exceeded' | 'snapshot-too-large'
  automaticSnapshotFailed?: boolean
  updatedAt: string
}

export type FolderMutationEffect = 'organization' | 'sync-settings' | 'local-view'

export interface FolderCommit {
  accountScopeId: string
  dataRevision: string
  baseRevision?: string
  affected?: FolderAffected
  effect?: FolderMutationEffect
}

export interface FolderMutationResult<T> {
  data: T
  commit: FolderCommit
}

export interface FolderDataSnapshot {
  data: FolderAccountData
  dataRevision: string
  pendingRevision?: string
}

export interface FolderLocalStorageStatus {
  snapshotCount?: number
  lastSnapshotAt?: string
  usageBytes?: number
  quotaBytes?: number
  snapshotBytes: number
  snapshotBudgetBytes: number
  low: boolean
  unlimited: boolean
  warning?: FolderRecoveryStateRow['warning']
  automaticSnapshotFailed?: boolean
}

export interface FolderCoordinatorLeaseRow {
  accountScopeId: string
  ownerId: string
  expiresAt: string
}

export interface FolderProjection {
  /** Revision of the organization captured for this view; used for draft guards. */
  dataRevision?: string
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

/** Shared portable data for Browser Sync, restore points, and exports. */
export interface FolderOrganizationData {
  folders: Omit<FolderRow, 'accountScopeId' | 'nameKey'>[]
  memberships: Omit<FolderMembershipRow, 'accountScopeId' | 'displayOrderKey'>[]
  chatReferences: Omit<ChatReferenceRow, 'accountScopeId'>[]
}

/** Browser Sync uses the same current-entity organization format. */
export type FolderSyncData = FolderOrganizationData

export interface FolderExportPayload {
  schemaVersion: 1
  accountScopeId: string
  exportedAt: string
  data: FolderOrganizationData
}
