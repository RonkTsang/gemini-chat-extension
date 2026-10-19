import type { FolderSnapshotRow, FolderSnapshotSummary } from './types'

export function snapshotPayloadBytes(compressedPayload: string): number {
  return new TextEncoder().encode(JSON.stringify(compressedPayload)).byteLength
}

/** Preserve the pre-split JSON budget, excluding response tokens and internal byte/validation fields. */
export function snapshotBytes(row: FolderSnapshotRow): number {
  const { payloadBytes, validationState: _, protectionToken: __, ...metadata } = row
  return new TextEncoder().encode(JSON.stringify(metadata)).byteLength + ',"compressedPayload":'.length + payloadBytes
}

/** Explicit RPC whitelist: no payload, hashes, internal byte counts or lease tokens. */
export function toSnapshotSummary(row: FolderSnapshotRow): FolderSnapshotSummary {
  const { id, accountScopeId, reason, reasons, folderCount, chatCount, createdAt, updatedAt, validationState } = row
  return { id, accountScopeId, reason, reasons, folderCount, chatCount, createdAt, updatedAt, validationState }
}
