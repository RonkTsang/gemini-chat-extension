import Dexie from 'dexie'
import { indexFolder, indexMembership, folderNameKey, membershipDisplayOrderKey } from '@/domain/folder/local-indexes'
import { changeFolderChatCount, hasValidChatMembership, rebuildFolderSummary } from '../folder-summary'
import { indexedOrderKey, orderRange } from './folder-order'
import { toSnapshotSummary } from '@/domain/folder/snapshot'
import { beginFolderAccess } from '../folder-access'
import { nanoid } from 'nanoid'
import { runtimeFolderDeviceIdProvider, type FolderDeviceIdProvider } from '@/services/folder-data/device-id'
export type { FolderDeviceIdProvider } from '@/services/folder-data/device-id'

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
import { compareAscii, keyBetween } from '@/domain/folder/order-key'
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
  type FolderBrowserSyncCapture,
  type FolderMutationResult,
  type FolderExportPayload,
  type FolderMembershipRow,
  type FolderProjection,
  type FolderRow,
  type FolderSettingsRow,
  type FolderSnapshotRow,
  type FolderSnapshotSummary,
  type FolderSyncPublicationRow,
  type FolderSyncConflictRow,
  type BrowserSyncManifest,
  type FolderAccountData,
  type FolderSyncSettings,
  type FolderSyncStateRow,
} from '@/domain/folder/types'
import { fromFolderSyncData, stableStringify, toFolderSyncData } from '@/services/folder-sync/codec'
import { decodeGzipBase64, encodeGzipBase64, fromFolderOrganizationData, sha256Hex, toFolderOrganizationData } from '@/services/folder-data/codec'
import { logDevError, logDevEvent } from '@/utils/devLogger'

import { readFolderSnapshot, saveFolderSnapshot, recordRecoveryFailure } from '@/services/folder-recovery/snapshots'
import { clearRecoveryFailure, rememberRecoveryFailure } from '@/services/folder-recovery/failure-fallback'
import { classifyRecoveryFailure, FolderRecoveryError, newestSnapshots, SNAPSHOT_PROTECTION_TTL_MS, type FolderRecoveryOptions } from '@/services/folder-recovery/storage'

// The first retry is scheduled after one minute. Do not surface a replica that
// is merely between the manifest and chunk writes until that recovery window
// has elapsed.
const INCOMPLETE_REPLICA_WARNING_GRACE_MS = 60_000

type BrowserSyncView = Pick<FolderBrowserSyncCapture, 'state' | 'settings' | 'publication' | 'hasConflict'>
const browserSyncViewTables = [db.folder_settings, db.folder_sync_states, db.folder_sync_publications, db.folder_sync_conflicts]

/** Compare only fields that can change a Sync decision, not usage or retry timestamps. */
function sameBrowserSyncView(left: BrowserSyncView, right: BrowserSyncView): boolean {
  return left.state.localDataRevision === right.state.localDataRevision
    && left.state.baseSnapshotId === right.state.baseSnapshotId && left.state.dirty === right.state.dirty
    && left.state.provider === right.state.provider
    && stableStringify(left.state.conflictSummary) === stableStringify(right.state.conflictSummary)
    && left.settings.enabled === right.settings.enabled && left.settings.hideOrganizedChats === right.settings.hideOrganizedChats
    && left.publication?.id === right.publication?.id && left.publication?.state === right.publication?.state
    && left.publication?.payloadHash === right.publication?.payloadHash && left.hasConflict === right.hasConflict
}

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

export class FolderCoordinatorLeaseBusyError extends Error {
  constructor(readonly retryAt: string) {
    super('Folder sync coordinator lease is held by another context')
  }
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
  promoteChat(accountScopeId: string, chatId: string): Promise<FolderMutationResult<string[]>>
  setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMutationResult<FolderMembershipRow>>
  removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<FolderMutationResult<void>>
  upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string, expectedRevision?: string): Promise<FolderMutationResult<ChatReferenceRow>>
  removeChatReference(accountScopeId: string, chatId: string): Promise<FolderMutationResult<void>>
  removeChatAfterGeminiDelete(accountScopeId: string, chatId: string, protectionSnapshotId?: string): Promise<FolderMutationResult<void>>
  createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason'], hold?: boolean, captured?: FolderDataSnapshot): Promise<FolderSnapshotRow>
  releaseSnapshot(accountScopeId: string, snapshotId: string, protectionToken: string): Promise<void>
  listSnapshots(accountScopeId: string): Promise<FolderSnapshotSummary[]>
  restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<FolderMutationResult<void>>
  exportAccountData(accountScopeId: string): Promise<FolderExportPayload>
  importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<FolderMutationResult<void>>
  getAccountData(accountScopeId: string): Promise<FolderAccountData>
  getAccountDataWithRevision(accountScopeId: string): Promise<FolderDataSnapshot>
  captureBrowserSyncData(accountScopeId: string): Promise<FolderBrowserSyncCapture>
  getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined>
  listBrowserSyncWakeScopes(): Promise<string[]>
  hasPendingChanges(accountScopeId: string): Promise<boolean>
  applyBrowserSyncSnapshot(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, resolving?: boolean, captured?: FolderBrowserSyncCapture): Promise<boolean>
  recordBrowserSyncConflict(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, captured?: FolderBrowserSyncCapture): Promise<boolean>
  getBrowserSyncConflict(accountScopeId: string): Promise<FolderSyncConflictRow | undefined>
  selectLocalConflictVersion(accountScopeId: string, expectedRevision: string, snapshotId: string, captured?: FolderBrowserSyncCapture): Promise<boolean>
  recordBrowserSyncHealthy(accountScopeId: string, snapshotId: string, expectedRevision: string, captured?: FolderBrowserSyncCapture): Promise<boolean>
  recordBrowserSyncFailure(accountScopeId: string, errorCode: string, warning?: FolderSyncStateRow['browserSyncWarning'], projectedUsage?: BrowserSyncUsage): Promise<string | undefined>
  recordBrowserSyncUsage(accountScopeId: string, usage: BrowserSyncUsage): Promise<void>
  getOrCreateBrowserSyncPublication(accountScopeId: string, captured?: FolderBrowserSyncCapture): Promise<FolderSyncPublicationRow>
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

function normalizeTitle(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (normalized.length > 500) throw new Error('Chat title is too long')
  return normalized
}

function sortByOrder<T extends { id: string; orderKey: string }>(rows: T[]): T[] {
  return rows.sort((left, right) => compareAscii(left.orderKey, right.orderKey) || compareAscii(left.id, right.id))
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

  private async pruneChatReference(accountScopeId: string, chatId: string, folderExists?: Map<string, boolean>): Promise<boolean> {
    if (await hasValidChatMembership(Dexie.currentTransaction!, accountScopeId, chatId, folderExists)) return false
    await db.folder_chat_references.delete([accountScopeId, chatId])
    return true
  }

  private async changeChatCount(accountScopeId: string, delta: number): Promise<void> {
    await changeFolderChatCount(Dexie.currentTransaction!, accountScopeId, delta)
  }

  private async assertUniqueName(accountScopeId: string, name: string, excludeId?: string): Promise<void> {
    const ids = await db.folders.where('[accountScopeId+nameKey]').equals([accountScopeId, folderNameKey(name)]).limit(excludeId ? 2 : 1).primaryKeys()
    if (ids.some((id) => id !== excludeId)) throw new Error('Folder name already exists')
  }

  private async subtree(accountScopeId: string, folderId: string): Promise<Array<{ id: string; depth: number }>> {
    const result = [{ id: folderId, depth: 1 }]
    const seen = new Set([folderId])
    for (let index = 0; index < result.length; index += 1) {
      const parent = result[index]
      const ids = await db.folders.where('[accountScopeId+parentFolderId]').equals([accountScopeId, parent.id]).primaryKeys()
      for (const id of ids) {
        if (seen.has(id)) throw new Error('Folder tree contains a cycle')
        seen.add(id)
        result.push({ id, depth: parent.depth + 1 })
      }
    }
    return result
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
    accountScopeId: string, parentFolderId: string, position?: FolderPosition, excludeId?: string,
  ): Promise<string> {
    const [lower, upper] = orderRange(accountScopeId, parentFolderId)
    return indexedOrderKey({ table: db.folders, index: '[accountScopeId+parentFolderId+orderKey+id]', lower, upper,
      position, excludeId, key: (row) => row.orderKey,
      accepts: (row) => row.accountScopeId === accountScopeId && row.parentFolderId === parentFolderId,
      patch: (row, orderKey) => indexFolder({ ...row, orderKey, updatedAt: now() }) })
  }

  private async resolveMembershipOrderKey(
    accountScopeId: string, folderId: string, position?: FolderPosition, excludeId?: string, pinned = false,
    validatePinGroup = false,
  ): Promise<string> {
    const [lower, upper] = pinned
      ? [[accountScopeId, folderId, '0', Dexie.minKey], [accountScopeId, folderId, '1', Dexie.minKey]]
      : orderRange(accountScopeId, folderId)
    return indexedOrderKey({ table: db.folder_memberships,
      index: pinned ? '[accountScopeId+folderId+displayOrderKey+id]' : '[accountScopeId+folderId+orderKey+id]',
      lower, upper, position, excludeId, key: (row) => pinned ? row.pinnedOrderKey! : row.orderKey,
      indexKey: pinned ? membershipDisplayOrderKey : undefined,
      accepts: (row) => row.accountScopeId === accountScopeId && row.folderId === folderId,
      anchorAccepts: validatePinGroup ? (row) => !!row.pinnedOrderKey === pinned : undefined,
      patch: (row, orderKey) => indexMembership({ ...row, ...(pinned ? { pinnedOrderKey: orderKey } : { orderKey }), updatedAt: now() }) })
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
    return runFolderMutation('updateSettings', accountScopeId, [db.folder_settings], async () => {
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
    return runFolderMutation('createFolder', accountScopeId, [db.folders, db.folder_sync_states], async () => {
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
      await this.assertUniqueName(accountScopeId, name)

      const timestamp = now()
      result = {
        id: nanoid(),
        accountScopeId,
        parentFolderId,
        name,
        iconKey: requireFolderIconKey(input.iconKey ?? DEFAULT_FOLDER_ICON_KEY),
        colorValue: requireFolderColorValue(input.colorValue ?? DEFAULT_FOLDER_COLOR_VALUE),
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, input),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      result = indexFolder(result)
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
    return runFolderMutation('createFolderAndAddChat', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states, db.folder_organization_summaries], async () => {
      if (parentFolderId !== ROOT_FOLDER_ID) throw new Error('P0 only supports root Folders')
      await this.assertUniqueName(accountScopeId, name)
      const timestamp = now()

      folder = {
        id: nanoid(), accountScopeId, parentFolderId, name,
        iconKey: requireFolderIconKey(input.iconKey ?? DEFAULT_FOLDER_ICON_KEY),
        colorValue: requireFolderColorValue(input.colorValue ?? DEFAULT_FOLDER_COLOR_VALUE),
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, input),
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
      folder = indexFolder(folder)
      membership = indexMembership(membership)
      await db.folders.put(folder)
      const alreadyOrganized = await hasValidChatMembership(Dexie.currentTransaction!, accountScopeId, chatId)
      await db.folder_memberships.put(membership)
      if (!alreadyOrganized) await this.changeChatCount(accountScopeId, 1)
      await db.folder_chat_references.put(reference)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return { folder, membership }
    })
  }

  async updateFolder(accountScopeId: string, folderId: string, patch: FolderUpdateInput): Promise<FolderMutationResult<FolderRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    return runFolderMutation('updateFolder', accountScopeId, [db.folders, db.folder_sync_states], async () => {
      if (patch.expectedRevision && (await db.folder_sync_states.get(accountScopeId))?.localDataRevision !== patch.expectedRevision) throw new Error('STALE_REVISION')
      const prior = await db.folders.get(folderId)
      if (!prior || prior.accountScopeId !== accountScopeId) throw new Error('Folder is unavailable')
      const name = patch.name === undefined ? prior.name : normalizeFolderName(patch.name)
      if (name !== prior.name) await this.assertUniqueName(accountScopeId, name, folderId)
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
      result = indexFolder(result)
      await db.folders.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async moveFolder(accountScopeId: string, folderId: string, parentFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderRow
    return runFolderMutation('moveFolder', accountScopeId, [db.folders, db.folder_sync_states], async () => {
      const moving = await db.folders.get(folderId)
      if (!moving || moving.accountScopeId !== accountScopeId) throw new Error('Folder is unavailable')
      if (moving.parentFolderId !== parentFolderId) {
        let depth = 1
        let cursor = parentFolderId
        const seen = new Set<string>()
        while (cursor !== ROOT_FOLDER_ID) {
          if (cursor === folderId) throw new Error('A folder cannot become its own descendant')
          if (seen.has(cursor)) throw new Error('Folder tree contains a cycle')
          seen.add(cursor)
          const parent = await db.folders.get(cursor)
          if (!parent || parent.accountScopeId !== accountScopeId) throw new Error('Parent folder is unavailable')
          cursor = parent.parentFolderId
          depth += 1
          if (depth > 32) throw new Error('Folder depth exceeds the supported limit')
        }
        const subtree = await this.subtree(accountScopeId, folderId)
        if (subtree.some((row) => depth + row.depth - 1 > 32)) throw new Error('Folder depth exceeds the supported limit')
      }

      result = {
        ...moving,
        parentFolderId,
        orderKey: await this.resolveFolderOrderKey(accountScopeId, parentFolderId, position, moving.id),
        updatedAt: now(),
      }
      result = indexFolder(result)
      await db.folders.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async deleteFolder(accountScopeId: string, folderId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const target = await db.folders.get(folderId)
    if (!target || target.accountScopeId !== accountScopeId) return runFolderMutation('deleteFolder', accountScopeId, [], async () => undefined)
    return this.withProtection(accountScopeId, 'before-delete', async () => {
      return runFolderMutation('deleteFolder', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_sync_states, db.folder_organization_summaries], async () => {
        const current = await db.folders.get(folderId)
        if (!current || current.accountScopeId !== accountScopeId) return
        const descendants = new Set((await this.subtree(accountScopeId, folderId)).map((row) => row.id))
        const affectedChats = new Set<string>()
        for (const id of descendants) {
          const memberships = await db.folder_memberships.where('[accountScopeId+folderId]').equals([accountScopeId, id]).toArray()
          for (const row of memberships) affectedChats.add(row.chatId)
          await db.folder_memberships.bulkDelete(memberships.map((row) => row.id))
        }
        await db.folders.bulkDelete([...descendants])
        let removedChats = 0
        // Shared chats often point to the same surviving Folder. This map lives only for this deletion.
        const folderExists = new Map<string, boolean>()
        for (const chatId of affectedChats) {
          if (await this.pruneChatReference(accountScopeId, chatId, folderExists)) removedChats += 1
        }
        await this.changeChatCount(accountScopeId, -removedChats)
        const timestamp = now()
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
    requireScope(accountScopeId)
    if (!input.chatId.trim()) throw new Error('A chat id is required')
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    return runFolderMutation('upsertMembership', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states, db.folder_organization_summaries], async () => {
      const folder = await db.folders.get(input.folderId)
      if (!folder || folder.accountScopeId !== accountScopeId) throw new Error('Folder is unavailable')
      const id = membershipId(accountScopeId, input.folderId, input.chatId)
      const prior = await db.folder_memberships.get(id)
      if (prior && (prior.accountScopeId !== accountScopeId || prior.folderId !== input.folderId || prior.chatId !== input.chatId)) {
        throw new Error('Membership is unavailable')
      }
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
        }
        result = prior
        return result
      }

      const timestamp = now()
      result = {
        id,
        accountScopeId,
        folderId: input.folderId,
        chatId: input.chatId,
        orderKey: await this.resolveMembershipOrderKey(accountScopeId, input.folderId, input),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      result = indexMembership(result)
      const alreadyOrganized = await hasValidChatMembership(Dexie.currentTransaction!, accountScopeId, input.chatId)
      await db.folder_memberships.put(result)
      if (!alreadyOrganized) await this.changeChatCount(accountScopeId, 1)
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
      return result
    })
  }

  async moveMembership(accountScopeId: string, folderId: string, chatId: string, targetFolderId: string, position?: FolderPosition): Promise<FolderMutationResult<FolderMembershipRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    return runFolderMutation('moveMembership', accountScopeId, [db.folders, db.folder_memberships, db.folder_sync_states], async () => {
      const sourceId = membershipId(accountScopeId, folderId, chatId)
      const prior = await db.folder_memberships.get(sourceId)
      const target = await db.folders.get(targetFolderId)
      const source = folderId === targetFolderId ? target : await db.folders.get(folderId)
      if (!prior || prior.accountScopeId !== accountScopeId || prior.folderId !== folderId || prior.chatId !== chatId
        || !source || source.accountScopeId !== accountScopeId || !target || target.accountScopeId !== accountScopeId) {
        throw new Error('Membership or target folder is unavailable')
      }
      const targetId = membershipId(accountScopeId, targetFolderId, chatId)
      const existingTarget = targetId === sourceId ? prior : await db.folder_memberships.get(targetId)
      if (existingTarget && targetId !== sourceId) throw new Error('Chat already belongs to the target folder')
      const sameFolder = sourceId === targetId
      const pinned = sameFolder && Boolean(prior.pinnedOrderKey)
      const orderKey = await this.resolveMembershipOrderKey(accountScopeId, targetFolderId, position, sourceId, pinned, true)

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
      result = indexMembership(result)
      await db.folder_memberships.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async promoteChat(accountScopeId: string, chatId: string): Promise<FolderMutationResult<string[]>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const result = await runFolderMutation('promoteChat', accountScopeId, [db.folders, db.folder_memberships], async () => {
      const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
      const folderIds: string[] = []
      for (const row of memberships) {
        const folder = await db.folders.get(row.folderId)
        if (!folder || folder.accountScopeId !== accountScopeId) continue
        const pinned = Boolean(row.pinnedOrderKey)
        const first = await db.folder_memberships.where('[accountScopeId+folderId+displayOrderKey+id]')
          .between([accountScopeId, row.folderId, pinned ? '0' : '1'], [accountScopeId, row.folderId, pinned ? '1' : '2'], false, false).first()
        if (!first || first.id === row.id) continue
        const orderKey = await this.resolveMembershipOrderKey(accountScopeId, row.folderId, { beforeId: first.id }, row.id, pinned, true)
        await db.folder_memberships.put(indexMembership({
          ...row, ...(pinned ? { pinnedOrderKey: orderKey } : { orderKey }), updatedAt: now(),
        }))
        folderIds.push(row.folderId)
      }
      if (folderIds.length) await this.markOrganizationChanged(accountScopeId, deviceId)
      return folderIds
    })
    return { ...result, commit: { ...result.commit, affected: result.data.length > 1000 ? { all: true } : { folderIds: result.data } } }
  }

  async setMembershipPinned(accountScopeId: string, folderId: string, chatId: string, pinned: boolean): Promise<FolderMutationResult<FolderMembershipRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    let result!: FolderMembershipRow
    return runFolderMutation('setMembershipPinned', accountScopeId, [db.folders, db.folder_memberships, db.folder_sync_states], async () => {
      const prior = await db.folder_memberships.get(membershipId(accountScopeId, folderId, chatId))
      const folder = await db.folders.get(folderId)
      if (!prior || prior.accountScopeId !== accountScopeId || prior.folderId !== folderId || prior.chatId !== chatId
        || !folder || folder.accountScopeId !== accountScopeId) {
        throw new Error('Membership or folder is unavailable')
      }
      if (Boolean(prior.pinnedOrderKey) === pinned) {
        result = prior
        return result
      }
      const pinnedOrderKey = pinned
        ? await this.resolveMembershipOrderKey(accountScopeId, folderId, undefined, undefined, true)
        : undefined

      result = { ...prior, pinnedOrderKey, updatedAt: now() }
      result = indexMembership(result)
      await db.folder_memberships.put(result)
      await this.markOrganizationChanged(accountScopeId, deviceId)
      return result
    })
  }

  async removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<FolderMutationResult<void>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    return runFolderMutation('removeMembership', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_organization_summaries], async () => {
      const id = membershipId(accountScopeId, folderId, chatId)
      const prior = await db.folder_memberships.get(id)
      if (!prior) return
      if (prior.accountScopeId !== accountScopeId || prior.folderId !== folderId || prior.chatId !== chatId) throw new Error('Membership is unavailable')
      const folder = await db.folders.get(folderId)
      await db.folder_memberships.delete(id)
      const noMembershipsRemain = await this.pruneChatReference(accountScopeId, chatId)
      if (folder?.accountScopeId === accountScopeId && noMembershipsRemain) await this.changeChatCount(accountScopeId, -1)
      await this.markOrganizationChanged(accountScopeId, deviceId)
    })
  }

  async upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string, expectedTitle?: string, expectedRevision?: string): Promise<FolderMutationResult<ChatReferenceRow>> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    if (!chatId.trim()) throw new Error('A chat id is required')
    let result!: ChatReferenceRow
    return runFolderMutation('upsertChatReference', accountScopeId, [db.folder_chat_references, db.folder_sync_states], async () => {
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
    return runFolderMutation('removeChatReference', accountScopeId, [db.folder_memberships, db.folder_chat_references, db.folder_sync_states], async () => {
      const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).limit(1).primaryKeys()
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
      const folderIds = new Set<string>()
      const result = await runFolderMutation('removeChatAfterGeminiDelete', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states, db.folder_organization_summaries], async () => {
        const memberships = await db.folder_memberships.where('[accountScopeId+chatId]').equals([accountScopeId, chatId]).toArray()
        for (const membership of memberships) folderIds.add(membership.folderId)
        const active = memberships
        const reference = await db.folder_chat_references.get([accountScopeId, chatId])
        if (!active.length && !reference) return

        if (active.length) {
          const wasOrganized = await hasValidChatMembership(Dexie.currentTransaction!, accountScopeId, chatId)
          await db.folder_memberships.bulkDelete(active.map((row) => row.id))
          if (wasOrganized) await this.changeChatCount(accountScopeId, -1)
        }
        if (reference) await db.folder_chat_references.delete([accountScopeId, chatId])
        await this.markOrganizationChanged(accountScopeId, deviceId)
      })
      return { ...result, commit: { ...result.commit, affected: folderIds.size > 1000 ? { all: true as const } : { folderIds: [...folderIds], chatIds: [chatId] } } }
    }
    if (protectionSnapshotId) {
      const protection = await db.folder_snapshots.get(protectionSnapshotId)
      if (!protection || protection.accountScopeId !== accountScopeId || protection.validationState !== 'valid' || !(protection.reasons ?? [protection.reason]).includes('before-delete')) {
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
    return db.transaction('r', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_sync_states, db.folder_recovery_states], async (transaction) => {
      const finish = import.meta.env.DEV ? beginFolderAccess(transaction, { operation: 'getAccountDataWithRevision', phase: 'full-capture', accountScopeId }) : undefined
      let result: 'success' | 'failed' = 'failed'
      let capturedRevision: string | undefined
      try {
        const data = await this.rawAccountData(accountScopeId)
        const state = await db.folder_sync_states.get(accountScopeId)
        const recovery = await db.folder_recovery_states.get(accountScopeId)
        if (import.meta.env.DEV) capturedRevision = state?.localDataRevision ?? 'uninitialized'
        if (import.meta.env.DEV) result = 'success'
        return { data, dataRevision: state?.localDataRevision ?? 'uninitialized', pendingRevision: recovery?.pendingRevision }
      } finally { if (import.meta.env.DEV) finish?.(result, { capturedRevision }) }
    })
  }

  /** Caller owns a transaction covering browserSyncViewTables. No organization or conflict body reads. */
  private async readBrowserSyncView(accountScopeId: string): Promise<BrowserSyncView> {
    const state = await db.folder_sync_states.get(accountScopeId)
    const settings = await db.folder_settings.get(accountScopeId)
    if (!state || !settings) throw new Error('STALE_REVISION')
    return { state, settings, publication: await db.folder_sync_publications.get(accountScopeId),
      hasConflict: !!await db.folder_sync_conflicts.where('accountScopeId').equals(accountScopeId).count() }
  }

  async captureBrowserSyncData(accountScopeId: string): Promise<FolderBrowserSyncCapture> {
    requireScope(accountScopeId)
    await this.getSettings(accountScopeId)
    return db.transaction('r', [...browserSyncViewTables, db.folders, db.folder_memberships, db.folder_chat_references, db.folder_recovery_states], async (transaction) => {
      const finish = import.meta.env.DEV ? beginFolderAccess(transaction, { operation: 'captureBrowserSyncData', phase: 'full-capture', accountScopeId }) : undefined
      let result: 'success' | 'failed' = 'failed'
      let capturedRevision: string | undefined
      try {
        const view = await this.readBrowserSyncView(accountScopeId)
        if (import.meta.env.DEV) capturedRevision = view.state.localDataRevision
        const data = await this.rawAccountData(accountScopeId)
        const recovery = await db.folder_recovery_states.get(accountScopeId)
        if (import.meta.env.DEV) result = 'success'
        return { ...view, data, dataRevision: view.state.localDataRevision, pendingRevision: recovery?.pendingRevision }
      } finally { if (import.meta.env.DEV) finish?.(result, { capturedRevision }) }
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
    await db.transaction('rw', db.folder_snapshots, async (transaction) => {
      if (import.meta.env.DEV) {
        const finish = beginFolderAccess(transaction, { operation: 'releaseSnapshot', phase: 'transaction', accountScopeId })
        transaction.on('complete', () => finish('success'))
        transaction.on('abort', () => finish('rollback'))
      }
      const row = await db.folder_snapshots.get(snapshotId)
      if (row?.accountScopeId === accountScopeId) {
        row.protectionLeases = (row.protectionLeases ?? []).filter((lease) => lease.token !== protectionToken && Date.parse(lease.expiresAt) > Date.now())
        row.protectedUntil = row.protectionLeases.map((lease) => lease.expiresAt).sort().at(-1)
        await db.folder_snapshots.put(row)
      }
    })
  }

  private async withProtection<T>(
    accountScopeId: string, reason: FolderSnapshotRow['reason'], action: (targetToken: string) => Promise<T>, targetId?: string,
  ): Promise<T> {
    const targetToken = nanoid()
    if (targetId) {
      try {
        await db.transaction('rw', db.folder_snapshots, async () => {
          const target = await db.folder_snapshots.get(targetId)
          if (!target || target.accountScopeId !== accountScopeId || target.validationState !== 'valid') throw new Error('Snapshot is unavailable')
          if ((target.protectionLeases?.filter((lease) => Date.parse(lease.expiresAt) > Date.now()).length ?? 0) >= 100) throw new FolderRecoveryError('SNAPSHOT_BUDGET_EXCEEDED')
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
      return await action(targetToken)
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

  async listSnapshots(accountScopeId: string): Promise<FolderSnapshotSummary[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return newestSnapshots(await db.folder_snapshots.where('accountScopeId').equals(accountScopeId).toArray()).map(toSnapshotSummary)
  }

  private async replaceAccountData(
    accountScopeId: string,
    payload: FolderExportPayload,
    operationType: 'snapshot.restore',
    deviceId: string,
    restorePoint?: { id: string; contentHash: string; token: string },
  ): Promise<FolderMutationResult<void>> {
    const data = fromFolderOrganizationData(accountScopeId, payload.data)
    return runFolderMutation('replaceAccountData', accountScopeId, [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_sync_states, db.folder_organization_summaries,
      ...(restorePoint ? [db.folder_snapshots] : [])], async () => {
      if (restorePoint) {
        const held = await db.folder_snapshots.get(restorePoint.id)
        if (held?.accountScopeId !== accountScopeId || held.contentHash !== restorePoint.contentHash
          || !held.protectionLeases?.some((lease) => lease.token === restorePoint.token && Date.parse(lease.expiresAt) > Date.now())) {
          throw new Error('Snapshot changed during restore')
        }
      }
      const existingFolders = await db.folders.bulkGet(data.folders.map((folder) => folder.id))
      const existingMemberships = await db.folder_memberships.bulkGet(data.memberships.map((membership) => membership.id))
      if ([...existingFolders, ...existingMemberships].some((row) => row && row.accountScopeId !== accountScopeId)) {
        throw new Error('Backup record belongs to a different account scope')
      }
      const currentSettings = await this.ensureSettings(accountScopeId)

      await db.folders.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
      await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
      await db.folders.bulkPut(data.folders.map(indexFolder))
      await db.folder_memberships.bulkPut(data.memberships.map(indexMembership))
      await rebuildFolderSummary(Dexie.currentTransaction!, data)
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
    return this.withProtection(accountScopeId, 'before-restore', async (targetToken) => {
      const { snapshot, data } = await readFolderSnapshot(accountScopeId, snapshotId)
      const payload: FolderExportPayload = {
        schemaVersion: 1, accountScopeId, exportedAt: snapshot.updatedAt ?? snapshot.createdAt,
        data,
      }
      return this.replaceAccountData(accountScopeId, payload, 'snapshot.restore', deviceId, { id: snapshotId, contentHash: snapshot.contentHash, token: targetToken })
    }, snapshotId)
  }

  async getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return await db.folder_sync_states.get(accountScopeId)
  }

  async listBrowserSyncWakeScopes(): Promise<string[]> {
    const [states, publications] = await Promise.all([db.folder_sync_states.toArray(), db.folder_sync_publications.toCollection().primaryKeys()])
    const pendingScopes = new Set(publications)
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

  async recordBrowserSyncConflict(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, captured?: FolderBrowserSyncCapture): Promise<boolean> {
    requireScope(accountScopeId)
    const data = parseFolderAccountData(payload)
    if (data.accountScopeId !== accountScopeId || manifest.accountScopeId !== accountScopeId) throw new Error('Conflict account scope does not match')
    return db.transaction('rw', [db.folder_sync_states, db.folder_sync_conflicts, db.folder_sync_publications, ...(captured ? [db.folder_settings] : [])], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision) return false
      if (captured && !sameBrowserSyncView(captured, await this.readBrowserSyncView(accountScopeId))) return false
      const previous = await db.folder_sync_conflicts.get(accountScopeId)
      if (stableStringify(previous?.manifest) !== stableStringify(manifest) || previous?.localRevision !== expectedRevision) {
        await db.folder_sync_conflicts.put({ accountScopeId, manifest, data: toFolderSyncData(data), localRevision: expectedRevision, createdAt: now() })
      }
      await db.folder_sync_publications.delete(accountScopeId)
      await db.folder_sync_states.update(accountScopeId, { retryAt: undefined, lastErrorCode: undefined, browserSyncWarning: undefined, conflictSummary: { snapshotId: manifest.snapshotId, localRevision: expectedRevision } })
      return true
    })
  }

  async selectLocalConflictVersion(accountScopeId: string, expectedRevision: string, snapshotId: string, captured?: FolderBrowserSyncCapture): Promise<boolean> {
    requireScope(accountScopeId)
    return db.transaction('rw', [db.folder_sync_states, db.folder_sync_conflicts, db.folder_sync_publications, ...(captured ? [db.folder_settings] : [])], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      const candidate = await db.folder_sync_conflicts.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision || candidate?.manifest.snapshotId !== snapshotId
        || candidate.localRevision !== expectedRevision) return false
      if (captured && !sameBrowserSyncView(captured, await this.readBrowserSyncView(accountScopeId))) return false
      await db.folder_sync_states.update(accountScopeId, { baseSnapshotId: snapshotId, dirty: true, conflictSummary: undefined, updatedAt: now() })
      await db.folder_sync_publications.delete(accountScopeId)
      await db.folder_sync_conflicts.delete(accountScopeId)
      return true
    })
  }

  async applyBrowserSyncSnapshot(accountScopeId: string, payload: FolderAccountData, manifest: BrowserSyncManifest, expectedRevision: string, resolving = false, supplied?: FolderBrowserSyncCapture): Promise<boolean> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderAccountData(payload)
    if (parsed.accountScopeId !== accountScopeId || manifest.accountScopeId !== accountScopeId) throw new Error('Browser Sync account scope does not match')
    const captured = supplied ?? await this.captureBrowserSyncData(accountScopeId)
    if (captured.data.accountScopeId !== accountScopeId) throw new Error('Capture belongs to a different account scope')
    if (captured.dataRevision !== expectedRevision || captured.state.provider !== 'browser-sync') return false
    const organizationChanged = stableStringify(toFolderOrganizationData(captured.data)) !== stableStringify(toFolderOrganizationData(parsed))
    let protection: FolderSnapshotRow | undefined
    try {
      if (organizationChanged) {
        try { protection = await this.createSnapshot(accountScopeId, 'before-sync', true, captured) }
        catch (error) { throw new FolderRecoveryError('SNAPSHOT_PROTECTION_FAILED', { cause: error }) }
      }
      return await db.transaction('rw', [db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings,
        db.folder_sync_states, db.folder_recovery_states, db.folder_sync_conflicts, db.folder_sync_publications, db.folder_organization_summaries], async () => {
        const current = await this.readBrowserSyncView(accountScopeId)
        if (!sameBrowserSyncView(captured, current)) return false
        const prior = current.state
        if ((prior?.localDataRevision ?? 'uninitialized') !== expectedRevision || (prior?.dirty && !resolving)) return false
        if (resolving) {
          const candidate = await db.folder_sync_conflicts.get(accountScopeId)
          if (stableStringify(candidate?.manifest) !== stableStringify(manifest) || candidate?.localRevision !== expectedRevision) return false
        } else if (current.hasConflict || current.publication?.state === 'writing') return false
        const existingFolders = await db.folders.bulkGet(parsed.folders.map((row) => row.id))
        const existingMemberships = await db.folder_memberships.bulkGet(parsed.memberships.map((row) => row.id))
        if ([...existingFolders, ...existingMemberships].some((row) => row && row.accountScopeId !== accountScopeId)) throw new Error('Browser Sync folder belongs to a different account')
        await db.folders.where('accountScopeId').equals(accountScopeId).delete()
        await db.folder_memberships.where('accountScopeId').equals(accountScopeId).delete()
        await db.folder_chat_references.where('accountScopeId').equals(accountScopeId).delete()
        await db.folders.bulkPut(parsed.folders.map(indexFolder))
        await db.folder_memberships.bulkPut(parsed.memberships.map(indexMembership))
        await rebuildFolderSummary(Dexie.currentTransaction!, parsed)
        await db.folder_chat_references.bulkPut(parsed.chatReferences)
        const settings = await this.ensureSettings(accountScopeId)
        const folderIds = new Set(parsed.folders.map((row) => row.id))
        await db.folder_settings.put({ ...settings, ...folderSyncSettingsSchema.parse(manifest.settings),
          collapsedFolderIds: settings.collapsedFolderIds.filter((id) => folderIds.has(id)), updatedAt: now() })
        const revision = `${deviceId}:${nanoid()}`
        await db.folder_sync_states.put({ ...prior, accountScopeId, deviceId, provider: 'browser-sync',
          localDataRevision: revision, baseSnapshotId: manifest.snapshotId, dirty: false, retryAt: undefined,
          retryCount: 0, lastErrorCode: undefined, browserSyncWarning: undefined, incompleteReplicaSince: undefined, conflictSummary: undefined, updatedAt: now() })
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

  async recordBrowserSyncHealthy(accountScopeId: string, snapshotId: string, expectedRevision: string, captured?: FolderBrowserSyncCapture): Promise<boolean> {
    requireScope(accountScopeId)
    return db.transaction('rw', captured ? browserSyncViewTables : [db.folder_sync_states], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state || state.localDataRevision !== expectedRevision || state.baseSnapshotId !== snapshotId) return false
      if (captured && !sameBrowserSyncView(captured, await this.readBrowserSyncView(accountScopeId))) return false
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
        || await db.folder_sync_conflicts.where('accountScopeId').equals(accountScopeId).count()) return false
      // Only explicit user intent may abandon a missing base. Keep all business
      // data and mark durable pending work, so a failed publication can resume.
      await db.folder_sync_states.update(accountScopeId, { baseSnapshotId: undefined, dirty: true,
        retryAt: undefined, retryCount: 0, lastErrorCode: undefined, browserSyncWarning: undefined })
      await db.folder_sync_publications.delete(accountScopeId)
      return true
    })
  }

  async getOrCreateBrowserSyncPublication(accountScopeId: string, supplied?: FolderBrowserSyncCapture): Promise<FolderSyncPublicationRow> {
    requireScope(accountScopeId)
    await this.getSettings(accountScopeId)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const view = await db.transaction('r', browserSyncViewTables, () => this.readBrowserSyncView(accountScopeId))
      if (view.hasConflict) throw new Error('Browser Sync conflict requires resolution')
      if (view.state.provider !== 'browser-sync') throw new Error('STALE_REVISION')
      const pending = view.publication
      // A writing publication must finish its exact bytes even after newer edits.
      const reusable = pending && (pending.state === 'writing'
        || (pending.dataRevision === view.state.localDataRevision && pending.baseSnapshotId === view.state.baseSnapshotId
          && pending.settings.enabled === view.settings.enabled && pending.settings.hideOrganizedChats === view.settings.hideOrganizedChats))
      if (reusable) {
        if (await sha256Hex(pending.payload) !== pending.payloadHash) throw new Error('Invalid pending publication hash')
        fromFolderSyncData(accountScopeId, parseFolderSyncData(await decodeGzipBase64(pending.payload)))
        if (await db.transaction('r', browserSyncViewTables, async () => sameBrowserSyncView(view, await this.readBrowserSyncView(accountScopeId)))) {
          if (import.meta.env.DEV) logDevEvent('debug', '[Folders][sync]', 'browser-sync.publication.reused', { accountScopeId, snapshotId: pending.id, publicationState: pending.state, dataRevision: pending.dataRevision })
          return pending
        }
        continue
      }
      const reusedCapture = import.meta.env.DEV && !!supplied
      const captured = supplied ?? await this.captureBrowserSyncData(accountScopeId)
      supplied = undefined
      if (captured.data.accountScopeId !== accountScopeId) throw new Error('Capture belongs to a different account scope')
      if (!sameBrowserSyncView(view, captured)) continue
      // Compression and hashing stay outside the IndexedDB write transaction.
      const payload = await encodeGzipBase64(toFolderSyncData(captured.data))
      const publication: FolderSyncPublicationRow = {
        accountScopeId, id: nanoid(), baseSnapshotId: captured.state.baseSnapshotId,
        dataRevision: captured.dataRevision, payload, payloadHash: await sha256Hex(payload),
        settings: { enabled: captured.settings.enabled, hideOrganizedChats: captured.settings.hideOrganizedChats },
        createdAt: now(), state: 'prepared',
      }
      const saved = await db.transaction('rw', browserSyncViewTables, async () => {
        if (!sameBrowserSyncView(captured, await this.readBrowserSyncView(accountScopeId))) return false
        await db.folder_sync_publications.put(publication)
        return true
      })
      if (saved) {
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][sync]', 'browser-sync.publication.prepared', { accountScopeId, snapshotId: publication.id, dataRevision: captured.dataRevision, reusedCapture })
        return publication
      }
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][sync]', 'browser-sync.capture.stale', { accountScopeId, dataRevision: captured.dataRevision, attempt })
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
