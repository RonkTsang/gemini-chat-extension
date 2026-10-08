import Dexie from 'dexie'
import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'

import { db } from '../db'
import {
  DEFAULT_FOLDER_COLOR_VALUE,
  DEFAULT_FOLDER_ICON_KEY,
  type FolderColorValue,
  type FolderIconKey,
  isFolderIconKey,
  normalizeFolderColorValue,
} from '@/domain/folder/appearance'
import type { FolderUpdateInput } from '@/domain/folder/commands'
import { HybridLogicalClock } from '@/domain/folder/hlc'
import { compareAscii, keyBetween, rebalanceOrderKeys } from '@/domain/folder/order-key'
import { compareMembershipOrder } from '@/domain/folder/membership-order'
import { parseFolderAccountData, parseFolderExportPayload, folderSyncSettingsSchema, folderSettingsPatchSchema, settingsVersionSchema, parseFolderSyncData } from '@/domain/folder/schemas'
import {
  BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT,
  ROOT_FOLDER_ID,
  type BrowserSyncUsage,
  type ChatReferenceRow,
  type FolderCoordinatorLeaseRow,
  type FolderExportPayload,
  type FolderMembershipRow,
  type FolderOperationRow,
  type FolderOperationType,
  type FolderProjection,
  type FolderRow,
  type FolderSettingsRow,
  type FolderSnapshotRow,
  type FolderSyncGenerationRow,
  type FolderAccountData,
  type FolderSyncSettings,
  type FolderSyncStateRow,
} from '@/domain/folder/types'
import { decodeLzStringBase64, encodeLzStringBase64, fromFolderSyncData, newestSyncSettings, sha256Hex, toFolderSyncData } from '@/services/folder-sync/codec'
import {
  createFolderTraceId,
  logFolderTrace,
  logFolderTraceError,
} from '@/utils/folderTrace'
import { logDevError } from '@/utils/devLogger'

import { saveFolderSnapshot, recordRecoveryFailure } from '@/services/folder-recovery/snapshots'
import { clearRecoveryFailure, rememberRecoveryFailure } from '@/services/folder-recovery/failure-fallback'
import { classifyRecoveryFailure, FolderRecoveryError, newestSnapshots, SNAPSHOT_PROTECTION_TTL_MS, type FolderRecoveryOptions } from '@/services/folder-recovery/storage'

// The first retry is scheduled after one minute. Do not surface a replica that
// is merely between the manifest and chunk writes until that recovery window
// has elapsed.
const INCOMPLETE_REPLICA_WARNING_GRACE_MS = 60_000
const FOLDER_DEVICE_ID_STORAGE_KEY = 'gpk.folders.device-id.v1'

function currentUsagePatch(state: FolderSyncStateRow, usage: BrowserSyncUsage): Partial<FolderSyncStateRow> {
  return {
    browserSyncCurrentUsageBytes: usage.folderBytes,
    browserSyncCurrentTotalBytes: usage.totalBytes,
    browserSyncQuotaBytes: usage.quotaBytes,
    browserSyncBudgetBytes: usage.folderBudgetBytes,
    browserSyncUsageMeasuredAt: now(),
    browserSyncLastDismissedUsagePercent: usage.folderBytes * 100 < usage.folderBudgetBytes * BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT
      ? undefined
      : state.browserSyncLastDismissedUsagePercent,
  }
}
const runtimeStampTieBreaker = nanoid()
let sharedClock: HybridLogicalClock | undefined
let runtimeDeviceIdReady: Promise<string> | undefined

export interface FolderDeviceIdProvider {
  getDeviceId(): Promise<string>
}

const runtimeFolderDeviceIdProvider: FolderDeviceIdProvider = {
  getDeviceId(): Promise<string> {
    runtimeDeviceIdReady ??= loadRuntimeFolderDeviceId()
    return runtimeDeviceIdReady
  },
}

async function loadRuntimeFolderDeviceId(): Promise<string> {
  // Repository execution is background-only. Calling runtime.sendMessage
  // from a service worker back to itself is not a reliable self-RPC and can
  // fail with “Receiving end does not exist”; storage.local is the actual
  // authority for this installation-scoped identifier.
  const existing = (await browser.storage.local.get(FOLDER_DEVICE_ID_STORAGE_KEY))[FOLDER_DEVICE_ID_STORAGE_KEY]
  if (typeof existing === 'string' && existing.trim()) return existing
  const candidate = `folder-device-${nanoid()}`
  await browser.storage.local.set({ [FOLDER_DEVICE_ID_STORAGE_KEY]: candidate })
  const persisted = (await browser.storage.local.get(FOLDER_DEVICE_ID_STORAGE_KEY))[FOLDER_DEVICE_ID_STORAGE_KEY]
  if (typeof persisted !== 'string' || !persisted.trim()) throw new Error('Folder installation device id is unavailable')
  return persisted
}

export interface FolderPosition {
  beforeId?: string
  afterId?: string
}

export interface FolderCreateInput extends FolderPosition {
  name: string
  iconKey?: FolderIconKey
  colorValue?: FolderColorValue
  parentFolderId?: string
}

export type { FolderUpdateInput } from '@/domain/folder/commands'

export interface FolderMembershipInput extends FolderPosition {
  folderId: string
  chatId: string
  cachedTitle?: string
  /** Correlates user-action diagnostics only; never persisted or synchronized. */
  traceId?: string
}

export interface FolderSettingsPatch {
  enabled?: boolean
  hideOrganizedChats?: boolean
  collapsedFolderIds?: string[]
}

export interface FolderRepository {
  getSettings(accountScopeId: string): Promise<FolderSettingsRow>
  updateSettings(accountScopeId: string, patch: FolderSettingsPatch): Promise<FolderSettingsRow>
  listFolders(accountScopeId: string): Promise<FolderRow[]>
  listMemberships(accountScopeId: string): Promise<FolderMembershipRow[]>
  listChatReferences(accountScopeId: string): Promise<ChatReferenceRow[]>
  getProjection(accountScopeId: string): Promise<FolderProjection>
  createFolder(accountScopeId: string, input: FolderCreateInput): Promise<FolderRow>
  createFolderAndAddChat(accountScopeId: string, input: FolderCreateInput, chatId: string, cachedTitle?: string): Promise<{ folder: FolderRow; membership: FolderMembershipRow }>
  updateFolder(accountScopeId: string, folderId: string, patch: FolderUpdateInput): Promise<FolderRow>
  moveFolder(accountScopeId: string, folderId: string, parentFolderId: string, position?: FolderPosition): Promise<FolderRow>
  deleteFolder(accountScopeId: string, folderId: string): Promise<void>
  upsertMembership(accountScopeId: string, input: FolderMembershipInput): Promise<FolderMembershipRow>
  moveMembership(accountScopeId: string, folderId: string, chatId: string, targetFolderId: string, position?: FolderPosition): Promise<FolderMembershipRow>
  setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMembershipRow>
  removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<void>
  upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string): Promise<ChatReferenceRow>
  removeChatReference(accountScopeId: string, chatId: string): Promise<void>
  removeChatAfterGeminiDelete(accountScopeId: string, chatId: string, protectionSnapshotId?: string): Promise<void>
  createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason'], hold?: boolean): Promise<FolderSnapshotRow>
  releaseSnapshot(accountScopeId: string, snapshotId: string, protectionToken: string): Promise<void>
  listSnapshots(accountScopeId: string): Promise<FolderSnapshotRow[]>
  restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<void>
  exportAccountData(accountScopeId: string): Promise<FolderExportPayload>
  importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<void>
  getAccountData(accountScopeId: string): Promise<FolderAccountData>
  applyBrowserSyncSettings(accountScopeId: string, settings: FolderSyncSettings, settingsVersion: string): Promise<boolean>
  getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined>
  listBrowserSyncWakeScopes(): Promise<string[]>
  hasPendingOperations(accountScopeId: string): Promise<boolean>
  applyBrowserSyncPayload(accountScopeId: string, payload: FolderAccountData, appliedRevision: string, authorityEpoch: string, preservePending?: boolean): Promise<void>
  recordBrowserSyncReplicaObserved(accountScopeId: string, generationId: string): Promise<boolean>
  recordBrowserSyncFailure(accountScopeId: string, errorCode: string, warning?: FolderSyncStateRow['browserSyncWarning'], projectedUsage?: BrowserSyncUsage): Promise<string>
  recordBrowserSyncUsage(accountScopeId: string, usage: BrowserSyncUsage): Promise<void>
  getOrCreateBrowserSyncGeneration(accountScopeId: string): Promise<FolderSyncGenerationRow>
  getRecoverableBrowserSyncGeneration(accountScopeId: string, replacedGenerationId: string): Promise<FolderSyncGenerationRow | undefined>
  listReclaimableBrowserSyncGenerationIds(accountScopeId: string): Promise<string[]>
  markBrowserSyncGenerationWriting(accountScopeId: string, generationId: string, replacedGenerationId?: string): Promise<void>
  markBrowserSyncSettingsAccepted(accountScopeId: string, usage: BrowserSyncUsage): Promise<void>
  markBrowserSyncGenerationAccepted(accountScopeId: string, generationId: string, usage: BrowserSyncUsage): Promise<void>
  dismissBrowserSyncCapacityNotice(accountScopeId: string, displayedUsagePercent: number): Promise<boolean>
  acquireCoordinatorLease(accountScopeId: string, ownerId: string, ttlMs?: number): Promise<FolderCoordinatorLeaseRow>
  releaseCoordinatorLease(accountScopeId: string, ownerId: string): Promise<void>
}

function requireScope(accountScopeId: string): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(accountScopeId)) {
    throw new Error('A valid accountScopeId is required')
  }
  return accountScopeId
}

function now(): string {
  return new Date().toISOString()
}

function isLive<T extends { deletedAt?: string }>(row: T): boolean {
  return !row.deletedAt
}

function membershipId(accountScopeId: string, folderId: string, chatId: string): string {
  return `${accountScopeId}:${folderId}:${chatId}`
}

function normalizeFolderName(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || Array.from(normalized).length > 60) {
    throw new Error('Folder name must be between 1 and 60 characters')
  }
  return normalized
}

function requireFolderIconKey(value: string): FolderIconKey {
  if (!isFolderIconKey(value)) throw new Error('Folder icon is unavailable')
  return value
}

function requireFolderColorValue(value: string): FolderColorValue {
  const normalized = normalizeFolderColorValue(value)
  if (!normalized) throw new Error('Folder color is invalid')
  return normalized
}

function folderNameKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

function normalizeTitle(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (normalized.length > 500) throw new Error('Chat title is too long')
  return normalized
}

function sortByOrder<T extends { id: string; orderKey: string }>(rows: T[]): T[] {
  return rows.sort((left, right) => compareAscii(left.orderKey, right.orderKey) || compareAscii(left.id, right.id))
}

function resolveOrderKey<T extends { id: string; orderKey: string }>(
  siblings: T[],
  position?: FolderPosition,
): string {
  const ordered = sortByOrder([...siblings])
  const beforeId = position?.beforeId
  const afterId = position?.afterId
  if (beforeId && afterId && beforeId === afterId) throw new Error('Position bounds must be distinct')
  if (!beforeId && !afterId) return keyBetween(undefined, ordered[0]?.orderKey)

  const beforeIndex = beforeId === undefined ? -1 : ordered.findIndex((row) => row.id === beforeId)
  const afterIndex = afterId === undefined ? -1 : ordered.findIndex((row) => row.id === afterId)
  if (beforeId && beforeIndex < 0) throw new Error('Position beforeId is unavailable')
  if (afterId && afterIndex < 0) throw new Error('Position afterId is unavailable')
  if (beforeId && afterId && afterIndex + 1 !== beforeIndex) {
    throw new Error('Position bounds are no longer adjacent')
  }
  if (beforeId) return keyBetween(ordered[beforeIndex - 1]?.orderKey, ordered[beforeIndex].orderKey)
  return keyBetween(ordered[afterIndex].orderKey, ordered[afterIndex + 1]?.orderKey)
}

export class FolderRepositoryImpl implements FolderRepository {
  private deviceReady?: Promise<string>

  constructor(
    private readonly deviceIdProvider: FolderDeviceIdProvider = runtimeFolderDeviceIdProvider,
    private readonly recoveryOptions: FolderRecoveryOptions = {},
  ) {}

  private async preheatDevice(): Promise<string> {
    this.deviceReady ??= this.deviceIdProvider.getDeviceId()
    const deviceId = await this.deviceReady
    sharedClock ??= new HybridLogicalClock(`${deviceId}.${runtimeStampTieBreaker}`)
    return deviceId
  }

  private stamp(after?: string): string {
    if (!sharedClock) throw new Error('Folder device id must be preheated before a transaction')
    if (after) sharedClock.observe(after)
    return sharedClock.next()
  }

  private defaultSettings(accountScopeId: string): FolderSettingsRow {
    return {
      accountScopeId,
      enabled: true,
      hideOrganizedChats: false,
      collapsedFolderIds: [],
      updatedAt: now(),
      settingsVersion: '0000000000000:000000:default',
      settingsPending: false,
    }
  }

  private async ensureSettings(accountScopeId: string): Promise<FolderSettingsRow> {
    const existing = await db.folder_settings.get(accountScopeId)
    if (existing) return existing
    const settings = this.defaultSettings(accountScopeId)
    await db.folder_settings.put(settings)
    return settings
  }

  private async rawAccountData(accountScopeId: string): Promise<FolderAccountData> {
    const [folders, memberships, chatReferences] = await Promise.all([
      db.folders.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_chat_references.where('accountScopeId').equals(accountScopeId).toArray(),
    ])
    return {
      accountScopeId,
      folders: sortByOrder(folders),
      memberships: sortByOrder(memberships),
      chatReferences: [...chatReferences].sort((left, right) => compareAscii(left.chatId, right.chatId)),
    }
  }

  private async writeOperation(
    accountScopeId: string,
    deviceId: string,
    operationType: FolderOperationType,
    entityId: string,
    versionStamp: string,
    payload: Record<string, unknown>,
  ): Promise<FolderSyncStateRow> {
    const prior = await db.folder_sync_states.get(accountScopeId)
    const revision = `${deviceId}:${nanoid()}`
    const state: FolderSyncStateRow = {
      accountScopeId,
      deviceId,
      provider: prior?.provider ?? 'browser-sync',
      authorityEpoch: prior?.authorityEpoch ?? `epoch-${nanoid()}`,
      localDataRevision: revision,
      lastObservedReplicaGenerationId: prior?.lastObservedReplicaGenerationId,
      lastAppliedReplicaRevision: prior?.lastAppliedReplicaRevision,
      lastWrittenReplicaGenerationId: prior?.lastWrittenReplicaGenerationId,
      lastBrowserStorageWriteAt: prior?.lastBrowserStorageWriteAt,
      driveFileId: prior?.driveFileId,
      driveFileVersion: prior?.driveFileVersion,
      driveChangePageToken: prior?.driveChangePageToken,
      lastAttemptAt: prior?.lastAttemptAt,
      retryAt: prior?.retryAt,
      retryCount: prior?.retryCount,
      lastErrorCode: prior?.lastErrorCode,
      browserSyncWarning: prior?.browserSyncWarning,
      browserSyncCurrentUsageBytes: prior?.browserSyncCurrentUsageBytes,
      browserSyncCurrentTotalBytes: prior?.browserSyncCurrentTotalBytes,
      browserSyncQuotaBytes: prior?.browserSyncQuotaBytes,
      browserSyncProjectedUsageBytes: prior?.browserSyncProjectedUsageBytes,
      browserSyncProjectedTotalBytes: prior?.browserSyncProjectedTotalBytes,
      browserSyncUsageMeasuredAt: prior?.browserSyncUsageMeasuredAt,
      browserSyncBudgetBytes: prior?.browserSyncBudgetBytes,
      browserSyncLastDismissedUsagePercent: prior?.browserSyncLastDismissedUsagePercent,
      incompleteReplicaSince: prior?.incompleteReplicaSince,
      updatedAt: now(),
    }
    const opId = nanoid()
    const operation: FolderOperationRow = {
      id: opId,
      opId,
      accountScopeId,
      deviceId,
      baseRevision: prior?.lastAppliedReplicaRevision ?? prior?.localDataRevision,
      operationType,
      entityId,
      versionStamp,
      payload,
      createdAt: now(),
      state: 'pending',
    }
    await db.folder_operations.put(operation)
    await db.folder_sync_states.put(state)
    return state
  }

  private async ensureSyncState(accountScopeId: string, deviceId: string): Promise<FolderSyncStateRow> {
    let state!: FolderSyncStateRow
    await db.transaction('rw', db.folder_sync_states, async () => {
      const existing = await db.folder_sync_states.get(accountScopeId)
      state = existing ?? {
        accountScopeId,
        deviceId,
        provider: 'browser-sync',
        authorityEpoch: `epoch-${nanoid()}`,
        localDataRevision: `${deviceId}:initial-${nanoid()}`,
        updatedAt: now(),
      }
      if (!existing) await db.folder_sync_states.put(state)
    })
    return state
  }

  private async resolveFolderOrderKey(
    accountScopeId: string,
    parentFolderId: string,
    siblings: FolderRow[],
    position: FolderPosition | undefined,
    deviceId: string,
  ): Promise<string> {
    try {
      return resolveOrderKey(siblings, position)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('space exhausted')) throw error
      const ordered = sortByOrder([...siblings])
      const keys = rebalanceOrderKeys(ordered.map((folder) => folder.id))
      const versionStamp = this.stamp()
      const updated = ordered.map((folder) => ({
        ...folder,
        orderKey: keys.get(folder.id)!,
        updatedAt: now(),
        versionStamp,
        fieldVersions: { ...folder.fieldVersions, position: versionStamp },
      }))
      await db.folders.bulkPut(updated)
      await this.writeOperation(accountScopeId, deviceId, 'order.rebalance', parentFolderId, versionStamp, {
        parentFolderId,
        folderIds: ordered.map((folder) => folder.id),
      })
      return resolveOrderKey(updated, position)
    }
  }

  private async resolveMembershipOrderKey(
    accountScopeId: string,
    folderId: string,
    siblings: FolderMembershipRow[],
    position: FolderPosition | undefined,
    deviceId: string,
    pinned = false,
  ): Promise<string> {
    const orderedRows = () => siblings.map((row) => ({ ...row, orderKey: pinned ? row.pinnedOrderKey! : row.orderKey }))
    try {
      return resolveOrderKey(orderedRows(), position)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('space exhausted')) throw error
      const ordered = sortByOrder(orderedRows())
      const keys = rebalanceOrderKeys(ordered.map((membership) => membership.id))
      const latestStamp = siblings.map((row) => pinned ? row.pinVersionStamp ?? '' : row.positionVersionStamp).sort().at(-1)
      const versionStamp = this.stamp(latestStamp)
      const updated = siblings.map((membership) => ({
        ...membership,
        ...(pinned
          ? { pinnedOrderKey: keys.get(membership.id)!, pinVersionStamp: versionStamp }
          : { orderKey: keys.get(membership.id)!, positionVersionStamp: versionStamp }),
        updatedAt: now(),
        versionStamp,
      }))
      await db.folder_memberships.bulkPut(updated)
      await this.writeOperation(accountScopeId, deviceId, 'order.rebalance', folderId, versionStamp, {
        folderId,
        membershipIds: ordered.map((membership) => membership.id),
        pinned,
      })
      return resolveOrderKey(updated.map((row) => ({ ...row, orderKey: pinned ? row.pinnedOrderKey! : row.orderKey })), position)
    }
  }

  async getSettings(accountScopeId: string): Promise<FolderSettingsRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let settings!: FolderSettingsRow
    await db.transaction('rw', db.folder_settings, async () => {
      settings = await this.ensureSettings(accountScopeId)
    })
    await this.ensureSyncState(accountScopeId, deviceId)
    return settings
  }

  async updateSettings(accountScopeId: string, patch: FolderSettingsPatch): Promise<FolderSettingsRow> {
    requireScope(accountScopeId)
    patch = folderSettingsPatchSchema.parse(patch)
    const deviceId = await this.preheatDevice()
    await this.ensureSyncState(accountScopeId, deviceId)
    let result!: FolderSettingsRow
    await db.transaction('rw', db.folder_settings, async () => {
      const prior = await this.ensureSettings(accountScopeId)
      const settings = folderSyncSettingsSchema.parse({
        enabled: patch.enabled ?? prior.enabled,
        hideOrganizedChats: patch.hideOrganizedChats ?? prior.hideOrganizedChats,
      })
      const changed = settings.enabled !== prior.enabled || settings.hideOrganizedChats !== prior.hideOrganizedChats
      result = {
        ...prior, ...settings,
        collapsedFolderIds: patch.collapsedFolderIds === undefined ? prior.collapsedFolderIds : [...new Set(patch.collapsedFolderIds)],
        updatedAt: changed ? now() : prior.updatedAt,
        settingsVersion: changed ? this.stamp(prior.settingsVersion) : prior.settingsVersion,
        settingsPending: prior.settingsPending || changed,
      }
      await db.folder_settings.put(result)
    })
    return result
  }

  async applyBrowserSyncSettings(accountScopeId: string, settings: FolderSyncSettings, settingsVersion: string): Promise<boolean> {
    requireScope(accountScopeId)
    const remote = { settings: folderSyncSettingsSchema.parse(settings), settingsVersion: settingsVersionSchema.parse(settingsVersion) }
    await this.preheatDevice()
    return db.transaction('rw', db.folder_settings, async () => {
      const prior = await this.ensureSettings(accountScopeId)
      const local = { settings: { enabled: prior.enabled, hideOrganizedChats: prior.hideOrganizedChats }, settingsVersion: prior.settingsVersion }
      const selected = newestSyncSettings(local, remote)
      const accepted = selected === remote || (local.settingsVersion === remote.settingsVersion && local.settings.enabled === remote.settings.enabled && local.settings.hideOrganizedChats === remote.settings.hideOrganizedChats)
      if (!accepted) return false
      const changed = prior.settingsVersion !== remote.settingsVersion || prior.enabled !== settings.enabled || prior.hideOrganizedChats !== settings.hideOrganizedChats
      await db.folder_settings.put({ ...prior, ...remote.settings, settingsVersion: remote.settingsVersion, settingsPending: false, updatedAt: changed ? now() : prior.updatedAt })
      return changed
    })
  }

  async getAccountData(accountScopeId: string): Promise<FolderAccountData> {
    requireScope(accountScopeId)
    return db.transaction('r', db.folders, db.folder_memberships, db.folder_chat_references, () => this.rawAccountData(accountScopeId))
  }

  async listFolders(accountScopeId: string): Promise<FolderRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return sortByOrder((await db.folders.where('accountScopeId').equals(accountScopeId).toArray()).filter(isLive))
  }

  async listMemberships(accountScopeId: string): Promise<FolderMembershipRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return (await db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray()).filter(isLive).sort(compareMembershipOrder)
  }

  async listChatReferences(accountScopeId: string): Promise<ChatReferenceRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return (await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).toArray())
      .sort((left, right) => compareAscii(left.chatId, right.chatId))
  }

  async getProjection(accountScopeId: string): Promise<FolderProjection> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const [settings, allFolders, allMemberships, chatReferences] = await Promise.all([
      this.getSettings(accountScopeId),
      db.folders.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_chat_references.where('accountScopeId').equals(accountScopeId).toArray(),
    ])
    const folders = sortByOrder(allFolders.filter(isLive))
    const folderIds = new Set(folders.map((folder) => folder.id))
    const memberships = allMemberships.filter((membership) => isLive(membership) && folderIds.has(membership.folderId)).sort(compareMembershipOrder)
    const chatIds = new Set(memberships.map((membership) => membership.chatId))
    return {
      folders,
      memberships,
      chatReferences: chatReferences.filter((chat) => chatIds.has(chat.chatId)).sort((left, right) => compareAscii(left.chatId, right.chatId)),
      settings: {
        ...settings,
        collapsedFolderIds: settings.collapsedFolderIds.filter((folderId) => folderIds.has(folderId)),
      },
    }
  }

  async createFolder(accountScopeId: string, input: FolderCreateInput): Promise<FolderRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const name = normalizeFolderName(input.name)
    const parentFolderId = input.parentFolderId ?? ROOT_FOLDER_ID
    let result!: FolderRow
    await db.transaction('rw', db.folders, db.folder_operations, db.folder_sync_states, async () => {
      if (parentFolderId !== ROOT_FOLDER_ID) {
        let parent = await db.folders.get(parentFolderId)
        let depth = 1
        while (parent) {
          if (parent.accountScopeId !== accountScopeId || !isLive(parent)) throw new Error('Parent folder is unavailable')
          depth += 1
          if (depth > 32) throw new Error('Folder depth exceeds the supported limit')
          if (parent.parentFolderId === ROOT_FOLDER_ID) break
          parent = await db.folders.get(parent.parentFolderId)
        }
        if (!parent) throw new Error('Parent folder is unavailable')
      }
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      if (folders.some((folder) => isLive(folder) && folderNameKey(folder.name) === folderNameKey(name))) {
        throw new Error('Folder name already exists')
      }
      const siblings = folders.filter((folder) => isLive(folder) && folder.parentFolderId === parentFolderId)
      const versionStamp = this.stamp()
      const timestamp = now()
      result = {
        id: nanoid(),
        accountScopeId,
        parentFolderId,
        name,
        iconKey: requireFolderIconKey(input.iconKey ?? DEFAULT_FOLDER_ICON_KEY),
        colorValue: requireFolderColorValue(input.colorValue ?? DEFAULT_FOLDER_COLOR_VALUE),
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, siblings, input, deviceId),
        createdAt: timestamp,
        updatedAt: timestamp,
        versionStamp,
        fieldVersions: { name: versionStamp, iconKey: versionStamp, colorValue: versionStamp, position: versionStamp },
      }
      await db.folders.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'folder.create', result.id, versionStamp, { row: result })
    })
    await this.createAutomaticSnapshot(accountScopeId)
    return result
  }

  async createFolderAndAddChat(accountScopeId: string, input: FolderCreateInput, chatId: string, cachedTitle?: string): Promise<{ folder: FolderRow; membership: FolderMembershipRow }> {
    requireScope(accountScopeId)
    if (!chatId.trim()) throw new Error('A chat id is required')
    const deviceId = await this.preheatDevice()
    const name = normalizeFolderName(input.name)
    const parentFolderId = input.parentFolderId ?? ROOT_FOLDER_ID
    let folder!: FolderRow
    let membership!: FolderMembershipRow
    await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_operations, db.folder_sync_states], async () => {
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      if (parentFolderId !== ROOT_FOLDER_ID) throw new Error('P0 only supports root Folders')
      if (folders.some((row) => isLive(row) && folderNameKey(row.name) === folderNameKey(name))) throw new Error('Folder name already exists')
      const timestamp = now()
      const versionStamp = this.stamp()
      folder = {
        id: nanoid(), accountScopeId, parentFolderId, name,
        iconKey: requireFolderIconKey(input.iconKey ?? DEFAULT_FOLDER_ICON_KEY),
        colorValue: requireFolderColorValue(input.colorValue ?? DEFAULT_FOLDER_COLOR_VALUE),
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, folders.filter((row) => isLive(row) && row.parentFolderId === parentFolderId), input, deviceId),
        createdAt: timestamp, updatedAt: timestamp, versionStamp,
        fieldVersions: { name: versionStamp, iconKey: versionStamp, colorValue: versionStamp, position: versionStamp },
      }
      membership = {
        id: membershipId(accountScopeId, folder.id, chatId), accountScopeId, folderId: folder.id, chatId,
        orderKey: keyBetween(undefined, undefined), createdAt: timestamp, updatedAt: timestamp,
        versionStamp, positionVersionStamp: versionStamp, pinVersionStamp: versionStamp,
      }
      const existingReference = await db.folder_chat_references.get([accountScopeId, chatId])
      const reference: ChatReferenceRow = {
        accountScopeId, chatId, cachedTitle: cachedTitle === undefined ? existingReference?.cachedTitle ?? '' : normalizeTitle(cachedTitle),
        createdAt: existingReference?.createdAt ?? timestamp, updatedAt: timestamp, titleVersionStamp: versionStamp,
      }
      await db.folders.put(folder)
      await db.folder_memberships.put(membership)
      await db.folder_chat_references.put(reference)
      await this.writeOperation(accountScopeId, deviceId, 'folder.create', folder.id, versionStamp, { row: folder, membership })
    })
    await this.createAutomaticSnapshot(accountScopeId)
    return { folder, membership }
  }

  async updateFolder(accountScopeId: string, folderId: string, patch: FolderUpdateInput): Promise<FolderRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    await db.transaction('rw', db.folders, db.folder_operations, db.folder_sync_states, async () => {
      const prior = await db.folders.get(folderId)
      if (!prior || prior.accountScopeId !== accountScopeId || !isLive(prior)) throw new Error('Folder is unavailable')
      const name = patch.name === undefined ? prior.name : normalizeFolderName(patch.name)
      if (patch.name !== undefined) {
        const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
        if (folders.some((folder) => folder.id !== folderId && isLive(folder) && folderNameKey(folder.name) === folderNameKey(name))) {
          throw new Error('Folder name already exists')
        }
      }
      const versionStamp = this.stamp()
      result = {
        ...prior,
        name,
        iconKey: patch.iconKey === undefined ? prior.iconKey : requireFolderIconKey(patch.iconKey),
        colorValue: patch.colorValue === undefined ? prior.colorValue : requireFolderColorValue(patch.colorValue),
        updatedAt: now(),
        versionStamp,
        fieldVersions: {
          ...prior.fieldVersions,
          ...(patch.name === undefined ? {} : { name: versionStamp }),
          ...(patch.iconKey === undefined ? {} : { iconKey: versionStamp }),
          ...(patch.colorValue === undefined ? {} : { colorValue: versionStamp }),
        },
      }
      await db.folders.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'folder.update', folderId, versionStamp, { row: result })
    })
    await this.createAutomaticSnapshot(accountScopeId)
    return result
  }

  async moveFolder(accountScopeId: string, folderId: string, parentFolderId: string, position?: FolderPosition): Promise<FolderRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    await db.transaction('rw', db.folders, db.folder_operations, db.folder_sync_states, async () => {
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      const moving = folders.find((folder) => folder.id === folderId && isLive(folder))
      if (!moving) throw new Error('Folder is unavailable')
      if (parentFolderId !== ROOT_FOLDER_ID) {
        const parent = folders.find((folder) => folder.id === parentFolderId && isLive(folder))
        if (!parent) throw new Error('Parent folder is unavailable')
        const ancestors = new Set<string>()
        let cursor: FolderRow | undefined = parent
        while (cursor) {
          if (cursor.id === moving.id) throw new Error('A folder cannot become its own descendant')
          if (cursor.parentFolderId === ROOT_FOLDER_ID) break
          if (ancestors.has(cursor.id)) throw new Error('Folder tree contains a cycle')
          ancestors.add(cursor.id)
          cursor = folders.find((folder) => folder.id === cursor?.parentFolderId && isLive(folder))
          if (!cursor) throw new Error('Parent folder is unavailable')
        }
      }
      const depthFromTargetRoot = (() => {
        if (parentFolderId === ROOT_FOLDER_ID) return 1
        let depth = 1
        let cursor = folders.find((folder) => folder.id === parentFolderId)
        while (cursor) {
          depth += 1
          if (cursor.parentFolderId === ROOT_FOLDER_ID) return depth
          cursor = folders.find((folder) => folder.id === cursor?.parentFolderId && isLive(folder))
        }
        throw new Error('Parent folder is unavailable')
      })()
      const descendants = new Map<string, FolderRow[]>()
      for (const folder of folders.filter(isLive)) {
        const children = descendants.get(folder.parentFolderId) ?? []
        children.push(folder)
        descendants.set(folder.parentFolderId, children)
      }
      const maxRelativeDepth = (id: string, depth = 1): number => {
        const children = descendants.get(id) ?? []
        return children.reduce((maximum, child) => Math.max(maximum, maxRelativeDepth(child.id, depth + 1)), depth)
      }
      if (depthFromTargetRoot + maxRelativeDepth(moving.id) - 1 > 32) {
        throw new Error('Folder depth exceeds the supported limit')
      }
      const siblings = folders.filter((folder) => isLive(folder) && folder.parentFolderId === parentFolderId && folder.id !== moving.id)
      const versionStamp = this.stamp()
      result = {
        ...moving,
        parentFolderId,
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, siblings, position, deviceId),
        updatedAt: now(),
        versionStamp,
        fieldVersions: { ...moving.fieldVersions, position: versionStamp },
      }
      await db.folders.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'folder.move', folderId, versionStamp, { row: result })
    })
    await this.createAutomaticSnapshot(accountScopeId)
    return result
  }

  async deleteFolder(accountScopeId: string, folderId: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const target = await db.folders.get(folderId)
    if (!target || target.accountScopeId !== accountScopeId || !isLive(target)) return
    await this.withProtection(accountScopeId, 'before-delete', async () => {
      await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_settings, db.folder_operations, db.folder_sync_states], async () => {
        const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
        const descendants = new Set<string>([folderId])
        let changed = true
        while (changed) {
          changed = false
          for (const folder of folders) {
            if (isLive(folder) && descendants.has(folder.parentFolderId) && !descendants.has(folder.id)) {
              descendants.add(folder.id)
              changed = true
            }
          }
        }
        const timestamp = now()
        const versionStamp = this.stamp()
        const tombstones = folders.filter((folder) => descendants.has(folder.id) && isLive(folder)).map((folder) => ({
          ...folder,
          deletedAt: timestamp,
          deleteVersionStamp: versionStamp,
          updatedAt: timestamp,
          versionStamp,
        }))
        const memberships = await db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray()
        const membershipTombstones = memberships.filter((membership) => isLive(membership) && descendants.has(membership.folderId)).map((membership) => ({
          ...membership,
          deletedAt: timestamp,
          deleteVersionStamp: versionStamp,
          updatedAt: timestamp,
          versionStamp,
        }))
        await db.folders.bulkPut(tombstones)
        await db.folder_memberships.bulkPut(membershipTombstones)
        const settings = await this.ensureSettings(accountScopeId)
        await db.folder_settings.put({
          ...settings,
          collapsedFolderIds: settings.collapsedFolderIds.filter((id) => !descendants.has(id)),
          updatedAt: timestamp,
        })
        await this.writeOperation(accountScopeId, deviceId, 'folder.delete-subtree', folderId, versionStamp, {
          folderIds: [...descendants],
          membershipIds: membershipTombstones.map((membership) => membership.id),
        })
      })
    })
  }

  async upsertMembership(accountScopeId: string, input: FolderMembershipInput): Promise<FolderMembershipRow> {
    const traceId = input.traceId ?? createFolderTraceId()
    try {
      requireScope(accountScopeId)
      if (!input.chatId.trim()) throw new Error('A chat id is required')
      logFolderTrace(traceId, 'repository.command-received', {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
        cachedTitleProvided: input.cachedTitle !== undefined,
      })
      const deviceId = await this.preheatDevice()
      logFolderTrace(traceId, 'repository.device-ready', {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
        deviceId,
      })
      let result!: FolderMembershipRow
      let changed = false
      await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_operations, db.folder_sync_states], async () => {
        logFolderTrace(traceId, 'repository.transaction-started', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
        })
        const folder = await db.folders.get(input.folderId)
        if (!folder || folder.accountScopeId !== accountScopeId || !isLive(folder)) throw new Error('Folder is unavailable')
        const id = membershipId(accountScopeId, input.folderId, input.chatId)
        const prior = await db.folder_memberships.get(id)
        logFolderTrace(traceId, 'repository.target-validated', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          membershipId: id,
          existing: Boolean(prior && isLive(prior)),
        })
        if (prior && isLive(prior)) {
          if (input.cachedTitle !== undefined) {
            const existingChat = await db.folder_chat_references.get([accountScopeId, input.chatId])
            const versionStamp = this.stamp()
            const timestamp = now()
            const chatReference: ChatReferenceRow = {
              accountScopeId,
              chatId: input.chatId,
              cachedTitle: normalizeTitle(input.cachedTitle),
              createdAt: existingChat?.createdAt ?? timestamp,
              updatedAt: timestamp,
              titleVersionStamp: versionStamp,
            }
            await db.folder_chat_references.put(chatReference)
            await this.writeOperation(accountScopeId, deviceId, 'chat-reference.update', input.chatId, versionStamp, { row: chatReference })
            changed = true
          }
          result = prior
          logFolderTrace(traceId, 'repository.idempotent-membership', {
            accountScopeId,
            folderId: input.folderId,
            chatId: input.chatId,
            membershipId: result.id,
          })
          return
        }
        const memberships = await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, input.folderId]).toArray()
        const siblings = memberships.filter((membership) => isLive(membership) && membership.id !== id)
        const versionStamp = this.stamp(prior?.pinVersionStamp)
        const timestamp = now()
        result = {
          id,
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          orderKey: await this.resolveMembershipOrderKey(accountScopeId, input.folderId, siblings, input, deviceId),
          createdAt: prior?.createdAt ?? timestamp,
          updatedAt: timestamp,
          versionStamp,
          positionVersionStamp: versionStamp,
          pinVersionStamp: versionStamp,
        }
        await db.folder_memberships.put(result)
        const existingChat = await db.folder_chat_references.get([accountScopeId, input.chatId])
        const chatReference: ChatReferenceRow = {
          accountScopeId,
          chatId: input.chatId,
          cachedTitle: input.cachedTitle === undefined
            ? existingChat?.cachedTitle ?? ''
            : normalizeTitle(input.cachedTitle),
          createdAt: existingChat?.createdAt ?? timestamp,
          updatedAt: timestamp,
          titleVersionStamp: versionStamp,
        }
        await db.folder_chat_references.put(chatReference)
        await this.writeOperation(accountScopeId, deviceId, 'membership.add', result.id, versionStamp, { row: result })
        changed = true
        logFolderTrace(traceId, 'repository.rows-written', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          membershipId: result.id,
          wroteMembership: true,
          wroteChatReference: true,
          queuedOperation: 'membership.add',
        })
      })
      logFolderTrace(traceId, 'repository.transaction-committed', {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
        membershipId: result.id,
        changed,
      })
      if (changed) await this.createAutomaticSnapshot(accountScopeId, traceId)
      return result
    } catch (error) {
      logFolderTraceError(traceId, 'repository.command-failed', error, {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
      })
      throw error
    }
  }

  async moveMembership(accountScopeId: string, folderId: string, chatId: string, targetFolderId: string, position?: FolderPosition): Promise<FolderMembershipRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    await db.transaction('rw', db.folders, db.folder_memberships, db.folder_operations, db.folder_sync_states, async () => {
      const sourceId = membershipId(accountScopeId, folderId, chatId)
      const prior = await db.folder_memberships.get(sourceId)
      const target = await db.folders.get(targetFolderId)
      if (!prior || !isLive(prior) || !target || target.accountScopeId !== accountScopeId || !isLive(target)) {
        throw new Error('Membership or target folder is unavailable')
      }
      const targetId = membershipId(accountScopeId, targetFolderId, chatId)
      const existingTarget = await db.folder_memberships.get(targetId)
      if (existingTarget && isLive(existingTarget) && targetId !== sourceId) throw new Error('Chat already belongs to the target folder')
      const siblings = (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, targetFolderId]).toArray())
        .filter((membership) => isLive(membership) && membership.id !== sourceId && membership.id !== targetId)
      const sameFolder = sourceId === targetId
      const pinned = sameFolder && Boolean(prior.pinnedOrderKey)
      for (const anchorId of [position?.beforeId, position?.afterId]) {
        const anchor = siblings.find((row) => row.id === anchorId)
        if (anchor && Boolean(anchor.pinnedOrderKey) !== pinned) throw new Error('Cannot reorder chats across pin groups')
      }
      const orderKey = await this.resolveMembershipOrderKey(
        accountScopeId, targetFolderId, pinned ? siblings.filter((row) => row.pinnedOrderKey) : siblings,
        position, deviceId, pinned,
      )
      const versionStamp = this.stamp(pinned || !sameFolder ? prior.pinVersionStamp : prior.positionVersionStamp)
      const timestamp = now()
      result = {
        ...prior,
        id: targetId,
        folderId: targetFolderId,
        ...(pinned
          ? { pinnedOrderKey: orderKey, pinVersionStamp: versionStamp }
          : { orderKey, positionVersionStamp: versionStamp }),
        ...(!sameFolder ? { pinnedOrderKey: undefined, pinVersionStamp: versionStamp } : {}),
        updatedAt: timestamp,
        versionStamp,
        deletedAt: undefined,
        deleteVersionStamp: undefined,
      }
      const sourceTombstone = sourceId === targetId
        ? undefined
        : {
            ...prior,
            deletedAt: timestamp,
            deleteVersionStamp: versionStamp,
            updatedAt: timestamp,
            versionStamp,
          }
      if (sourceTombstone) await db.folder_memberships.put(sourceTombstone)
      await db.folder_memberships.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'membership.move', result.id, versionStamp, { row: result, sourceTombstone })
    })
    await this.createAutomaticSnapshot(accountScopeId)
    return result
  }

  async setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMembershipRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    let changed = false
    await db.transaction('rw', db.folders, db.folder_memberships, db.folder_operations, db.folder_sync_states, async () => {
      const prior = await db.folder_memberships.get(membershipId(accountScopeId, folderId, chatId))
      const folder = await db.folders.get(folderId)
      if (!prior || !isLive(prior) || !folder || folder.accountScopeId !== accountScopeId || !isLive(folder)) {
        throw new Error('Membership or folder is unavailable')
      }
      if (Boolean(prior.pinnedOrderKey) === pinned) {
        result = prior
        return
      }
      const siblings = (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folderId]).toArray())
        .filter((row) => isLive(row) && row.id !== prior.id && row.pinnedOrderKey)
      const pinnedOrderKey = pinned
        ? await this.resolveMembershipOrderKey(accountScopeId, folderId, siblings, undefined, deviceId, true)
        : undefined
      const versionStamp = this.stamp(prior.pinVersionStamp)
      result = { ...prior, pinnedOrderKey, pinVersionStamp: versionStamp, versionStamp, updatedAt: now() }
      await db.folder_memberships.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'membership.pin', result.id, versionStamp, { row: result })
      changed = true
    })
    if (changed) await this.createAutomaticSnapshot(accountScopeId)
    return result
  }

  async removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let changed = false
    await db.transaction('rw', db.folder_memberships, db.folder_operations, db.folder_sync_states, async () => {
      const id = membershipId(accountScopeId, folderId, chatId)
      const prior = await db.folder_memberships.get(id)
      if (!prior || !isLive(prior)) return
      const versionStamp = this.stamp()
      const row = { ...prior, deletedAt: now(), deleteVersionStamp: versionStamp, updatedAt: now(), versionStamp }
      await db.folder_memberships.put(row)
      await this.writeOperation(accountScopeId, deviceId, 'membership.remove', id, versionStamp, { row })
      changed = true
    })
    if (changed) await this.createAutomaticSnapshot(accountScopeId)
  }

  async upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string): Promise<ChatReferenceRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    if (!chatId.trim()) throw new Error('A chat id is required')
    let result!: ChatReferenceRow
    await db.transaction('rw', db.folder_chat_references, db.folder_operations, db.folder_sync_states, async () => {
      const prior = await db.folder_chat_references.get([accountScopeId, chatId])
      // One-shot generated titles must not overwrite a rename made meanwhile.
      if (expectedTitle !== undefined) {
        if (!prior) throw new Error('Chat reference is unavailable')
        if (prior.cachedTitle !== expectedTitle) { result = prior; return }
      }
      const versionStamp = this.stamp()
      const timestamp = now()
      result = {
        accountScopeId,
        chatId,
        cachedTitle: normalizeTitle(cachedTitle),
        createdAt: prior?.createdAt ?? timestamp,
        updatedAt: timestamp,
        titleVersionStamp: versionStamp,
      }
      await db.folder_chat_references.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'chat-reference.update', chatId, versionStamp, { row: result })
    })
    return result
  }

  async removeChatReference(accountScopeId: string, chatId: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    await db.transaction('rw', db.folder_memberships, db.folder_chat_references, db.folder_operations, db.folder_sync_states, async () => {
      const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
      if (memberships.some(isLive)) throw new Error('Cannot remove a chat reference with active memberships')
      const existing = await db.folder_chat_references.get([accountScopeId, chatId])
      if (!existing) return
      await db.folder_chat_references.delete([accountScopeId, chatId])
      const versionStamp = this.stamp()
      await this.writeOperation(accountScopeId, deviceId, 'chat-reference.update', chatId, versionStamp, { deleted: true })
    })
  }

  async removeChatAfterGeminiDelete(accountScopeId: string, chatId: string, protectionSnapshotId?: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const remove = async () => {
      await db.transaction('rw', [db.folder_memberships, db.folder_chat_references, db.folder_operations, db.folder_sync_states], async () => {
        const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
        const active = memberships.filter(isLive)
        const reference = await db.folder_chat_references.get([accountScopeId, chatId])
        if (!active.length && !reference) return
        const versionStamp = this.stamp()
        const timestamp = now()
        const tombstones = active.map((membership) => ({
          ...membership,
          deletedAt: timestamp,
          deleteVersionStamp: versionStamp,
          updatedAt: timestamp,
          versionStamp,
        }))
        if (tombstones.length) {
          await db.folder_memberships.bulkPut(tombstones)
          await this.writeOperation(accountScopeId, deviceId, 'membership.remove', chatId, versionStamp, {
            source: 'gemini-delete', membershipIds: tombstones.map((membership) => membership.id),
          })
        }
        if (reference) {
          await db.folder_chat_references.delete([accountScopeId, chatId])
          await this.writeOperation(accountScopeId, deviceId, 'chat-reference.update', chatId, versionStamp, {
            deleted: true,
            source: 'gemini-delete',
          })
        }
      })
    }
    if (protectionSnapshotId) {
      const protection = await db.folder_snapshots.get(protectionSnapshotId)
      if (!protection || protection.accountScopeId !== accountScopeId || !(protection.reasons ?? [protection.reason]).includes('before-delete')) {
        throw new Error('Protection snapshot is unavailable')
      }
      await remove()
      await this.createAutomaticSnapshot(accountScopeId)
    } else {
      await this.withProtection(accountScopeId, 'before-delete', remove)
    }
  }

  async exportAccountData(accountScopeId: string): Promise<FolderExportPayload> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    await this.getSettings(accountScopeId)
    return db.transaction('r', db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, async () => {
      const settings = (await db.folder_settings.get(accountScopeId))!
      return {
        schemaVersion: 1,
        ...(await this.rawAccountData(accountScopeId)),
        settings: { enabled: settings.enabled, hideOrganizedChats: settings.hideOrganizedChats },
        settingsVersion: settings.settingsVersion,
        exportedAt: now(),
      }
    })
  }

  async createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason'], hold = false): Promise<FolderSnapshotRow> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const [payload, state] = await Promise.all([
      this.exportAccountData(accountScopeId), db.folder_sync_states.get(accountScopeId),
    ])
    try {
      const snapshot = await saveFolderSnapshot(payload, state?.localDataRevision ?? 'local-unpublished', reason, this.recoveryOptions, hold)
      clearRecoveryFailure(accountScopeId)
      return snapshot
    } catch (error) {
      try { await recordRecoveryFailure(accountScopeId, error, reason) } catch (statusError) {
        logDevError('[Folders]', 'recovery.failure-status-write-failed', statusError)
        if (reason === 'automatic') rememberRecoveryFailure(accountScopeId, classifyRecoveryFailure(error))
      }
      throw error
    }
  }

  async releaseSnapshot(accountScopeId: string, snapshotId: string, protectionToken: string): Promise<void> {
    requireScope(accountScopeId)
    await db.transaction('rw', db.folder_snapshots, async () => {
      const row = await db.folder_snapshots.get(snapshotId)
      if (row?.accountScopeId === accountScopeId) {
        row.protectionLeases = (row.protectionLeases ?? []).filter((lease) => lease.token !== protectionToken && Date.parse(lease.expiresAt) > Date.now())
        row.protectedUntil = row.protectionLeases.map((lease) => lease.expiresAt).sort().at(-1)
        await db.folder_snapshots.put(row)
      }
    })
  }

  private async withProtection(
    accountScopeId: string, reason: FolderSnapshotRow['reason'], action: () => Promise<void>, targetId?: string,
  ): Promise<void> {
    const targetToken = nanoid()
    if (targetId) {
      try {
        await db.transaction('rw', db.folder_snapshots, async () => {
          const target = await db.folder_snapshots.get(targetId)
          if (!target || target.accountScopeId !== accountScopeId) throw new Error('Snapshot is unavailable')
          const expiresAt = new Date(Date.now() + SNAPSHOT_PROTECTION_TTL_MS).toISOString()
          await db.folder_snapshots.update(targetId, { protectedUntil: expiresAt,
            protectionLeases: [...(target.protectionLeases ?? []).filter((lease) => Date.parse(lease.expiresAt) > Date.now()), { token: targetToken, expiresAt }],
          })
        })
      } catch (error) {
        throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error })
      }
    }
    let protection: FolderSnapshotRow | undefined
    try {
      try {
        protection = await this.createSnapshot(accountScopeId, reason, true)
      } catch (error) {
        throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error })
      }
      await action()
      await this.createAutomaticSnapshot(accountScopeId)
    } finally {
      try {
        if (protection?.protectionToken) await this.releaseSnapshot(accountScopeId, protection.id, protection.protectionToken)
        if (targetId) await this.releaseSnapshot(accountScopeId, targetId, targetToken)
      } catch (error) {
        // Persistent leases expire if cleanup cannot be written or the worker stops.
        logDevError('[Folders]', 'recovery.protection-release-failed', error)
      }
    }
  }

  private async createAutomaticSnapshot(accountScopeId: string, traceId?: string): Promise<void> {
    try {
      const snapshot = await this.createSnapshot(accountScopeId, 'automatic')
      if (traceId) {
        logFolderTrace(traceId, 'repository.snapshot-created', {
          accountScopeId,
          snapshotId: snapshot.id,
        })
      }
    } catch (error) {
      // The completed user mutation remains durable and queued for sync even if
      // an independent recovery point cannot be written on this device.
      if (traceId) {
        logFolderTraceError(traceId, 'repository.snapshot-failed', error, { accountScopeId })
      } else {
        logDevError('[Folders]', 'repository.snapshot-failed', error, { accountScopeId })
      }
    }
  }

  async listSnapshots(accountScopeId: string): Promise<FolderSnapshotRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return newestSnapshots(await db.folder_snapshots.where('accountScopeId').equals(accountScopeId).toArray())
  }

  private async replaceAccountData(
    accountScopeId: string,
    payload: FolderExportPayload,
    operationType: 'snapshot.restore',
    deviceId: string,
    preserveSettings: boolean,
  ): Promise<void> {
    await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_operations, db.folder_sync_states], async () => {
      const currentSettings = await this.ensureSettings(accountScopeId)
      const versionStamp = this.stamp()
      await db.folders.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
      await db.folders.bulkPut(payload.folders)
      await db.folder_memberships.bulkPut(payload.memberships)
      await db.folder_chat_references.bulkPut(payload.chatReferences)
      const incomingSettings: FolderSettingsRow = preserveSettings ? currentSettings : {
        ...currentSettings, ...payload.settings,
        settingsVersion: this.stamp(currentSettings.settingsVersion > payload.settingsVersion ? currentSettings.settingsVersion : payload.settingsVersion), settingsPending: true, updatedAt: now(),
      }
      const liveIds = new Set(payload.folders.filter(isLive).map((folder) => folder.id))
      await db.folder_settings.put({ ...incomingSettings, collapsedFolderIds: currentSettings.collapsedFolderIds.filter((id) => liveIds.has(id)) })
      await this.writeOperation(accountScopeId, deviceId, operationType, accountScopeId, versionStamp, { exportedAt: payload.exportedAt })
    })
  }

  async importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderExportPayload(payload)
    if (parsed.accountScopeId !== accountScopeId) throw new Error('Backup belongs to a different account scope')
    await this.withProtection(accountScopeId, 'before-import', () =>
      this.replaceAccountData(accountScopeId, parsed, 'snapshot.restore', deviceId, true))
  }

  async restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const snapshot = await db.folder_snapshots.get(snapshotId)
    if (!snapshot || snapshot.accountScopeId !== accountScopeId) throw new Error('Snapshot is unavailable')
    if (await sha256Hex(snapshot.compressedPayload) !== snapshot.contentHash) {
      throw new Error('Snapshot integrity check failed')
    }
    const payload = parseFolderExportPayload(decodeLzStringBase64<unknown>(snapshot.compressedPayload))
    await this.withProtection(accountScopeId, 'before-restore', () =>
      this.replaceAccountData(accountScopeId, payload, 'snapshot.restore', deviceId, true), snapshotId)
  }

  async getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return await db.folder_sync_states.get(accountScopeId)
  }

  async listBrowserSyncWakeScopes(): Promise<string[]> {
    const [states, operations, generations, settings] = await Promise.all([
      db.folder_sync_states.toArray(),
      db.folder_operations.toArray(),
      db.folder_sync_generations.toArray(),
      db.folder_settings.toArray(),
    ])
    const pendingScopes = new Set(operations.filter((operation) => operation.state === 'pending').map((operation) => operation.accountScopeId))
    const preparedScopes = new Set(generations
      .filter((generation) => generation.state === 'prepared' || generation.state === 'writing')
      .map((generation) => generation.accountScopeId))
    const settingsScopes = new Set(settings.filter((row) => row.settingsPending).map((row) => row.accountScopeId))
    return states
      .filter((state) => state.provider === 'browser-sync'
        && (pendingScopes.has(state.accountScopeId) || settingsScopes.has(state.accountScopeId) || preparedScopes.has(state.accountScopeId) || Boolean(state.retryAt)))
      .map((state) => state.accountScopeId)
  }

  async hasPendingOperations(accountScopeId: string): Promise<boolean> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const operations = await db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray()
    return operations.some((operation) => operation.state === 'pending')
  }

  async applyBrowserSyncPayload(
    accountScopeId: string,
    payload: FolderAccountData,
    appliedRevision: string,
    authorityEpoch: string,
    preservePending = false,
  ): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderAccountData(payload)
    if (parsed.accountScopeId !== accountScopeId) throw new Error('Browser Sync payload belongs to a different account scope')
    if (!appliedRevision || !authorityEpoch) throw new Error('Browser Sync revision and authority epoch are required')
    await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_operations, db.folder_sync_states], async () => {
      const prior = await db.folder_sync_states.get(accountScopeId)
      if (prior?.provider && prior.provider !== 'browser-sync') {
        throw new Error('Browser Sync is not the active Folder authority')
      }
      await db.folders.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
      await db.folders.bulkPut(parsed.folders)
      await db.folder_memberships.bulkPut(parsed.memberships)
      await db.folder_chat_references.bulkPut(parsed.chatReferences)
      const settings = await this.ensureSettings(accountScopeId)
      const liveIds = new Set(parsed.folders.filter(isLive).map((folder) => folder.id))
      await db.folder_settings.put({ ...settings, collapsedFolderIds: settings.collapsedFolderIds.filter((id) => liveIds.has(id)) })
      const mergedRevision = preservePending ? `${deviceId}:${nanoid()}` : appliedRevision
      const nextState: FolderSyncStateRow = {
        accountScopeId,
        deviceId: prior?.deviceId ?? deviceId,
        provider: 'browser-sync',
        authorityEpoch,
        localDataRevision: mergedRevision,
        lastObservedReplicaGenerationId: prior?.lastObservedReplicaGenerationId,
        lastAppliedReplicaRevision: appliedRevision,
        lastWrittenReplicaGenerationId: prior?.lastWrittenReplicaGenerationId,
        lastBrowserStorageWriteAt: prior?.lastBrowserStorageWriteAt,
        lastAttemptAt: now(),
        retryCount: 0,
        retryAt: undefined,
        lastErrorCode: undefined,
        browserSyncWarning: prior?.browserSyncWarning,
        browserSyncCurrentUsageBytes: prior?.browserSyncCurrentUsageBytes,
        browserSyncCurrentTotalBytes: prior?.browserSyncCurrentTotalBytes,
        browserSyncQuotaBytes: prior?.browserSyncQuotaBytes,
        browserSyncProjectedUsageBytes: prior?.browserSyncProjectedUsageBytes,
        browserSyncProjectedTotalBytes: prior?.browserSyncProjectedTotalBytes,
        browserSyncUsageMeasuredAt: prior?.browserSyncUsageMeasuredAt,
        browserSyncBudgetBytes: prior?.browserSyncBudgetBytes,
        browserSyncLastDismissedUsagePercent: prior?.browserSyncLastDismissedUsagePercent,
        incompleteReplicaSince: undefined,
        updatedAt: now(),
      }
      await db.folder_sync_states.put(nextState)
      if (preservePending) {
        const versionStamp = this.stamp()
        const opId = nanoid()
        await db.folder_operations.put({
          id: opId,
          opId,
          accountScopeId,
          deviceId,
          baseRevision: appliedRevision,
          operationType: 'snapshot.restore',
          entityId: accountScopeId,
          versionStamp,
          payload: { source: 'browser-sync-merge', remoteRevision: appliedRevision },
          createdAt: now(),
          state: 'pending',
        })
      }
    })
  }

  async recordBrowserSyncReplicaObserved(accountScopeId: string, generationId: string): Promise<boolean> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    const statusChanged = state.lastObservedReplicaGenerationId !== generationId
      || state.retryAt !== undefined
      || state.retryCount !== undefined
      || state.lastErrorCode !== undefined
      || state.browserSyncWarning !== undefined
      || state.incompleteReplicaSince !== undefined
    if (!statusChanged) return false
    await db.folder_sync_states.update(accountScopeId, {
      lastObservedReplicaGenerationId: generationId,
      retryAt: undefined,
      retryCount: undefined,
      lastErrorCode: undefined,
      browserSyncWarning: undefined,
      incompleteReplicaSince: undefined,
      updatedAt: now(),
    })
    return true
  }

  async recordBrowserSyncFailure(
    accountScopeId: string,
    errorCode: string,
    warning: FolderSyncStateRow['browserSyncWarning'] = 'write-failed',
    projectedUsage?: BrowserSyncUsage,
  ): Promise<string> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    const attemptedAt = now()
    const retryCount = Math.min((state.retryCount ?? 0) + 1, 6)
    const retryAt = new Date(Date.now() + Math.min(30, 2 ** (retryCount - 1)) * 60_000).toISOString()
    const incompleteReplicaSince = warning === 'incomplete-replica'
      ? state.incompleteReplicaSince ?? attemptedAt
      : undefined
    const incompleteHasExceededGrace = warning === 'incomplete-replica'
      && Date.parse(attemptedAt) - Date.parse(incompleteReplicaSince ?? attemptedAt) >= INCOMPLETE_REPLICA_WARNING_GRACE_MS
    const browserSyncWarning = warning === 'incomplete-replica' && !incompleteHasExceededGrace
      ? state.browserSyncWarning === 'incomplete-replica' ? undefined : state.browserSyncWarning
      : warning
    await db.folder_sync_states.update(accountScopeId, {
      lastAttemptAt: attemptedAt,
      lastErrorCode: errorCode,
      retryAt,
      retryCount,
      browserSyncWarning,
      browserSyncProjectedUsageBytes: projectedUsage?.folderBytes,
      browserSyncProjectedTotalBytes: projectedUsage?.totalBytes,
      browserSyncBudgetBytes: projectedUsage?.folderBudgetBytes ?? state.browserSyncBudgetBytes,
      incompleteReplicaSince,
      updatedAt: now(),
    })
    return retryAt
  }

  async recordBrowserSyncUsage(accountScopeId: string, usage: BrowserSyncUsage): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    await this.ensureSyncState(accountScopeId, deviceId)
    await db.transaction('rw', db.folder_sync_states, async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state) throw new Error('Browser Sync state is unavailable')
      // Measuring storage is not a local data save, a publication, or error recovery.
      await db.folder_sync_states.update(accountScopeId, currentUsagePatch(state, usage))
    })
  }

  async getOrCreateBrowserSyncGeneration(accountScopeId: string): Promise<FolderSyncGenerationRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    await this.ensureSyncState(accountScopeId, deviceId)
    return db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_operations, db.folder_sync_states, db.folder_sync_generations], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state) throw new Error('Folder sync state is unavailable')
      const existing = await db.folder_sync_generations
        .where('[accountScopeId+dataRevision]').equals([accountScopeId, state.localDataRevision]).toArray()
      const reusable = existing.find((row) => row.state === 'prepared' || row.state === 'writing')
      if (reusable) {
        try {
          if (await Dexie.waitFor(sha256Hex(reusable.payload)) !== reusable.payloadHash) throw new Error('Invalid prepared payload hash')
          fromFolderSyncData(accountScopeId, parseFolderSyncData(decodeLzStringBase64(reusable.payload)))
          return reusable
        } catch {
          await db.folder_sync_generations.update(reusable.id, { state: 'superseded' })
        }
      }
      const payload = encodeLzStringBase64(toFolderSyncData(await this.rawAccountData(accountScopeId)))
      const operations = await db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray()
      // Keep data, revision and included operations in one transaction while WebCrypto completes.
      const payloadHash = await Dexie.waitFor(sha256Hex(payload))
      const generation: FolderSyncGenerationRow = {
        id: nanoid(), accountScopeId, syncMode: 'browser-sync', syncEpoch: state.authorityEpoch,
        dataRevision: state.localDataRevision,
        includedOperationIds: operations.filter((operation) => operation.state === 'pending').map((operation) => operation.id),
        payloadHash, payload, createdAt: now(), state: 'prepared',
      }
      await db.folder_sync_generations.put(generation)
      return generation
    })
  }

  async listReclaimableBrowserSyncGenerationIds(accountScopeId: string): Promise<string[]> {
    requireScope(accountScopeId)
    const [state, generations] = await Promise.all([
      db.folder_sync_states.get(accountScopeId),
      db.folder_sync_generations.where('accountScopeId').equals(accountScopeId).toArray(),
    ])
    return generations
      .filter((generation) => generation.id !== state?.lastWrittenReplicaGenerationId
        && (generation.state === 'accepted-by-browser-storage' || generation.state === 'superseded'))
      .map((generation) => generation.id)
  }

  async getRecoverableBrowserSyncGeneration(
    accountScopeId: string,
    replacedGenerationId: string,
  ): Promise<FolderSyncGenerationRow | undefined> {
    requireScope(accountScopeId)
    const candidates = await db.folder_sync_generations.where('accountScopeId').equals(accountScopeId).toArray()
    return candidates.find((generation) => generation.state === 'writing'
      && generation.replacedGenerationId === replacedGenerationId)
  }

  async markBrowserSyncGenerationWriting(
    accountScopeId: string,
    generationId: string,
    replacedGenerationId?: string,
  ): Promise<void> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const generation = await db.folder_sync_generations.get(generationId)
    if (!generation || generation.accountScopeId !== accountScopeId || generation.state === 'accepted-by-browser-storage') {
      throw new Error('Browser Sync generation is unavailable')
    }
    if (generation.replacedGenerationId && replacedGenerationId && generation.replacedGenerationId !== replacedGenerationId) {
      throw new Error('Browser Sync generation replacement target changed')
    }
    await db.folder_sync_generations.update(generationId, {
      state: 'writing',
      replacedGenerationId: generation.replacedGenerationId ?? replacedGenerationId,
    })
  }

  async markBrowserSyncSettingsAccepted(accountScopeId: string, usage: BrowserSyncUsage): Promise<void> {
    requireScope(accountScopeId)
    await db.transaction('rw', db.folder_sync_states, async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state) throw new Error('Folder sync state is unavailable')
      await db.folder_sync_states.put({
        ...state, ...currentUsagePatch(state, usage),
        lastBrowserStorageWriteAt: now(), lastAttemptAt: now(),
        updatedAt: now(),
      })
    })
  }

  async markBrowserSyncGenerationAccepted(
    accountScopeId: string,
    generationId: string,
    usage: BrowserSyncUsage,
  ): Promise<void> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    await db.transaction('rw', [db.folder_operations, db.folder_sync_states, db.folder_sync_generations], async () => {
      const generation = await db.folder_sync_generations.get(generationId)
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!generation || generation.accountScopeId !== accountScopeId || !state) throw new Error('Browser Sync generation is unavailable')
      for (const id of generation.includedOperationIds) {
        const operation = await db.folder_operations.get(id)
        if (operation?.state === 'pending') await db.folder_operations.update(id, { state: 'accepted-by-browser-storage' })
      }
      await db.folder_sync_generations.update(generationId, { state: 'accepted-by-browser-storage' })
      await db.folder_sync_states.put({
        ...state,
        lastWrittenReplicaGenerationId: generation.id,
        lastBrowserStorageWriteAt: now(),
        lastAttemptAt: now(),
        lastErrorCode: undefined,
        retryAt: undefined,
        retryCount: 0,
        browserSyncWarning: undefined,
        ...currentUsagePatch(state, usage),
        browserSyncProjectedUsageBytes: undefined,
        browserSyncProjectedTotalBytes: undefined,
        incompleteReplicaSince: undefined,
        updatedAt: now(),
      })
    })
  }

  async dismissBrowserSyncCapacityNotice(accountScopeId: string, displayedUsagePercent: number): Promise<boolean> {
    requireScope(accountScopeId)
    if (!Number.isFinite(displayedUsagePercent) || displayedUsagePercent < BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT) return false
    return db.transaction('rw', db.folder_sync_states, async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      const currentUsagePercent = state?.browserSyncCurrentUsageBytes !== undefined && state.browserSyncBudgetBytes
        ? state.browserSyncCurrentUsageBytes / state.browserSyncBudgetBytes * 100
        : undefined
      if (!state || currentUsagePercent === undefined || currentUsagePercent < BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT) return false
      const dismissedPercent = Math.max(
        state.browserSyncLastDismissedUsagePercent ?? 0,
        Math.min(currentUsagePercent, displayedUsagePercent),
      )
      if (dismissedPercent === state.browserSyncLastDismissedUsagePercent) return false
      await db.folder_sync_states.update(accountScopeId, {
        browserSyncLastDismissedUsagePercent: dismissedPercent,
        updatedAt: now(),
      })
      return true
    })
  }

  async acquireCoordinatorLease(accountScopeId: string, ownerId: string, ttlMs = 30_000): Promise<FolderCoordinatorLeaseRow> {
    requireScope(accountScopeId)
    if (!ownerId || ttlMs <= 0) throw new Error('A lease owner and positive TTL are required')
    await this.preheatDevice()
    let lease!: FolderCoordinatorLeaseRow
    await db.transaction('rw', db.folder_coordinator_leases, async () => {
      const existing = await db.folder_coordinator_leases.get(accountScopeId)
      if (existing && existing.ownerId !== ownerId && Date.parse(existing.expiresAt) > Date.now()) {
        throw new Error('Folder sync coordinator lease is held by another context')
      }
      lease = { accountScopeId, ownerId, expiresAt: new Date(Date.now() + ttlMs).toISOString() }
      await db.folder_coordinator_leases.put(lease)
    })
    return lease
  }

  async releaseCoordinatorLease(accountScopeId: string, ownerId: string): Promise<void> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    await db.transaction('rw', db.folder_coordinator_leases, async () => {
      const existing = await db.folder_coordinator_leases.get(accountScopeId)
      if (existing?.ownerId === ownerId) await db.folder_coordinator_leases.delete(accountScopeId)
    })
  }
}

export const folderRepository: FolderRepository = new FolderRepositoryImpl()
