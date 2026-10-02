import { compressToBase64, decompressFromBase64 } from 'lz-string'

import { parseFolderAccountData, parseFolderSyncData } from '@/domain/folder/schemas'
import type { BrowserSyncManifest, FolderAccountData, FolderSyncData, FolderSyncSettings } from '@/domain/folder/types'

/** Provider-neutral serialization and integrity primitives for Folder data. */
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

export function toFolderSyncData(data: FolderAccountData): FolderSyncData {
  const unscoped = <T extends { accountScopeId: string }>(rows: T[]): Omit<T, 'accountScopeId'>[] =>
    rows.map(({ accountScopeId: _, ...row }) => row)
  return { folders: unscoped(data.folders), memberships: unscoped(data.memberships), chatReferences: unscoped(data.chatReferences) }
}

/** Validate the compressed bytes before decoding and assigning account ownership. */
export async function decodeAndVerifySyncData(manifest: BrowserSyncManifest, payload: string): Promise<FolderAccountData> {
  if (new TextEncoder().encode(payload).byteLength !== manifest.payloadBytes) {
    throw new Error('Folder sync payload bytes do not match')
  }
  if (await sha256Hex(payload) !== manifest.payloadHash) {
    throw new Error('Folder sync content hash does not match the payload')
  }
  const data = parseFolderSyncData(decodeLzStringBase64<unknown>(payload))
  return fromFolderSyncData(manifest.accountScopeId, data)
}

export function fromFolderSyncData(accountScopeId: string, data: FolderSyncData): FolderAccountData {
  const scopeRows = <T>(rows: T[]) => rows.map((row) => ({ ...row, accountScopeId }))
  return parseFolderAccountData({
    accountScopeId,
    folders: scopeRows(data.folders), memberships: scopeRows(data.memberships), chatReferences: scopeRows(data.chatReferences),
  })
}

/** Settings are one LWW register; canonical values break a malformed equal-version tie. */
export function newestSyncSettings<T extends { settings: FolderSyncSettings; settingsVersion: string }>(left: T, right: T): T {
  if (left.settingsVersion !== right.settingsVersion) return left.settingsVersion > right.settingsVersion ? left : right
  return stableStringify(left.settings) >= stableStringify(right.settings) ? left : right
}
