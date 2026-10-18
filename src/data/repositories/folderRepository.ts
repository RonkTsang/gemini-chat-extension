import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'

import { db } from '../db'
import { runFolderMutation, markRecoveryPending } from './folder-mutation'
import {
  DEFAULT_FOLDER_COLOR_VALUE,
  DEFAULT_FOLDER_ICON_KEY,
  type FolderColorValue,
  type FolderIconKey,
  isFolderIconKey,
  normalizeFolderColorValue,
} from '@/domain/folder/appearance'
import type { FolderUpdateInput } from '@/domain/folder/commands'
import { compareAscii, keyBetween, rebalanceOrderKeys } from '@/domain/folder/order-key'
import { compareMembershipOrder } from '@/domain/folder/membership-order'
import { parseFolderAccountData, parseFolderExportPayload, folderSyncSettingsSchema, folderSettingsPatchSchema, parseFolderSyncData, parseFolderOrganizationData } from '@/domain/folder/schemas'
import {
  BROWSER_SYNC_CAPACITY_NOTICE_THRESHOLD_PERCENT,
  ROOT_FOLDER_ID,
  type BrowserSyncUsage,
  type BrowserSyncRecreationRequest,
  type ChatReferenceRow,
  type FolderCoordinatorLeaseRow,
  type FolderDataSnapshot,
  type FolderMutationResult,
  type FolderExportPayload,
  type FolderMembershipRow,
  type FolderProjection,
  type FolderRow,
  type FolderSettingsRow,
  type FolderSnapshotRow,
  type FolderSyncPublicationRow,
  type FolderSyncConflictRow,
  type BrowserSyncManifest,
  type FolderAccountData,
  type FolderSyncSettings,
  type FolderSyncStateRow,
} from '@/domain/folder/types'
import { fromFolderSyncData, stableStringify, toFolderSyncData } from '@/services/folder-sync/codec'
import { decodeLzStringBase64, encodeLzStringBase64, fromFolderOrganizationData, sha256Hex, toFolderOrganizationData } from '@/services/folder-data/codec'
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
let runtimeDeviceIdReady: Promise<string> | undefined

export class FolderCoordinatorLeaseBusyError extends Error {
  constructor(readonly retryAt: string) {
    super('Folder sync coordinator lease is held by another context')
  }
}

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
  updateSettings(accountScopeId: string, patch: FolderSettingsPatch): Promise<FolderMutationResult<FolderSettingsRow>>
  listFolders(accountScopeId: string): Promise<FolderRow[]>
  listMemberships(accountScopeId: string): Promise<FolderMembershipRow[]>
  listChatReferences(accountScopeId: string): Promise<ChatReferenceRow[]>
  getProjection(accountScopeId: string): Promise<FolderProjection>
  createFolder(accountScopeId: string, input: FolderCreateInput): Promise<FolderMutationResult<FolderRow>>
  createFolderAndAddChat(accountScopeId: string, input: FolderCreateInput, chatId: string, cachedTitle?: string): Promise<FolderMutationResult<{ folder: FolderRow; membership: FolderMembershipRow }>>
  updateFolder(accountScopeId: string, folderId: string, patch: FolderUpdateInput): Promise<FolderMutationResult<FolderRow>>
  moveFolder(accountScopeId: string, folderId: string, parentFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderRow>>
  deleteFolder(accountScopeId: string, folderId: string): Promise<FolderMutationResult<void>>
  upsertMembership(accountScopeId: string, input: FolderMembershipInput): Promise<FolderMutationResult<FolderMembershipRow>>
  moveMembership(accountScopeId: string, folderId: string, chatId: string, targetFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderMembershipRow>>
  setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMutationResult<FolderMembershipRow>>
  removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<FolderMutationResult<void>>
  upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string, expectedRevision?: string): Promise<FolderMutationResult<ChatReferenceRow>>
  removeChatReference(accountScopeId: string, chatId: string): Promise<FolderMutationResult<void>>
  removeChatAfterGeminiDelete(accountScopeId: string, chatId: string, protectionSnapshotId?: string): Promise<FolderMutationResult<void>>
  createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason'], hold?: boolean, captured?: FolderDataSnapshot): Promise<FolderSnapshotRow>
  releaseSnapshot(accountScopeId: string, snapshotId: string, protectionToken: string): Promise<void>
  listSnapshots(accountScopeId: string): Promise<FolderSnapshotRow[]>
  restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<FolderMutationResult<void>>
  exportAccountData(accountScopeId: string): Promise<FolderExportPayload>
  importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<FolderMutationResult<void>>
  getAccountData(accountScopeId: string): Promise<FolderAccountData>
  getAccountDataWithRevision(accountScopeId: string): Promise<FolderDataSnapshot>
  getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined>
  listBrowserSyncWakeScopes(): Promise<string[]>
  hasPendingChanges(accountScopeId: string): Promise<boolean>
  applyBrowserSyncSnapshot(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, resolving?: boolean): Promise<boolean>
  recordBrowserSyncConflict(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string): Promise<boolean>
  getBrowserSyncConflict(accountScopeId: string): Promise<FolderSyncConflictRow | undefined>
  selectLocalConflictVersion(accountScopeId: string, expectedRevision: string, snapshotId: string): Promise<boolean>
  recordBrowserSyncHealthy(accountScopeId: string, snapshotId: string, expectedRevision: string): Promise<boolean>
  recordBrowserSyncFailure(accountScopeId: string, errorCode: string, warning?: FolderSyncStateRow['browserSyncWarning'], projectedUsage?: BrowserSyncUsage): Promise<string | undefined>
  recordBrowserSyncUsage(accountScopeId: string, usage: BrowserSyncUsage): Promise<void>
  getOrCreateBrowserSyncPublication(accountScopeId: string): Promise<FolderSyncPublicationRow>
  getBrowserSyncPublication(accountScopeId: string): Promise<FolderSyncPublicationRow | undefined>
  prepareBrowserSyncRecreation(accountScopeId: string, request: BrowserSyncRecreationRequest): Promise<boolean>
  markBrowserSyncPublicationWriting(accountScopeId: string, snapshotId: string): Promise<void>
  markBrowserSyncPublicationAccepted(accountScopeId: string, snapshotId: string, usage: BrowserSyncUsage): Promise<void>
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
    return deviceId
  }

  private defaultSettings(accountScopeId: string): FolderSettingsRow {
    return {
      accountScopeId,
      enabled: true,
      hideOrganizedChats: false,
      collapsedFolderIds: [],
      updatedAt: now(),
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

  private async markOrganizationChanged(accountScopeId: string, deviceId: string): Promise<void> {
    const prior = await db.folder_sync_states.get(accountScopeId)
    await db.folder_sync_states.put({
      ...prior, accountScopeId, deviceId, provider: prior?.provider ?? 'browser-sync',
      localDataRevision: `${deviceId}:${nanoid()}`, dirty: true, updatedAt: now(),
    })
  }

  private async pruneChatReferences(accountScopeId: string): Promise<void> {
    const memberships = await db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray()
    const chatIds = new Set(memberships.map((row) => row.chatId))
    await db.folder_chat_references.where('accountScopeId').equals(accountScopeId)
      .filter((row) => !chatIds.has(row.chatId)).delete()
  }

  private async ensureSyncState(accountScopeId: string, deviceId: string): Promise<FolderSyncStateRow> {
    let state!: FolderSyncStateRow
    await db.transaction('rw', db.folder_sync_states, async () => {
      const existing = await db.folder_sync_states.get(accountScopeId)
      state = existing ?? {
        accountScopeId,
        deviceId,
        provider: 'browser-sync',
        dirty: false,
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

      const updated = ordered.map((folder) => ({
        ...folder,
        orderKey: keys.get(folder.id)!,
        updatedAt: now(),
      }))
      await db.folders.bulkPut(updated)
      await this.markOrganizationChanged(accountScopeId, deviceId)
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
      const updated = siblings.map((membership) => ({
        ...membership,
        ...(pinned
          ? { pinnedOrderKey: keys.get(membership.id)! }
          : { orderKey: keys.get(membership.id)! }),
        updatedAt: now(),

      }))
      await db.folder_memberships.bulkPut(updated)
      await this.markOrganizationChanged(accountScopeId, deviceId)
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

  async updateSettings(accountScopeId: string, patch: FolderSettingsPatch): Promise<FolderMutationResult<FolderSettingsRow>> {
    requireScope(accountScopeId)
    patch = folderSettingsPatchSchema.parse(patch)
    const deviceId = await this.preheatDevice()
    await this.ensureSyncState(accountScopeId, deviceId)
    let result!: FolderSettingsRow
    let mutationEffect: 'sync-settings' | 'local-view' | undefined
    return runFolderMutation(accountScopeId, [db.folder_settings], async () => {
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

      }
      mutationEffect = changed ? 'sync-settings' : JSON.stringify(prior.collapsedFolderIds) !== JSON.stringify(result.collapsedFolderIds) ? 'local-view' : undefined
      await db.folder_settings.put(result)
      if (changed) await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    }, () => mutationEffect)
  }

  async getAccountData(accountScopeId: string): Promise<FolderAccountData> {
    requireScope(accountScopeId)
    return db.transaction('r', db.folders, db.folder_memberships, db.folder_chat_references, () => this.rawAccountData(accountScopeId))
  }

  async listFolders(accountScopeId: string): Promise<FolderRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return sortByOrder((await db.folders.where('accountScopeId').equals(accountScopeId).toArray()))
  }

  async listMemberships(accountScopeId: string): Promise<FolderMembershipRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return (await db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray()).sort(compareMembershipOrder)
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
    const folders = sortByOrder(allFolders)
    const folderIds = new Set(folders.map((folder) => folder.id))
    const memberships = allMemberships.filter((membership) => folderIds.has(membership.folderId)).sort(compareMembershipOrder)
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

  async createFolder(accountScopeId: string, input: FolderCreateInput): Promise<FolderMutationResult<FolderRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const name = normalizeFolderName(input.name)
    const parentFolderId = input.parentFolderId ?? ROOT_FOLDER_ID
    let result!: FolderRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_sync_states], async () => {
      if (parentFolderId !== ROOT_FOLDER_ID) {
        let parent = await db.folders.get(parentFolderId)
        let depth = 1
        while (parent) {
          if (parent.accountScopeId !== accountScopeId) throw new Error('Parent folder is unavailable')
          depth += 1
          if (depth > 32) throw new Error('Folder depth exceeds the supported limit')
          if (parent.parentFolderId === ROOT_FOLDER_ID) break
          parent = await db.folders.get(parent.parentFolderId)
        }
        if (!parent) throw new Error('Parent folder is unavailable')
      }
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      if (folders.some((folder) => folderNameKey(folder.name) === folderNameKey(name))) {
        throw new Error('Folder name already exists')
      }
      const siblings = folders.filter((folder) => folder.parentFolderId === parentFolderId)

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
      }
      await db.folders.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async createFolderAndAddChat(accountScopeId: string, input: FolderCreateInput, chatId: string, cachedTitle?: string): Promise<FolderMutationResult<{ folder: FolderRow; membership: FolderMembershipRow }>> {
    requireScope(accountScopeId)
    if (!chatId.trim()) throw new Error('A chat id is required')
    const deviceId = await this.preheatDevice()
    const name = normalizeFolderName(input.name)
    const parentFolderId = input.parentFolderId ?? ROOT_FOLDER_ID
    let folder!: FolderRow
    let membership!: FolderMembershipRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states], async () => {
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      if (parentFolderId !== ROOT_FOLDER_ID) throw new Error('P0 only supports root Folders')
      if (folders.some((row) => folderNameKey(row.name) === folderNameKey(name))) throw new Error('Folder name already exists')
      const timestamp = now()

      folder = {
        id: nanoid(), accountScopeId, parentFolderId, name,
        iconKey: requireFolderIconKey(input.iconKey ?? DEFAULT_FOLDER_ICON_KEY),
        colorValue: requireFolderColorValue(input.colorValue ?? DEFAULT_FOLDER_COLOR_VALUE),
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, folders.filter((row) => row.parentFolderId === parentFolderId), input, deviceId),
        createdAt: timestamp, updatedAt: timestamp,

      }
      membership = {
        id: membershipId(accountScopeId, folder.id, chatId), accountScopeId, folderId: folder.id, chatId,
        orderKey: keyBetween(undefined, undefined), createdAt: timestamp, updatedAt: timestamp,

      }
      const existingReference = await db.folder_chat_references.get([accountScopeId, chatId])
      const reference: ChatReferenceRow = {
        accountScopeId, chatId, cachedTitle: cachedTitle === undefined ? existingReference?.cachedTitle ?? '' : normalizeTitle(cachedTitle),
        createdAt: existingReference?.createdAt ?? timestamp, updatedAt: timestamp,
      }
      await db.folders.put(folder)
      await db.folder_memberships.put(membership)
      await db.folder_chat_references.put(reference)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return { folder, membership }
    })
  }

  async updateFolder(accountScopeId: string, folderId: string, patch: FolderUpdateInput): Promise<FolderMutationResult<FolderRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_sync_states], async () => {
      if (patch.expectedRevision && (await db.folder_sync_states.get(accountScopeId))?.localDataRevision !== patch.expectedRevision) throw new Error('STALE_REVISION')
      const prior = await db.folders.get(folderId)
      if (!prior || prior.accountScopeId !== accountScopeId) throw new Error('Folder is unavailable')
      const name = patch.name === undefined ? prior.name : normalizeFolderName(patch.name)
      if (patch.name !== undefined) {
        const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
        if (folders.some((folder) => folder.id !== folderId && folderNameKey(folder.name) === folderNameKey(name))) {
          throw new Error('Folder name already exists')
        }
      }
      const iconKey = patch.iconKey === undefined ? prior.iconKey : requireFolderIconKey(patch.iconKey)
      const colorValue = patch.colorValue === undefined ? prior.colorValue : requireFolderColorValue(patch.colorValue)
      if (name === prior.name && iconKey === prior.iconKey && colorValue === prior.colorValue) return prior

      result = {
        ...prior,
        name,
        iconKey,
        colorValue,
        updatedAt: now(),

      }
      await db.folders.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async moveFolder(accountScopeId: string, folderId: string, parentFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_sync_states], async () => {
      const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
      const moving = folders.find((folder) => folder.id === folderId)
      if (!moving) throw new Error('Folder is unavailable')
      if (parentFolderId !== ROOT_FOLDER_ID) {
        const parent = folders.find((folder) => folder.id === parentFolderId)
        if (!parent) throw new Error('Parent folder is unavailable')
        const ancestors = new Set<string>()
        let cursor: FolderRow | undefined = parent
        while (cursor) {
          if (cursor.id === moving.id) throw new Error('A folder cannot become its own descendant')
          if (cursor.parentFolderId === ROOT_FOLDER_ID) break
          if (ancestors.has(cursor.id)) throw new Error('Folder tree contains a cycle')
          ancestors.add(cursor.id)
          cursor = folders.find((folder) => folder.id === cursor?.parentFolderId)
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
          cursor = folders.find((folder) => folder.id === cursor?.parentFolderId)
        }
        throw new Error('Parent folder is unavailable')
      })()
      const descendants = new Map<string, FolderRow[]>()
      for (const folder of folders) {
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
      const siblings = folders.filter((folder) => folder.parentFolderId === parentFolderId && folder.id !== moving.id)

      result = {
        ...moving,
        parentFolderId,
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, siblings, position, deviceId),
        updatedAt: now(),
      }
      await db.folders.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async deleteFolder(accountScopeId: string, folderId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const target = await db.folders.get(folderId)
    if (!target || target.accountScopeId !== accountScopeId) return runFolderMutation(accountScopeId, [], async () => undefined)
    return this.withProtection(accountScopeId, 'before-delete', async () => {
      return runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_sync_states], async () => {
        const folders = await db.folders.where('accountScopeId').equals(accountScopeId).toArray()
        const descendants = new Set<string>([folderId])
        let changed = true
        while (changed) {
          changed = false
          for (const folder of folders) {
            if (descendants.has(folder.parentFolderId) && !descendants.has(folder.id)) {
              descendants.add(folder.id)
              changed = true
            }
          }
        }
        const timestamp = now()

        await db.folders.bulkDelete([...descendants])
        await db.folder_memberships.where('accountScopeId').equals(accountScopeId)
          .filter((row) => descendants.has(row.folderId)).delete()
        await this.pruneChatReferences(accountScopeId)
        const settings = await this.ensureSettings(accountScopeId)
        await db.folder_settings.put({
          ...settings,
          collapsedFolderIds: settings.collapsedFolderIds.filter((id) => !descendants.has(id)),
          updatedAt: timestamp,
        })
        await this.markOrganizationChanged(accountScopeId, deviceId)
      })
    })
  }

  async upsertMembership(accountScopeId: string, input: FolderMembershipInput): Promise<FolderMutationResult<FolderMembershipRow>> {
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
      const mutation = await runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states], async () => {
        logFolderTrace(traceId, 'repository.transaction-started', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
        })
        const folder = await db.folders.get(input.folderId)
        if (!folder || folder.accountScopeId !== accountScopeId) throw new Error('Folder is unavailable')
        const id = membershipId(accountScopeId, input.folderId, input.chatId)
        const prior = await db.folder_memberships.get(id)
        logFolderTrace(traceId, 'repository.target-validated', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          membershipId: id,
          existing: Boolean(prior),
        })
        if (prior) {
          if (input.cachedTitle !== undefined) {
            const existingChat = await db.folder_chat_references.get([accountScopeId, input.chatId])
            if (existingChat?.cachedTitle === normalizeTitle(input.cachedTitle)) { result = prior; return result }

            const timestamp = now()
            const chatReference: ChatReferenceRow = {
              accountScopeId,
              chatId: input.chatId,
              cachedTitle: normalizeTitle(input.cachedTitle),
              createdAt: existingChat?.createdAt ?? timestamp,
              updatedAt: timestamp,

            }
            await db.folder_chat_references.put(chatReference)
            await this.markOrganizationChanged(accountScopeId, deviceId)
            changed = true
          }
          result = prior
          logFolderTrace(traceId, 'repository.idempotent-membership', {
            accountScopeId,
            folderId: input.folderId,
            chatId: input.chatId,
            membershipId: result.id,
          })
          return result
        }
        const memberships = await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, input.folderId]).toArray()
        const siblings = memberships.filter((membership) => membership.id !== id)

        const timestamp = now()
        result = {
          id,
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          orderKey: await this.resolveMembershipOrderKey(accountScopeId, input.folderId, siblings, input, deviceId),
          createdAt: timestamp,
          updatedAt: timestamp,
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

        }
        await db.folder_chat_references.put(chatReference)
        await this.markOrganizationChanged(accountScopeId, deviceId)
        changed = true
        logFolderTrace(traceId, 'repository.rows-written', {
          accountScopeId,
          folderId: input.folderId,
          chatId: input.chatId,
          membershipId: result.id,
          wroteMembership: true,
          wroteChatReference: true,
          mutation: 'membership.add',
        })
        return result
      })
      logFolderTrace(traceId, 'repository.transaction-committed', {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
        membershipId: result.id,
        changed,
      })
      return mutation
    } catch (error) {
      logFolderTraceError(traceId, 'repository.command-failed', error, {
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
      })
      throw error
    }
  }

  async moveMembership(accountScopeId: string, folderId: string, chatId: string, targetFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderMembershipRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_sync_states], async () => {
      const sourceId = membershipId(accountScopeId, folderId, chatId)
      const prior = await db.folder_memberships.get(sourceId)
      const target = await db.folders.get(targetFolderId)
      if (!prior || !target || target.accountScopeId !== accountScopeId) {
        throw new Error('Membership or target folder is unavailable')
      }
      const targetId = membershipId(accountScopeId, targetFolderId, chatId)
      const existingTarget = await db.folder_memberships.get(targetId)
      if (existingTarget && targetId !== sourceId) throw new Error('Chat already belongs to the target folder')
      const siblings = (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, targetFolderId]).toArray())
        .filter((membership) => membership.id !== sourceId && membership.id !== targetId)
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

      const timestamp = now()
      result = {
        ...prior,
        id: targetId,
        folderId: targetFolderId,
        ...(pinned
          ? { pinnedOrderKey: orderKey }
          : { orderKey }),
        ...(!sameFolder ? { pinnedOrderKey: undefined } : {}),
        updatedAt: timestamp,
      }
      if (sourceId !== targetId) await db.folder_memberships.delete(sourceId)
      await db.folder_memberships.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMutationResult<FolderMembershipRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    return runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_sync_states], async () => {
      const prior = await db.folder_memberships.get(membershipId(accountScopeId, folderId, chatId))
      const folder = await db.folders.get(folderId)
      if (!prior || !folder || folder.accountScopeId !== accountScopeId) {
        throw new Error('Membership or folder is unavailable')
      }
      if (Boolean(prior.pinnedOrderKey) === pinned) {
        result = prior
        return result
      }
      const siblings = (await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, folderId]).toArray())
        .filter((row) => row.id !== prior.id && row.pinnedOrderKey)
      const pinnedOrderKey = pinned
        ? await this.resolveMembershipOrderKey(accountScopeId, folderId, siblings, undefined, deviceId, true)
        : undefined

      result = { ...prior, pinnedOrderKey, updatedAt: now() }
      await db.folder_memberships.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    return runFolderMutation(accountScopeId, [db.folder_memberships, db.folder_chat_references], async () => {
      const id = membershipId(accountScopeId, folderId, chatId)
      if (!await db.folder_memberships.get(id)) return
      await db.folder_memberships.delete(id)
      await this.pruneChatReferences(accountScopeId)
      await this.markOrganizationChanged(accountScopeId, deviceId)
    })
  }

  async upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string, expectedRevision?: string): Promise<FolderMutationResult<ChatReferenceRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    if (!chatId.trim()) throw new Error('A chat id is required')
    let result!: ChatReferenceRow
    return runFolderMutation(accountScopeId, [db.folder_chat_references, db.folder_sync_states], async () => {
      if (expectedRevision && (await db.folder_sync_states.get(accountScopeId))?.localDataRevision !== expectedRevision) throw new Error('STALE_REVISION')
      const prior = await db.folder_chat_references.get([accountScopeId, chatId])
      if (!prior) throw new Error('STALE_REVISION')
      // One-shot generated titles must not overwrite a rename made meanwhile.
      if (expectedTitle !== undefined) {
        if (!prior) throw new Error('Chat reference is unavailable')
        if (prior.cachedTitle !== expectedTitle) { result = prior; return result }
      }
      if (prior?.cachedTitle === normalizeTitle(cachedTitle)) return prior

      const timestamp = now()
      result = {
        accountScopeId,
        chatId,
        cachedTitle: normalizeTitle(cachedTitle),
        createdAt: prior?.createdAt ?? timestamp,
        updatedAt: timestamp,

      }
      await db.folder_chat_references.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async removeChatReference(accountScopeId: string, chatId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    return runFolderMutation(accountScopeId, [db.folder_memberships, db.folder_chat_references, db.folder_sync_states], async () => {
      const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
      if (memberships.length) throw new Error('Cannot remove a chat reference with active memberships')
      const existing = await db.folder_chat_references.get([accountScopeId, chatId])
      if (!existing) return
      await db.folder_chat_references.delete([accountScopeId, chatId])

      await this.markOrganizationChanged(accountScopeId, deviceId)
    })
  }

  async removeChatAfterGeminiDelete(accountScopeId: string, chatId: string, protectionSnapshotId?: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const remove = async () => {
      return runFolderMutation(accountScopeId, [db.folder_memberships, db.folder_chat_references, db.folder_sync_states], async () => {
        const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
        const active = memberships
        const reference = await db.folder_chat_references.get([accountScopeId, chatId])
        if (!active.length && !reference) return

        const timestamp = now()
        if (active.length) {
          await db.folder_memberships.bulkDelete(active.map((row) => row.id))
          await this.markOrganizationChanged(accountScopeId, deviceId)
        }
        if (reference) {
          await db.folder_chat_references.delete([accountScopeId, chatId])
          await this.markOrganizationChanged(accountScopeId, deviceId)
        }
      })
    }
    if (protectionSnapshotId) {
      const protection = await db.folder_snapshots.get(protectionSnapshotId)
      if (!protection || protection.accountScopeId !== accountScopeId || !(protection.reasons ?? [protection.reason]).includes('before-delete')) {
        throw new Error('Protection snapshot is unavailable')
      }
      return remove()
    } else {
      return this.withProtection(accountScopeId, 'before-delete', remove)
    }
  }

  async exportAccountData(accountScopeId: string): Promise<FolderExportPayload> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return db.transaction('r', db.folders, db.folder_memberships, db.folder_chat_references, async () => ({
      schemaVersion: 1,
      accountScopeId,
      data: toFolderOrganizationData(await this.rawAccountData(accountScopeId)),
      exportedAt: now(),
    }))
  }

  async getAccountDataWithRevision(accountScopeId: string): Promise<FolderDataSnapshot> {
    requireScope(accountScopeId)
    return db.transaction('r', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states, db.folder_recovery_states], async () => {
      const data = await this.rawAccountData(accountScopeId)
      const state = await db.folder_sync_states.get(accountScopeId)
      const recovery = await db.folder_recovery_states.get(accountScopeId)
      return { data, dataRevision: state?.localDataRevision ?? 'uninitialized', pendingRevision: recovery?.pendingRevision }
    })
  }

  async createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason'], hold = false, captured?: FolderDataSnapshot): Promise<FolderSnapshotRow> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const capture = captured ?? await this.getAccountDataWithRevision(accountScopeId)
    if (capture.data.accountScopeId !== accountScopeId) throw new Error('Snapshot belongs to a different account scope')
    try {
      const snapshot = await saveFolderSnapshot({ accountScopeId, data: toFolderOrganizationData(capture.data) }, capture.dataRevision, reason, this.recoveryOptions, hold, capture.pendingRevision)
      clearRecoveryFailure(accountScopeId, capture.pendingRevision)
      return snapshot
    } catch (error) {
      if (reason === 'automatic') rememberRecoveryFailure(accountScopeId, classifyRecoveryFailure(error), capture.pendingRevision)
      try { await recordRecoveryFailure(accountScopeId, error, reason, capture.pendingRevision) } catch (statusError) {
        logDevError('[Folders]', 'recovery.failure-status-write-failed', statusError, { accountScopeId })
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

  private async withProtection<T>(
    accountScopeId: string, reason: FolderSnapshotRow['reason'], action: () => Promise<T>, targetId?: string,
  ): Promise<T> {
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
      return await action()
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
  ): Promise<FolderMutationResult<void>> {
    const data = fromFolderOrganizationData(accountScopeId, payload.data)
    return runFolderMutation(accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_sync_states], async () => {
      const existingFolders = await db.folders.bulkGet(data.folders.map((folder) => folder.id))
      const existingMemberships = await db.folder_memberships.bulkGet(data.memberships.map((membership) => membership.id))
      if ([...existingFolders, ...existingMemberships].some((row) => row && row.accountScopeId !== accountScopeId)) {
        throw new Error('Backup record belongs to a different account scope')
      }
      const currentSettings = await this.ensureSettings(accountScopeId)

      await db.folders.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
      await db.folders.bulkPut(data.folders)
      await db.folder_memberships.bulkPut(data.memberships)
      await db.folder_chat_references.bulkPut(data.chatReferences)
      const liveIds = new Set(data.folders.map((folder) => folder.id))
      await db.folder_settings.put({ ...currentSettings, collapsedFolderIds: currentSettings.collapsedFolderIds.filter((id) => liveIds.has(id)) })
      await this.markOrganizationChanged(accountScopeId, deviceId)
    })
  }

  async importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderExportPayload(payload)
    if (parsed.accountScopeId !== accountScopeId) throw new Error('Backup belongs to a different account scope')
    return this.withProtection(accountScopeId, 'before-import', () =>
      this.replaceAccountData(accountScopeId, parsed, 'snapshot.restore', deviceId))
  }

  async restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const snapshot = await db.folder_snapshots.get(snapshotId)
    if (!snapshot || snapshot.accountScopeId !== accountScopeId) throw new Error('Snapshot is unavailable')
    if (await sha256Hex(snapshot.compressedPayload) !== snapshot.contentHash) {
      throw new Error('Snapshot integrity check failed')
    }
    const payload: FolderExportPayload = {
      schemaVersion: 1,
      accountScopeId,
      exportedAt: snapshot.updatedAt ?? snapshot.createdAt,
      data: parseFolderOrganizationData(decodeLzStringBase64<unknown>(snapshot.compressedPayload)),
    }
    return this.withProtection(accountScopeId, 'before-restore', () =>
      this.replaceAccountData(accountScopeId, payload, 'snapshot.restore', deviceId), snapshotId)
  }

  async getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return await db.folder_sync_states.get(accountScopeId)
  }

  async listBrowserSyncWakeScopes(): Promise<string[]> {
    const [states, publications] = await Promise.all([db.folder_sync_states.toArray(), db.folder_sync_publications.toArray()])
    const pendingScopes = new Set(publications.map((row) => row.accountScopeId))
    return states.filter((state) => state.provider === 'browser-sync'
      && (state.dirty || !state.baseSnapshotId || pendingScopes.has(state.accountScopeId) || !!state.retryAt))
      .map((state) => state.accountScopeId)
  }

  async hasPendingChanges(accountScopeId: string): Promise<boolean> {
    requireScope(accountScopeId)
    return !!(await db.folder_sync_states.get(accountScopeId))?.dirty
  }

  async getBrowserSyncConflict(accountScopeId: string): Promise<FolderSyncConflictRow | undefined> {
    requireScope(accountScopeId)
    return db.folder_sync_conflicts.get(accountScopeId)
  }

  async recordBrowserSyncConflict(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string): Promise<boolean> {
    requireScope(accountScopeId)
    const data = parseFolderAccountData(payload)
    if (data.accountScopeId !== accountScopeId || manifest.accountScopeId !== accountScopeId) throw new Error('Conflict account scope does not match')
    return db.transaction('rw', [db.folder_sync_states, db.folder_sync_conflicts, db.folder_sync_publications], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision) return false
      const previous = await db.folder_sync_conflicts.get(accountScopeId)
      if (stableStringify(previous?.manifest) !== stableStringify(manifest) || previous?.localRevision !== expectedRevision) {
        await db.folder_sync_conflicts.put({ accountScopeId, manifest, data: toFolderSyncData(data), localRevision: expectedRevision, createdAt: now() })
      }
      await db.folder_sync_publications.delete(accountScopeId)
      await db.folder_sync_states.update(accountScopeId, { retryAt: undefined, lastErrorCode: undefined, browserSyncWarning: undefined })
      return true
    })
  }

  async selectLocalConflictVersion(accountScopeId: string, expectedRevision: string, snapshotId: string): Promise<boolean> {
    requireScope(accountScopeId)
    return db.transaction('rw', [db.folder_sync_states, db.folder_sync_conflicts, db.folder_sync_publications], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      const candidate = await db.folder_sync_conflicts.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision || candidate?.manifest.snapshotId !== snapshotId
        || candidate.localRevision !== expectedRevision) return false
      await db.folder_sync_states.update(accountScopeId, { baseSnapshotId: snapshotId, dirty: true, updatedAt: now() })
      await db.folder_sync_publications.delete(accountScopeId)
      await db.folder_sync_conflicts.delete(accountScopeId)
      return true
    })
  }

  async applyBrowserSyncSnapshot(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, resolving = false): Promise<boolean> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderAccountData(payload)
    if (parsed.accountScopeId !== accountScopeId || manifest.accountScopeId !== accountScopeId) throw new Error('Browser Sync account scope does not match')
    const captured = await this.getAccountDataWithRevision(accountScopeId)
    if (captured.dataRevision !== expectedRevision) return false
    const organizationChanged = stableStringify(toFolderOrganizationData(captured.data)) !== stableStringify(toFolderOrganizationData(parsed))
    let protection: FolderSnapshotRow | undefined
    try {
      if (organizationChanged) {
        try { protection = await this.createSnapshot(accountScopeId, 'before-sync', true, captured) }
        catch (error) { throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error }) }
      }
      return await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings,
        db.folder_sync_states, db.folder_recovery_states, db.folder_sync_conflicts, db.folder_sync_publications], async () => {
        const prior = await db.folder_sync_states.get(accountScopeId)
        if ((prior?.localDataRevision ?? 'uninitialized') !== expectedRevision || (prior?.dirty && !resolving)) return false
        if (resolving) {
          const candidate = await db.folder_sync_conflicts.get(accountScopeId)
          if (candidate?.manifest.snapshotId !== manifest.snapshotId || candidate.localRevision !== expectedRevision) return false
        }
        const existingFolders = await db.folders.bulkGet(parsed.folders.map((row) => row.id))
        const existingMemberships = await db.folder_memberships.bulkGet(parsed.memberships.map((row) => row.id))
        if ([...existingFolders, ...existingMemberships].some((row) => row && row.accountScopeId !== accountScopeId)) throw new Error('Browser Sync folder belongs to a different account')
        await db.folders.where('accountScopeId').equals(accountScopeId).delete()
        await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
        await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
        await db.folders.bulkPut(parsed.folders)
        await db.folder_memberships.bulkPut(parsed.memberships)
        await db.folder_chat_references.bulkPut(parsed.chatReferences)
        const settings = await this.ensureSettings(accountScopeId)
        const folderIds = new Set(parsed.folders.map((row) => row.id))
        await db.folder_settings.put({ ...settings, ...folderSyncSettingsSchema.parse(manifest.settings),
          collapsedFolderIds: settings.collapsedFolderIds.filter((id) => folderIds.has(id)), updatedAt: now() })
        const revision = `${deviceId}:${nanoid()}`
        await db.folder_sync_states.put({ ...prior, accountScopeId, deviceId, provider: 'browser-sync',
          localDataRevision: revision, baseSnapshotId: manifest.snapshotId, dirty: false, retryAt: undefined,
          retryCount: 0, lastErrorCode: undefined, browserSyncWarning: undefined, incompleteReplicaSince: undefined, updatedAt: now() })
        await db.folder_sync_publications.delete(accountScopeId)
        await db.folder_sync_conflicts.delete(accountScopeId)
        if (organizationChanged) await markRecoveryPending(accountScopeId, revision)
        return true
      })
    } finally {
      if (protection?.protectionToken) {
        try { await this.releaseSnapshot(accountScopeId, protection.id, protection.protectionToken) }
        catch (error) { logDevError('[Folders]', 'recovery.protection-release-failed', error) }
      }
    }
  }

  async recordBrowserSyncHealthy(accountScopeId: string, snapshotId: string, expectedRevision: string): Promise<boolean> {
    requireScope(accountScopeId)
    return db.transaction('rw', db.folder_sync_states, async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision || state.baseSnapshotId !== snapshotId) return false
      if (!state.lastErrorCode && !state.retryAt && !state.browserSyncWarning && !state.incompleteReplicaSince) return false
      await db.folder_sync_states.update(accountScopeId, { retryAt: undefined, retryCount: 0, lastErrorCode: undefined,
        browserSyncWarning: undefined, incompleteReplicaSince: undefined })
      return true
    })
  }

  async recordBrowserSyncFailure(
    accountScopeId: string,
    errorCode: string,
    warning: FolderSyncStateRow['browserSyncWarning'] = 'write-failed',
    projectedUsage?: BrowserSyncUsage,
  ): Promise<string | undefined> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    const attemptedAt = now()
    const retryCount = warning === 'unsupported-schema-version' ? 0 : Math.min((state.retryCount ?? 0) + 1, 6)
    const retryAt = warning === 'unsupported-schema-version' ? undefined
      : new Date(Date.now() + Math.min(30, 2 ** (retryCount - 1)) * 60_000).toISOString()
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

  async getBrowserSyncPublication(accountScopeId: string): Promise<FolderSyncPublicationRow | undefined> {
    requireScope(accountScopeId)
    return db.folder_sync_publications.get(accountScopeId)
  }

  async prepareBrowserSyncRecreation(accountScopeId: string, request: BrowserSyncRecreationRequest): Promise<boolean> {
    requireScope(accountScopeId)
    return db.transaction('rw', [db.folder_sync_states, db.folder_sync_publications, db.folder_sync_conflicts], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      const pending = await db.folder_sync_publications.get(accountScopeId)
      if (!state || state.provider !== 'browser-sync' || state.localDataRevision !== request.expectedRevision
        || state.baseSnapshotId !== request.baseSnapshotId || pending?.state === 'writing'
        || await db.folder_sync_conflicts.get(accountScopeId)) return false
      // Only explicit user intent may abandon a missing base. Keep all business
      // data and mark durable pending work, so a failed publication can resume.
      await db.folder_sync_states.update(accountScopeId, { baseSnapshotId: undefined, dirty: true,
        retryAt: undefined, retryCount: 0, lastErrorCode: undefined, browserSyncWarning: undefined })
      await db.folder_sync_publications.delete(accountScopeId)
      return true
    })
  }

  async getOrCreateBrowserSyncPublication(accountScopeId: string): Promise<FolderSyncPublicationRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    await this.getSettings(accountScopeId)
    await this.ensureSyncState(accountScopeId, deviceId)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const captured = await db.transaction('r', [db.folders, db.folder_memberships, db.folder_chat_references,
        db.folder_settings, db.folder_sync_states, db.folder_sync_publications, db.folder_sync_conflicts], async () => {
        if (await db.folder_sync_conflicts.get(accountScopeId)) throw new Error('Browser Sync conflict requires resolution')
        const state = (await db.folder_sync_states.get(accountScopeId))!
        const pending = await db.folder_sync_publications.get(accountScopeId)
        const settings = (await db.folder_settings.get(accountScopeId))!
        return { state, pending, settings, data: await this.rawAccountData(accountScopeId) }
      })
      // An interrupted write must finish its exact snapshot before newer edits are captured.
      if (captured.pending && (captured.pending.state === 'writing' || captured.pending.dataRevision === captured.state.localDataRevision)) {
        if (await sha256Hex(captured.pending.payload) !== captured.pending.payloadHash) throw new Error('Invalid pending publication hash')
        fromFolderSyncData(accountScopeId, parseFolderSyncData(decodeLzStringBase64(captured.pending.payload)))
        return captured.pending
      }
      // Compression and hashing stay outside the IndexedDB write transaction.
      const payload = encodeLzStringBase64(toFolderSyncData(captured.data))
      const publication: FolderSyncPublicationRow = {
        accountScopeId, id: nanoid(), baseSnapshotId: captured.state.baseSnapshotId,
        dataRevision: captured.state.localDataRevision, payload, payloadHash: await sha256Hex(payload),
        settings: { enabled: captured.settings.enabled, hideOrganizedChats: captured.settings.hideOrganizedChats },
        createdAt: now(), state: 'prepared',
      }
      const saved = await db.transaction('rw', [db.folder_sync_states, db.folder_sync_publications, db.folder_sync_conflicts], async () => {
        const state = await db.folder_sync_states.get(accountScopeId)
        if (state?.localDataRevision !== captured.state.localDataRevision || await db.folder_sync_conflicts.get(accountScopeId)) return false
        await db.folder_sync_publications.put(publication)
        return true
      })
      if (saved) return publication
    }
    throw new Error('STALE_REVISION')
  }

  async markBrowserSyncPublicationWriting(accountScopeId: string, snapshotId: string): Promise<void> {
    requireScope(accountScopeId)
    await db.transaction('rw', db.folder_sync_publications, async () => {
      const pending = await db.folder_sync_publications.get(accountScopeId)
      if (pending?.id !== snapshotId) throw new Error('Pending Browser Sync publication changed')
      await db.folder_sync_publications.update(accountScopeId, { state: 'writing' })
    })
  }

  async markBrowserSyncPublicationAccepted(accountScopeId: string, snapshotId: string, usage: BrowserSyncUsage): Promise<void> {
    requireScope(accountScopeId)
    await db.transaction('rw', [db.folder_sync_states, db.folder_sync_publications], async () => {
      const pending = await db.folder_sync_publications.get(accountScopeId)
      const state = await db.folder_sync_states.get(accountScopeId)
      if (pending?.id !== snapshotId || !state) throw new Error('Pending Browser Sync publication changed')
      await db.folder_sync_states.put({ ...state, ...currentUsagePatch(state, usage), baseSnapshotId: snapshotId,
        dirty: pending.dataRevision !== state.localDataRevision, lastBrowserStorageWriteAt: now(), lastAttemptAt: now(),
        retryAt: undefined, retryCount: 0, lastErrorCode: undefined, browserSyncWarning: undefined,
        browserSyncProjectedUsageBytes: undefined, browserSyncProjectedTotalBytes: undefined,
        incompleteReplicaSince: undefined, updatedAt: now() })
      await db.folder_sync_publications.delete(accountScopeId)
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
        throw new FolderCoordinatorLeaseBusyError(existing.expiresAt)
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
