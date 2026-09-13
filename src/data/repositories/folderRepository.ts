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
import { parseFolderExportPayload } from '@/domain/folder/schemas'
import {
  ROOT_FOLDER_ID,
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
  type FolderSyncEnvelope,
  type FolderSyncStateRow,
} from '@/domain/folder/types'
import { decodeAndVerifyEnvelopePayload, decodeLzStringBase64, encodeLzStringBase64, sha256Hex } from '@/services/folder-sync/codec'
import {
  createFolderTraceId,
  logFolderTrace,
  logFolderTraceError,
} from '@/utils/folderTrace'

const SNAPSHOT_LIMIT = 30
const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const FOLDER_DEVICE_ID_STORAGE_KEY = 'gpk.folders.device-id.v1'
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
  removeMembership(accountScopeId: string, folderId: string, chatId: string): Promise<void>
  upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string): Promise<ChatReferenceRow>
  removeChatReference(accountScopeId: string, chatId: string): Promise<void>
  removeChatAfterGeminiDelete(accountScopeId: string, chatId: string): Promise<void>
  createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason']): Promise<FolderSnapshotRow>
  listSnapshots(accountScopeId: string): Promise<FolderSnapshotRow[]>
  restoreSnapshot(accountScopeId: string, snapshotId: string): Promise<void>
  exportAccountData(accountScopeId: string): Promise<FolderExportPayload>
  importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<void>
  createSyncEnvelope(accountScopeId: string): Promise<FolderSyncEnvelope>
  getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined>
  hasPendingOperations(accountScopeId: string): Promise<boolean>
  applyBrowserSyncPayload(accountScopeId: string, payload: FolderExportPayload, appliedRevision: string, authorityEpoch: string, preservePending?: boolean): Promise<void>
  markBrowserSyncUploaded(accountScopeId: string, revision: string, warning?: 'near-quota'): Promise<void>
  recordBrowserSyncFailure(accountScopeId: string, errorCode: string): Promise<void>
  getOrCreateBrowserSyncGeneration(accountScopeId: string): Promise<FolderSyncGenerationRow>
  markBrowserSyncGenerationAccepted(accountScopeId: string, generationId: string, warning?: 'near-quota'): Promise<void>
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

  constructor(private readonly deviceIdProvider: FolderDeviceIdProvider = runtimeFolderDeviceIdProvider) {}

  private async preheatDevice(): Promise<string> {
    this.deviceReady ??= this.deviceIdProvider.getDeviceId()
    const deviceId = await this.deviceReady
    sharedClock ??= new HybridLogicalClock(`${deviceId}.${runtimeStampTieBreaker}`)
    return deviceId
  }

  private stamp(): string {
    if (!sharedClock) throw new Error('Folder device id must be preheated before a transaction')
    return sharedClock.next()
  }

  private defaultSettings(accountScopeId: string): FolderSettingsRow {
    const versionStamp = this.stamp()
    return {
      accountScopeId,
      enabled: true,
      hideOrganizedChats: false,
      collapsedFolderIds: [],
      updatedAt: now(),
      fieldVersions: {
        enabled: versionStamp,
        hideOrganizedChats: versionStamp,
        collapsedFolderIds: versionStamp,
      },
    }
  }

  private async ensureSettings(accountScopeId: string): Promise<FolderSettingsRow> {
    const existing = await db.folder_settings.get(accountScopeId)
    if (existing) return existing
    const settings = this.defaultSettings(accountScopeId)
    await db.folder_settings.put(settings)
    return settings
  }

  private async rawAccountData(accountScopeId: string): Promise<Omit<FolderExportPayload, 'schemaVersion' | 'exportedAt'>> {
    const [folders, memberships, chatReferences, settings] = await Promise.all([
      db.folders.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray(),
      db.folder_chat_references.where('accountScopeId').equals(accountScopeId).toArray(),
      this.ensureSettings(accountScopeId),
    ])
    return {
      accountScopeId,
      folders: sortByOrder(folders),
      memberships: sortByOrder(memberships),
      chatReferences: [...chatReferences].sort((left, right) => compareAscii(left.chatId, right.chatId)),
      settings,
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
      dataRevision: revision,
      lastAppliedRevision: prior?.lastAppliedRevision,
      lastUploadedRevision: prior?.lastUploadedRevision,
      driveFileId: prior?.driveFileId,
      driveFileVersion: prior?.driveFileVersion,
      driveChangePageToken: prior?.driveChangePageToken,
      lastSuccessfulSyncAt: prior?.lastSuccessfulSyncAt,
      lastAttemptAt: prior?.lastAttemptAt,
      retryAt: prior?.retryAt,
      lastErrorCode: prior?.lastErrorCode,
      browserSyncWarning: prior?.browserSyncWarning,
      updatedAt: now(),
    }
    const opId = nanoid()
    const operation: FolderOperationRow = {
      id: opId,
      opId,
      accountScopeId,
      deviceId,
      baseRevision: prior?.lastAppliedRevision ?? prior?.dataRevision,
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
        dataRevision: `${deviceId}:initial-${nanoid()}`,
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
  ): Promise<string> {
    try {
      return resolveOrderKey(siblings, position)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('space exhausted')) throw error
      const ordered = sortByOrder([...siblings])
      const keys = rebalanceOrderKeys(ordered.map((membership) => membership.id))
      const versionStamp = this.stamp()
      const updated = ordered.map((membership) => ({
        ...membership,
        orderKey: keys.get(membership.id)!,
        updatedAt: now(),
        versionStamp,
        positionVersionStamp: versionStamp,
      }))
      await db.folder_memberships.bulkPut(updated)
      await this.writeOperation(accountScopeId, deviceId, 'order.rebalance', folderId, versionStamp, {
        folderId,
        membershipIds: ordered.map((membership) => membership.id),
      })
      return resolveOrderKey(updated, position)
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
    const deviceId = await this.preheatDevice()
    let result!: FolderSettingsRow
    await db.transaction('rw', db.folder_settings, db.folder_operations, db.folder_sync_states, async () => {
      const prior = await this.ensureSettings(accountScopeId)
      const versionStamp = this.stamp()
      const collapsedFolderIds = patch.collapsedFolderIds === undefined
        ? prior.collapsedFolderIds
        : [...new Set(patch.collapsedFolderIds)]
      result = {
        ...prior,
        ...patch,
        collapsedFolderIds,
        updatedAt: now(),
        fieldVersions: {
          ...prior.fieldVersions,
          ...Object.fromEntries(Object.keys(patch).map((key) => [key, versionStamp])),
        },
      }
      await db.folder_settings.put(result)
      await this.writeOperation(accountScopeId, deviceId, 'settings.update', accountScopeId, versionStamp, { patch })
    })
    return result
  }

  async listFolders(accountScopeId: string): Promise<FolderRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return sortByOrder((await db.folders.where('accountScopeId').equals(accountScopeId).toArray()).filter(isLive))
  }

  async listMemberships(accountScopeId: string): Promise<FolderMembershipRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return sortByOrder((await db.folder_memberships.where('accountScopeId').equals(accountScopeId).toArray()).filter(isLive))
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
    const memberships = sortByOrder(allMemberships.filter((membership) => isLive(membership) && folderIds.has(membership.folderId)))
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
        versionStamp, positionVersionStamp: versionStamp,
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
    await this.createSnapshot(accountScopeId, 'before-delete')
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
    await this.createAutomaticSnapshot(accountScopeId)
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
        const versionStamp = this.stamp()
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
      const versionStamp = this.stamp()
      const timestamp = now()
      result = {
        ...prior,
        id: targetId,
        folderId: targetFolderId,
        orderKey: await this.resolveMembershipOrderKey(accountScopeId, targetFolderId, siblings, position, deviceId),
        updatedAt: timestamp,
        versionStamp,
        positionVersionStamp: versionStamp,
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

  async upsertChatReference(accountScopeId: string, chatId: string, cachedTitle: string): Promise<ChatReferenceRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    if (!chatId.trim()) throw new Error('A chat id is required')
    let result!: ChatReferenceRow
    await db.transaction('rw', db.folder_chat_references, db.folder_operations, db.folder_sync_states, async () => {
      const prior = await db.folder_chat_references.get([accountScopeId, chatId])
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

  async removeChatAfterGeminiDelete(accountScopeId: string, chatId: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    await this.createSnapshot(accountScopeId, 'before-delete')
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
    await this.createAutomaticSnapshot(accountScopeId)
  }

  async exportAccountData(accountScopeId: string): Promise<FolderExportPayload> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return {
      schemaVersion: 1,
      ...(await this.rawAccountData(accountScopeId)),
      exportedAt: now(),
    }
  }

  async createSnapshot(accountScopeId: string, reason: FolderSnapshotRow['reason']): Promise<FolderSnapshotRow> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const [payload, state] = await Promise.all([
      this.exportAccountData(accountScopeId),
      db.folder_sync_states.get(accountScopeId),
    ])
    const compressedPayload = encodeLzStringBase64(payload)
    const row: FolderSnapshotRow = {
      id: nanoid(),
      accountScopeId,
      reason,
      schemaVersion: 1,
      dataRevision: state?.dataRevision ?? 'local-unpublished',
      createdAt: now(),
      contentHash: await sha256Hex(compressedPayload),
      compressedPayload,
    }
    await db.transaction('rw', db.folder_snapshots, async () => {
      await db.folder_snapshots.put(row)
      const snapshots = await db.folder_snapshots.where('[accountScopeId+createdAt]')
        .between([accountScopeId, Dexie.minKey], [accountScopeId, Dexie.maxKey]).reverse().toArray()
      const oldestAllowed = Date.now() - SNAPSHOT_MAX_AGE_MS
      const expired = snapshots.filter((snapshot, index) => index >= SNAPSHOT_LIMIT || Date.parse(snapshot.createdAt) < oldestAllowed)
      await db.folder_snapshots.bulkDelete(expired.map((snapshot) => snapshot.id))
    })
    return row
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
        console.warn('[Folders] Failed to create an automatic recovery point', error)
      }
    }
  }

  async listSnapshots(accountScopeId: string): Promise<FolderSnapshotRow[]> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return await db.folder_snapshots.where('[accountScopeId+createdAt]')
      .between([accountScopeId, Dexie.minKey], [accountScopeId, Dexie.maxKey]).reverse().toArray()
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
      const incomingSettings = preserveSettings
        ? {
            ...payload.settings,
            enabled: currentSettings.enabled,
            hideOrganizedChats: currentSettings.hideOrganizedChats,
            collapsedFolderIds: currentSettings.collapsedFolderIds,
            fieldVersions: currentSettings.fieldVersions,
            updatedAt: now(),
          }
        : payload.settings
      await db.folder_settings.put(incomingSettings)
      await this.writeOperation(accountScopeId, deviceId, operationType, accountScopeId, versionStamp, { exportedAt: payload.exportedAt })
    })
  }

  async importAccountData(accountScopeId: string, payload: FolderExportPayload): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderExportPayload(payload)
    if (parsed.accountScopeId !== accountScopeId) throw new Error('Backup belongs to a different account scope')
    await this.createSnapshot(accountScopeId, 'before-import')
    await this.replaceAccountData(accountScopeId, parsed, 'snapshot.restore', deviceId, false)
    await this.createAutomaticSnapshot(accountScopeId)
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
    await this.createSnapshot(accountScopeId, 'before-restore')
    await this.replaceAccountData(accountScopeId, payload, 'snapshot.restore', deviceId, true)
    await this.createAutomaticSnapshot(accountScopeId)
  }

  async createSyncEnvelope(accountScopeId: string): Promise<FolderSyncEnvelope> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    const payload = await this.exportAccountData(accountScopeId)
    const encodedPayload = encodeLzStringBase64(payload)
    return {
      appId: 'gemini-power-kit-folders',
      schemaVersion: 1,
      syncProtocolVersion: 1,
      accountScopeId,
      authority: {
        provider: state.provider,
        epoch: state.authorityEpoch,
      },
      dataRevision: state.dataRevision,
      parentRevisions: state.lastAppliedRevision ? [state.lastAppliedRevision] : [],
      generatedByDeviceId: deviceId,
      generatedAt: now(),
      encoding: { codec: 'lz-string-base64', codecVersion: 1 },
      contentHash: await sha256Hex(encodedPayload),
      payload: encodedPayload,
    }
  }

  async getSyncState(accountScopeId: string): Promise<FolderSyncStateRow | undefined> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    return await db.folder_sync_states.get(accountScopeId)
  }

  async hasPendingOperations(accountScopeId: string): Promise<boolean> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    const operations = await db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray()
    return operations.some((operation) => operation.state === 'pending')
  }

  async applyBrowserSyncPayload(
    accountScopeId: string,
    payload: FolderExportPayload,
    appliedRevision: string,
    authorityEpoch: string,
    preservePending = false,
  ): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const parsed = parseFolderExportPayload(payload)
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
      await db.folder_settings.put(parsed.settings)
      const mergedRevision = preservePending ? `${deviceId}:${nanoid()}` : appliedRevision
      const nextState: FolderSyncStateRow = {
        accountScopeId,
        deviceId: prior?.deviceId ?? deviceId,
        provider: 'browser-sync',
        authorityEpoch,
        dataRevision: mergedRevision,
        lastAppliedRevision: appliedRevision,
        lastUploadedRevision: prior?.lastUploadedRevision,
        lastSuccessfulSyncAt: now(),
        browserSyncWarning: prior?.browserSyncWarning,
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

  async markBrowserSyncUploaded(accountScopeId: string, revision: string, warning?: 'near-quota'): Promise<void> {
    requireScope(accountScopeId)
    await this.preheatDevice()
    await db.transaction('rw', [db.folder_operations, db.folder_sync_states], async () => {
      const state = await db.folder_sync_states.get(accountScopeId)
      if (!state || state.provider !== 'browser-sync') throw new Error('Browser Sync state is unavailable')
      await db.folder_operations.where('accountScopeId').equals(accountScopeId).modify((operation) => {
        if (operation.state === 'pending') operation.state = 'accepted-by-browser-storage'
      })
      await db.folder_sync_states.put({
        ...state,
        dataRevision: revision,
        lastAppliedRevision: revision,
        lastUploadedRevision: revision,
        lastSuccessfulSyncAt: now(),
        lastAttemptAt: now(),
        lastErrorCode: undefined,
        retryAt: undefined,
        browserSyncWarning: warning,
        updatedAt: now(),
      })
    })
  }

  async recordBrowserSyncFailure(accountScopeId: string, errorCode: string): Promise<void> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    await db.folder_sync_states.put({
      ...state,
      lastAttemptAt: now(),
      lastErrorCode: errorCode,
      retryAt: new Date(Date.now() + 60_000).toISOString(),
      browserSyncWarning: 'write-failed',
      updatedAt: now(),
    })
  }

  async getOrCreateBrowserSyncGeneration(accountScopeId: string): Promise<FolderSyncGenerationRow> {
    requireScope(accountScopeId)
    const deviceId = await this.preheatDevice()
    const state = await this.ensureSyncState(accountScopeId, deviceId)
    const existing = await db.folder_sync_generations
      .where('[accountScopeId+dataRevision]').equals([accountScopeId, state.dataRevision]).toArray()
    const reusable = existing.find((row) => row.state === 'prepared' || row.state === 'writing')
    if (reusable) {
      try {
        await decodeAndVerifyEnvelopePayload(JSON.parse(reusable.serializedEnvelope) as FolderSyncEnvelope)
        return reusable
      } catch {
        // A prepared generation must normally be replayed byte-for-byte. A
        // locally malformed one (for example, produced before a codec fix)
        // cannot ever publish, so supersede it and rebuild from the durable
        // entities and pending operations for the same revision.
        await db.folder_sync_generations.update(reusable.id, { state: 'superseded' })
      }
    }
    const envelope = await this.createSyncEnvelope(accountScopeId)
    const operations = await db.folder_operations.where('accountScopeId').equals(accountScopeId).toArray()
    const generation: FolderSyncGenerationRow = {
      id: nanoid(),
      accountScopeId,
      syncMode: 'browser-sync',
      syncEpoch: state.authorityEpoch,
      dataRevision: envelope.dataRevision,
      parentRevisions: envelope.parentRevisions,
      includedOperationIds: operations.filter((operation) => operation.state === 'pending').map((operation) => operation.id),
      contentHash: envelope.contentHash,
      serializedEnvelope: JSON.stringify(envelope),
      createdAt: now(),
      state: 'prepared',
    }
    await db.folder_sync_generations.put(generation)
    return generation
  }

  async markBrowserSyncGenerationAccepted(accountScopeId: string, generationId: string, warning?: 'near-quota'): Promise<void> {
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
        lastUploadedRevision: generation.dataRevision,
        lastSuccessfulSyncAt: now(),
        lastAttemptAt: now(),
        lastErrorCode: undefined,
        retryAt: undefined,
        browserSyncWarning: warning,
        updatedAt: now(),
      })
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
