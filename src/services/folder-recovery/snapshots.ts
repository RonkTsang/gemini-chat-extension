import { nanoid } from 'nanoid'

import { db } from '@/data/db'
import { beginFolderAccess } from '@/data/folder-access'
import { logDevEvent } from '@/utils/devLogger'
import { countFolderOrganization } from '@/domain/folder/organization-summary'
import { snapshotPayloadBytes } from '@/domain/folder/snapshot'
import { parseFolderOrganizationData } from '@/domain/folder/schemas'
import type { FolderExportPayload, FolderOrganizationData, FolderSnapshotRow } from '@/domain/folder/types'
import { decodeGzip, encodeGzip, FolderCompressionUnavailableError, sha256Hex } from '@/services/folder-data/codec'
import {
  classifyRecoveryFailure, FolderRecoveryError, isImportant, isQuotaError, newestSnapshots,
  SNAPSHOT_BUDGET_BYTES, SNAPSHOT_GROUP_GAP_MS, SNAPSHOT_GROUP_MAX_MS, SNAPSHOT_PROTECTION_TTL_MS,
  snapshotBytes, trimSnapshots, type FolderRecoveryOptions,
} from './storage'

function organization(data: FolderOrganizationData): unknown {
  return {
    folders: data.folders.map(({ id, parentFolderId, name, iconKey, colorValue, orderKey }) => ({ id, parentFolderId, name, iconKey, colorValue, orderKey })).sort((a, b) => a.id.localeCompare(b.id)),
    memberships: data.memberships.map(({ id, folderId, chatId, orderKey, pinnedOrderKey }) => ({ id, folderId, chatId, orderKey, pinnedOrderKey })).sort((a, b) => a.id.localeCompare(b.id)),
    chatReferences: data.chatReferences.map(({ chatId, cachedTitle }) => ({ chatId, cachedTitle })).sort((a, b) => a.chatId.localeCompare(b.chatId)),
  }
}

/** Caller holds the target lease; hashing and decoding happen outside the read transaction. */
export async function readFolderSnapshot(accountScopeId: string, id: string): Promise<{ snapshot: FolderSnapshotRow; data: FolderOrganizationData }> {
  const { snapshot, payload } = await db.transaction('r', db.folder_snapshots, db.folder_snapshot_payloads, async (transaction) => {
    if (import.meta.env.DEV) {
      const finish = beginFolderAccess(transaction, { operation: 'readFolderSnapshot', phase: 'query', accountScopeId })
      transaction.on('complete', () => finish('success'))
      transaction.on('abort', () => finish('failed'))
    }
    const snapshot = await db.folder_snapshots.get(id)
    if (!snapshot || snapshot.accountScopeId !== accountScopeId || snapshot.validationState !== 'valid') throw new Error('Snapshot is unavailable')
    const payload = await db.folder_snapshot_payloads.get(id)
    return { snapshot, payload }
  })
  let data: FolderOrganizationData | undefined
  if (payload?.compressedPayload instanceof ArrayBuffer && payload.compressedPayload.byteLength === snapshot.payloadBytes
    && await sha256Hex(payload.compressedPayload) === snapshot.contentHash) {
    try { data = parseFolderOrganizationData(await decodeGzip(payload.compressedPayload)) }
    catch (error) {
      if (error instanceof FolderCompressionUnavailableError) throw error
      // Invalid organization data is reported with the same integrity error as invalid bytes.
    }
  }
  if (!data) {
    await db.transaction('rw', db.folder_snapshots, async () => {
      const current = await db.folder_snapshots.get(id)
      if (current?.contentHash === snapshot.contentHash) await db.folder_snapshots.update(id, {
        validationState: 'invalid', folderCount: undefined, chatCount: undefined,
      })
    })
    throw new Error('Snapshot integrity check failed')
  }
  return { snapshot, data }
}

export async function saveFolderSnapshot(
  payload: Pick<FolderExportPayload, 'accountScopeId' | 'data'>,
  dataRevision: string,
  reason: FolderSnapshotRow['reason'],
  options: FolderRecoveryOptions = {},
  hold = false,
  capturedPendingRevision?: string,
): Promise<FolderSnapshotRow> {
  const timestamp = new Date().toISOString()
  const compressedPayload = await encodeGzip(payload.data)
  const lease = hold ? { token: nanoid(), expiresAt: new Date(Date.now() + SNAPSHOT_PROTECTION_TTL_MS).toISOString() } : undefined
  const row: FolderSnapshotRow = {
    id: nanoid(), accountScopeId: payload.accountScopeId, reason, reasons: [reason], schemaVersion: 1,
    dataRevision, createdAt: timestamp, updatedAt: timestamp,
    contentHash: await sha256Hex(compressedPayload), payloadBytes: snapshotPayloadBytes(compressedPayload), validationState: 'valid',
    organizationHash: await sha256Hex(JSON.stringify(organization(payload.data))),
    ...countFolderOrganization(payload.data.folders, payload.data.memberships),
    ...(lease ? { protectedUntil: lease.expiresAt, protectionLeases: [lease], protectionToken: lease.token } : {}),
  }
  const budget = options.budgetBytes ?? SNAPSHOT_BUDGET_BYTES
  if (snapshotBytes(row) > budget) throw new FolderRecoveryError('SNAPSHOT_TOO_LARGE')
  const reserve = Math.max(1024 * 1024, snapshotBytes(row) * 3)
  const priorState = await db.folder_recovery_states.get(payload.accountScopeId)
  const originals = await db.folder_snapshots.where('accountScopeId').equals(payload.accountScopeId).toArray()
  const identical = originals.find((entry) => entry.validationState === 'valid' && entry.organizationHash === row.organizationHash)
  const keepIds = [priorState?.groupSnapshotId, identical?.id].filter((id): id is string => !!id)
  let outcome: 'created' | 'grouped' | 'reused' = 'created'
  let completed = false
  const write = () => db.transaction('rw', db.folder_snapshots, db.folder_snapshot_payloads, db.folder_recovery_states, async (transaction) => {
    if (import.meta.env.DEV) {
      const finish = beginFolderAccess(transaction, { operation: 'saveFolderSnapshot', phase: 'transaction', accountScopeId: payload.accountScopeId })
      transaction.on('complete', () => finish('success', { outcome, payloadBytesWritten: outcome === 'reused' ? 0 : row.payloadBytes, capturedRevision: dataRevision }))
      transaction.on('abort', () => finish('rollback'))
    }
    const accountScopeId = payload.accountScopeId
    const state = await db.folder_recovery_states.get(accountScopeId)
    const rows = newestSnapshots(await db.folder_snapshots.where('accountScopeId').equals(accountScopeId).toArray())
    let same = rows.find((entry) => entry.validationState === 'valid' && entry.organizationHash === row.organizationHash)
    if (same && !(await db.folder_snapshot_payloads.where(':id').equals(same.id).primaryKeys()).length) {
      await db.folder_snapshots.update(same.id, { validationState: 'invalid', folderCount: undefined, chatCount: undefined })
      same = undefined
    }
    const group = rows.find((entry) => entry.id === state?.groupSnapshotId)
    const canGroup = reason === 'automatic' && group?.validationState === 'valid' && !isImportant(group)
      && (!group.protectedUntil || Date.parse(group.protectedUntil) <= Date.now())
      && Date.now() - Date.parse(state?.lastActionAt ?? '') <= SNAPSHOT_GROUP_GAP_MS
      && Date.now() - Date.parse(state?.groupStartedAt ?? '') < SNAPSHOT_GROUP_MAX_MS
    let saved = row
    if (import.meta.env.DEV) outcome = same ? 'reused' : canGroup ? 'grouped' : 'created'
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
    if (!same) await db.folder_snapshot_payloads.put({ id: saved.id, compressedPayload })
    await db.folder_snapshots.put(stored)
    await trimSnapshots(budget, [saved.id])
    const automatic = reason === 'automatic' && !isImportant(saved) && (!same || (canGroup && same.id === group.id))
    completed = state?.pendingRevision === capturedPendingRevision
    await db.folder_recovery_states.put({
      ...state,
      accountScopeId, updatedAt: timestamp,
      ...(completed ? { pendingRevision: undefined, warning: undefined, automaticSnapshotFailed: false } : {}),
      groupSnapshotId: undefined,
      groupStartedAt: undefined,
      lastActionAt: undefined,
      ...(automatic ? {
        groupSnapshotId: saved.id,
        groupStartedAt: canGroup && saved.id === group.id ? state!.groupStartedAt : timestamp,
        lastActionAt: timestamp,
      } : {}),
    })
    return saved
  })
  const persist = async () => {
    const saved = await write()
    if (import.meta.env.DEV) logDevEvent('info', '[Folders][recovery]', 'recovery.snapshot-saved', {
      accountScopeId: payload.accountScopeId, snapshotId: saved.id, outcome,
      capturedDataRevision: dataRevision, capturedPendingRevision, pendingCompleted: completed,
    })
    return saved
  }
  try {
    return await persist()
  } catch (error) {
    if (!isQuotaError(error)) throw error
    // Failed writes roll back. Reclaim eligible history once, preserving all
    // in-flight protection points, then let the actual write decide.
    await db.transaction('rw', db.folder_snapshots, db.folder_snapshot_payloads, () => trimSnapshots(budget, keepIds, reserve))
    try { return await persist() } catch (retryError) {
      if (isQuotaError(retryError)) throw new FolderRecoveryError('LOCAL_STORAGE_FULL')
      throw retryError
    }
  }
}

export async function recordRecoveryFailure(accountScopeId: string, error: unknown, reason: FolderSnapshotRow['reason'], capturedPendingRevision?: string): Promise<void> {
  if (reason !== 'automatic') return
  const warning = classifyRecoveryFailure(error)
  await db.transaction('rw', db.folder_recovery_states, async () => {
    const state = await db.folder_recovery_states.get(accountScopeId)
    if (state?.pendingRevision !== capturedPendingRevision) return
    await db.folder_recovery_states.put({ ...state, accountScopeId, warning,
      automaticSnapshotFailed: true,
      updatedAt: new Date().toISOString() })
  })
}
