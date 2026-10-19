import type { FolderSnapshotRow, FolderSnapshotSummary } from './types'

export function snapshotPayloadBytes(compressedPayload: ArrayBuffer): number {
  return compressedPayload.byteLength
}

/** Logical budget: gzip bytes plus persisted metadata, not IndexedDB disk usage. */
export function snapshotBytes(row: FolderSnapshotRow): number {
  const { protectionToken: _, ...metadata } = row
  return new TextEncoder().encode(JSON.stringify(metadata)).byteLength + row.payloadBytes
}

/** Explicit RPC whitelist: no payload, hashes, internal byte counts or lease tokens. */
export function toSnapshotSummary(row: FolderSnapshotRow): FolderSnapshotSummary {
  const { id, accountScopeId, reason, reasons, folderCount, chatCount, createdAt, updatedAt, validationState } = row
  return { id, accountScopeId, reason, reasons, folderCount, chatCount, createdAt, updatedAt, validationState }
}
