import { nanoid } from 'nanoid'

import { db } from '@/data/db'
import { countFolderOrganization } from '@/domain/folder/organization-summary'
import { parseFolderExportPayload } from '@/domain/folder/schemas'
import type { FolderExportPayload, FolderSnapshotRow } from '@/domain/folder/types'
import { decodeLzStringBase64, encodeLzStringBase64, sha256Hex } from '@/services/folder-sync/codec'
import {
  classifyRecoveryFailure, FolderRecoveryError, isImportant, isQuotaError, newestSnapshots,
  SNAPSHOT_BUDGET_BYTES, SNAPSHOT_GROUP_GAP_MS, SNAPSHOT_GROUP_MAX_MS, SNAPSHOT_PROTECTION_TTL_MS,
  snapshotBytes, trimSnapshots, type FolderRecoveryOptions,
} from './storage'

function organization(payload: FolderExportPayload): unknown {
  return {
    accountScopeId: payload.accountScopeId,
    folders: payload.folders.filter((row) => !row.deletedAt).map(({ id, parentFolderId, name, iconKey, colorValue, orderKey }) => ({ id, parentFolderId, name, iconKey, colorValue, orderKey })).sort((a, b) => a.id.localeCompare(b.id)),
    memberships: payload.memberships.filter((row) => !row.deletedAt).map(({ id, folderId, chatId, orderKey, pinnedOrderKey }) => ({ id, folderId, chatId, orderKey, pinnedOrderKey })).sort((a, b) => a.id.localeCompare(b.id)),
    chatReferences: payload.chatReferences.map(({ chatId, cachedTitle }) => ({ chatId, cachedTitle })).sort((a, b) => a.chatId.localeCompare(b.chatId)),
  }
}

/** Older restore points have no summary metadata; derive it from their own payload. */
export async function withSnapshotCounts(row: FolderSnapshotRow): Promise<FolderSnapshotRow> {
  if (row.folderCount !== undefined && row.chatCount !== undefined) return row
  try {
    if (await sha256Hex(row.compressedPayload) !== row.contentHash) throw new Error('Snapshot integrity check failed')
    const payload = parseFolderExportPayload(decodeLzStringBase64<unknown>(row.compressedPayload))
    if (payload.accountScopeId !== row.accountScopeId) throw new Error('Snapshot account scope mismatch')
    return { ...row, ...countFolderOrganization(payload.folders, payload.memberships) }
  } catch (error) {
    console.warn('[Folders] Could not read restore point counts:', row.id, error)
    return { ...row, folderCount: undefined, chatCount: undefined }
  }
}

export async function saveFolderSnapshot(
  payload: FolderExportPayload,
  dataRevision: string,
  reason: FolderSnapshotRow['reason'],
  options: FolderRecoveryOptions = {},
  hold = false,
): Promise<FolderSnapshotRow> {
  const timestamp = new Date().toISOString()
  const compressedPayload = encodeLzStringBase64(payload)
  const lease = hold ? { token: nanoid(), expiresAt: new Date(Date.now() + SNAPSHOT_PROTECTION_TTL_MS).toISOString() } : undefined
  const row: FolderSnapshotRow = {
    id: nanoid(), accountScopeId: payload.accountScopeId, reason, reasons: [reason], schemaVersion: 1,
    dataRevision, createdAt: timestamp, updatedAt: timestamp,
    contentHash: await sha256Hex(compressedPayload), compressedPayload,
    organizationHash: await sha256Hex(JSON.stringify(organization(payload))),
    ...countFolderOrganization(payload.folders, payload.memberships),
    ...(lease ? { protectedUntil: lease.expiresAt, protectionLeases: [lease], protectionToken: lease.token } : {}),
  }
  const budget = options.budgetBytes ?? SNAPSHOT_BUDGET_BYTES
  if (snapshotBytes(row) > budget) throw new FolderRecoveryError('SNAPSHOT_TOO_LARGE')
  const reserve = Math.max(1024 * 1024, snapshotBytes(row) * 3)
  const priorState = await db.folder_recovery_states.get(payload.accountScopeId)
  const originals = await db.folder_snapshots.where('accountScopeId').equals(payload.accountScopeId).toArray()
  const identical = originals.find((entry) => entry.organizationHash === row.organizationHash)
  const keepIds = [priorState?.groupSnapshotId, identical?.id].filter((id): id is string => !!id)
  const write = () => db.transaction('rw', db.folder_snapshots, db.folder_recovery_states, async () => {
    const accountScopeId = payload.accountScopeId
    const state = await db.folder_recovery_states.get(accountScopeId)
    const rows = newestSnapshots(await db.folder_snapshots.where('accountScopeId').equals(accountScopeId).toArray())
    const same = rows.find((entry) => entry.organizationHash === row.organizationHash)
    const group = rows.find((entry) => entry.id === state?.groupSnapshotId)
    const canGroup = reason === 'automatic' && group && !isImportant(group)
      && (!group.protectedUntil || Date.parse(group.protectedUntil) <= Date.now())
      && Date.now() - Date.parse(state?.lastActionAt ?? '') <= SNAPSHOT_GROUP_GAP_MS
      && Date.now() - Date.parse(state?.groupStartedAt ?? '') < SNAPSHOT_GROUP_MAX_MS
    let saved = row
    if (same) {
      saved = {
        ...same, updatedAt: timestamp,
        folderCount: row.folderCount, chatCount: row.chatCount,
        reason: reason === 'automatic' ? same.reason : reason,
        reasons: [...new Set([...(same.reasons ?? [same.reason]), reason])],
        ...(lease ? {
          protectedUntil: lease.expiresAt,
          protectionLeases: [...(same.protectionLeases ?? []).filter((entry) => Date.parse(entry.expiresAt) > Date.now()), lease],
          protectionToken: lease.token,
        } : {}),
      }
    } else if (canGroup) {
      saved = { ...row, id: group.id, createdAt: group.createdAt }
    }
    if ((saved.protectionLeases?.length ?? 0) > 100) throw new FolderRecoveryError('SNAPSHOT_BUDGET_EXCEEDED')
    const { protectionToken: _, ...stored } = saved
    await db.folder_snapshots.put(stored)
    await trimSnapshots(budget, [saved.id])
    const automatic = reason === 'automatic' && !isImportant(saved) && (!same || (canGroup && same.id === group.id))
    await db.folder_recovery_states.put({
      accountScopeId, updatedAt: timestamp,
      warning: undefined,
      automaticSnapshotFailed: false,
      ...(automatic ? {
        groupSnapshotId: saved.id,
        groupStartedAt: canGroup && saved.id === group.id ? state!.groupStartedAt : timestamp,
        lastActionAt: timestamp,
      } : {}),
    })
    return saved
  })
  try {
    return await write()
  } catch (error) {
    if (!isQuotaError(error)) throw error
    // Failed writes roll back. Reclaim eligible history once, preserving all
    // in-flight protection points, then let the actual write decide.
    await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(budget, keepIds, reserve))
    try { return await write() } catch (retryError) {
      if (isQuotaError(retryError)) throw new FolderRecoveryError('LOCAL_STORAGE_FULL')
      throw retryError
    }
  }
}

export async function recordRecoveryFailure(accountScopeId: string, error: unknown, reason: FolderSnapshotRow['reason']): Promise<void> {
  if (reason !== 'automatic') return
  const warning = classifyRecoveryFailure(error)
  const state = await db.folder_recovery_states.get(accountScopeId)
  await db.folder_recovery_states.put({ ...state, accountScopeId, warning,
    automaticSnapshotFailed: true,
    updatedAt: new Date().toISOString() })
}
