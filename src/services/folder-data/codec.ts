import { compressToBase64, decompressFromBase64 } from 'lz-string'

import { parseFolderAccountData } from '@/domain/folder/schemas'
import { scopeFolderOrganizationData } from '@/domain/folder/organization-data'
import type { FolderAccountData, FolderOrganizationData } from '@/domain/folder/types'

export { toFolderOrganizationData } from '@/domain/folder/organization-data'

/** Shared serialization and integrity primitives for all Folder data packages. */
export function stableStringify(value: unknown): string {
  // Match JSON.stringify semantics for optional fields. In particular, an
  // undefined object property is omitted (not serialized as the invalid JSON
  // token `undefined`), while undefined array slots become null.
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined && typeof record[key] !== 'function' && typeof record[key] !== 'symbol')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function encodeLzStringBase64(value: unknown): string {
  return compressToBase64(stableStringify(value))
}

export function decodeLzStringBase64<T>(value: string): T {
  const decoded = decompressFromBase64(value)
  if (decoded === null) throw new Error('Folder sync payload is not valid lz-string base64')
  try {
    return JSON.parse(decoded) as T
  } catch {
    throw new Error('Folder sync payload is not valid JSON')
  }
}

/** SHA-256 is required: callers must not replace it with a non-cryptographic hash. */
export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto SHA-256 is unavailable; Folder sync is disabled')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function fromFolderOrganizationData(accountScopeId: string, data: FolderOrganizationData): FolderAccountData {
  return parseFolderAccountData(scopeFolderOrganizationData(accountScopeId, data))
}
