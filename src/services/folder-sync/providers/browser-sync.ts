import { browser } from 'wxt/browser'

import { parseBrowserSyncManifest } from '@/domain/folder/schemas'
import { BROWSER_SYNC_SCHEMA_VERSION, type BrowserSyncManifest, type BrowserSyncUsage, type FolderAccountData, type FolderSyncPublicationRow } from '@/domain/folder/types'
import { decodeAndVerifySyncData, stableStringify } from '../codec'

export const FOLDER_SYNC_BUDGET_BYTES = 70 * 1024
export const CHUNK_TARGET_BYTES = 7_000
const DEFAULT_QUOTA_BYTES = 100 * 1024
const DEFAULT_QUOTA_BYTES_PER_ITEM = 8 * 1024
const DEFAULT_MAX_ITEMS = 512

type SyncAreaWithLimits = typeof browser.storage.sync & {
  QUOTA_BYTES?: number; QUOTA_BYTES_PER_ITEM?: number; MAX_ITEMS?: number
}

export type BrowserSyncReadResult =
  | { status: 'absent'; hasChunks?: true }
  | { status: 'unsupported-schema-version'; schemaVersion: number }
  | { status: 'complete'; manifest: BrowserSyncManifest; data: FolderAccountData }
  | { status: 'incomplete'; manifest: BrowserSyncManifest; missingChunkIndexes: number[] }
  | { status: 'invalid'; code: string; manifest?: BrowserSyncManifest }

export interface BrowserSyncPublishResult {
  projectedFolderBytes: number
  projectedTotalBytes: number
  projectedItemCount: number
  quotaBytes: number
  folderBudgetBytes: number
  usagePercent: number
}

export class BrowserSyncQuotaError extends Error {
  constructor(
    readonly code: 'item-too-large' | 'folder-budget-exceeded' | 'quota-exceeded' | 'max-items-exceeded',
    readonly usage?: BrowserSyncPublishResult,
    readonly currentUsage?: BrowserSyncUsage,
  ) { super(code) }
}

export class BrowserSyncReplicaChangedError extends Error {
  constructor() { super('Browser Sync snapshot changed before publication') }
}

export class BrowserSyncUnsupportedVersionError extends Error {
  constructor(readonly schemaVersion: number) { super('unsupported-schema-version') }
}

function requireScope(accountScopeId: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(accountScopeId)) throw new Error('Invalid Browser Sync account scope')
}

export function folderSyncKeyScope(key: string): string | undefined {
  const match = key.match(/^folders:([A-Za-z0-9_-]{16,128}):(manifest|chunk:(0|[1-9]\d{0,2}))$/u)
  return match && (match[3] === undefined || Number(match[3]) < DEFAULT_MAX_ITEMS) ? match[1] : undefined
}

export function browserSyncManifestKey(accountScopeId: string): string {
  requireScope(accountScopeId)
  return `folders:${accountScopeId}:manifest`
}

export function browserSyncChunkPrefix(accountScopeId: string): string {
  requireScope(accountScopeId)
  return `folders:${accountScopeId}:chunk:`
}

export function browserSyncChunkKey(accountScopeId: string, index: number): string {
  requireScope(accountScopeId)
  if (!Number.isInteger(index) || index < 0 || index >= DEFAULT_MAX_ITEMS) throw new Error('Invalid Browser Sync chunk index')
  return `${browserSyncChunkPrefix(accountScopeId)}${index}`
}

/** Discover future formats without interpreting their version-specific fields. */
function unsupportedVersion(value: unknown, accountScopeId: string): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const envelope = value as Record<string, unknown>
  return envelope.accountScopeId === accountScopeId && typeof envelope.schemaVersion === 'number'
    && Number.isSafeInteger(envelope.schemaVersion) && envelope.schemaVersion > 0 && envelope.schemaVersion !== BROWSER_SYNC_SCHEMA_VERSION
    ? envelope.schemaVersion : undefined
}

function assertSupportedVersion(value: unknown, accountScopeId: string): void {
  const version = unsupportedVersion(value, accountScopeId)
  if (version !== undefined) throw new BrowserSyncUnsupportedVersionError(version)
}

export function storageItemBytes(key: string, value: unknown): number {
  const encoder = new TextEncoder()
  return encoder.encode(key).byteLength + encoder.encode(JSON.stringify(value)).byteLength
}

function syncLimits() {
  const sync = browser.storage.sync as SyncAreaWithLimits
  return { quotaBytes: sync.QUOTA_BYTES ?? DEFAULT_QUOTA_BYTES,
    quotaBytesPerItem: sync.QUOTA_BYTES_PER_ITEM ?? DEFAULT_QUOTA_BYTES_PER_ITEM,
    maxItems: sync.MAX_ITEMS ?? DEFAULT_MAX_ITEMS }
}

export function calculateBrowserSyncUsage(values: Record<string, unknown>): BrowserSyncUsage {
  let folderBytes = 0
  let totalBytes = 0
  for (const [key, value] of Object.entries(values)) {
    const bytes = storageItemBytes(key, value)
    totalBytes += bytes
    if (folderSyncKeyScope(key)) folderBytes += bytes
  }
  return { folderBytes, folderBudgetBytes: FOLDER_SYNC_BUDGET_BYTES, totalBytes,
    quotaBytes: syncLimits().quotaBytes, usagePercent: folderBytes / FOLDER_SYNC_BUDGET_BYTES * 100 }
}

export async function measureBrowserSyncUsage(): Promise<BrowserSyncUsage> {
  return calculateBrowserSyncUsage(await browser.storage.sync.get(null) as Record<string, unknown>)
}

function chunksFor(payload: string, accountScopeId: string, snapshotId: string): string[] {
  const chunks: string[] = []
  const limit = Math.min(CHUNK_TARGET_BYTES, syncLimits().quotaBytesPerItem)
  let cursor = 0
  // LZ-String Base64 is ASCII, so string slices preserve its encoding.
  while (cursor < payload.length) {
    let low = 1
    let high = payload.length - cursor
    let best = 0
    while (low <= high) {
      const length = Math.floor((low + high) / 2)
      if (storageItemBytes(browserSyncChunkKey(accountScopeId, chunks.length),
        { snapshotId, payload: payload.slice(cursor, cursor + length) }) <= limit) {
        best = length; low = length + 1
      } else high = length - 1
    }
    if (!best) throw new BrowserSyncQuotaError('item-too-large')
    chunks.push(payload.slice(cursor, cursor + best))
    cursor += best
  }
  return chunks
}

function parseChunk(value: unknown, snapshotId: string): string | undefined {
  if (typeof value !== 'object' || !value || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  if (Object.keys(entry).length !== 2 || entry.snapshotId !== snapshotId || typeof entry.payload !== 'string') return undefined
  return entry.payload
}

/** Fixed account keys hold one snapshot. Multi-key writes may be temporarily unreadable. */
export class BrowserSyncFolderProvider {
  async read(accountScopeId: string): Promise<BrowserSyncReadResult> {
    const key = browserSyncManifestKey(accountScopeId)
    const first = (await browser.storage.sync.get(key))[key]
    if (first === undefined) {
      const values = await browser.storage.sync.get(null)
      const prefix = browserSyncChunkPrefix(accountScopeId)
      const hasChunks = Object.keys(values).some((entry) => entry.startsWith(prefix) && folderSyncKeyScope(entry) === accountScopeId)
      return hasChunks ? { status: 'absent', hasChunks: true } : { status: 'absent' }
    }
    const version = unsupportedVersion(first, accountScopeId)
    if (version !== undefined) return { status: 'unsupported-schema-version', schemaVersion: version }
    let manifest: BrowserSyncManifest
    try { manifest = parseBrowserSyncManifest(first) }
    catch { return { status: 'invalid', code: 'invalid-manifest' } }
    if (manifest.accountScopeId !== accountScopeId) return { status: 'invalid', code: 'manifest-scope-mismatch' }
    const keys = Array.from({ length: manifest.chunkCount }, (_, index) => browserSyncChunkKey(accountScopeId, index))
    const values = await browser.storage.sync.get(keys)
    const chunks = keys.map((chunkKey) => parseChunk(values[chunkKey], manifest.snapshotId))
    const missingChunkIndexes = chunks.flatMap((value, index) => value === undefined ? [index] : [])
    if (missingChunkIndexes.length) return { status: 'incomplete', manifest, missingChunkIndexes }
    try {
      const data = await decodeAndVerifySyncData(manifest, chunks.join(''))
      // An async hash/decode cannot pin the storage replica. Validate its pointer again.
      const latest = (await browser.storage.sync.get(key))[key]
      const latestVersion = unsupportedVersion(latest, accountScopeId)
      if (latestVersion !== undefined) return { status: 'unsupported-schema-version', schemaVersion: latestVersion }
      if (stableStringify(latest) !== stableStringify(first)) return { status: 'invalid', code: 'replica-changed', manifest }
      return { status: 'complete', manifest, data }
    } catch { return { status: 'invalid', code: 'invalid-payload', manifest } }
  }

  async publish(publication: FolderSyncPublicationRow, onWriting: () => Promise<void>): Promise<BrowserSyncPublishResult> {
    const accountScopeId = publication.accountScopeId
    const key = browserSyncManifestKey(accountScopeId)
    const values = await browser.storage.sync.get(null) as Record<string, unknown>
    assertSupportedVersion(values[key], accountScopeId)
    if (new TextEncoder().encode(publication.payload).byteLength > FOLDER_SYNC_BUDGET_BYTES) {
      throw new BrowserSyncQuotaError('folder-budget-exceeded', undefined, calculateBrowserSyncUsage(values))
    }
    const chunks = chunksFor(publication.payload, accountScopeId, publication.id)
    const manifest = parseBrowserSyncManifest({ schemaVersion: BROWSER_SYNC_SCHEMA_VERSION, accountScopeId, snapshotId: publication.id,
      ...(publication.baseSnapshotId ? { baseSnapshotId: publication.baseSnapshotId } : {}),
      chunkCount: chunks.length, payloadBytes: new TextEncoder().encode(publication.payload).byteLength,
      payloadHash: publication.payloadHash, settings: publication.settings })
    await decodeAndVerifySyncData(manifest, publication.payload)
    const prior = values[key]
    let current: BrowserSyncManifest | undefined
    if (prior !== undefined) {
      try { current = parseBrowserSyncManifest(prior) }
      catch { throw new BrowserSyncReplicaChangedError() }
      if (current.accountScopeId !== accountScopeId) throw new BrowserSyncReplicaChangedError()
    }
    const allowedId = current?.snapshotId === publication.baseSnapshotId || current?.snapshotId === publication.id
    const interruptedOwnWrite = publication.state === 'writing' && (!current || allowedId)
    if (!allowedId && !interruptedOwnWrite) throw new BrowserSyncReplicaChangedError()
    if (!current && publication.baseSnapshotId && !interruptedOwnWrite) throw new BrowserSyncReplicaChangedError()
    // Fresh absent storage is valid only if no old account chunk keys remain.
    const prefix = browserSyncChunkPrefix(accountScopeId)
    const accountChunks = Object.keys(values).filter((entry) => entry.startsWith(prefix) && folderSyncKeyScope(entry) === accountScopeId)
    if (!current && !interruptedOwnWrite && accountChunks.length) throw new BrowserSyncReplicaChangedError()
    const activeKeys = new Set(Array.from({ length: current?.chunkCount ?? chunks.length }, (_, index) => browserSyncChunkKey(accountScopeId, index)))
    for (const chunkKey of accountChunks.filter((key) => activeKeys.has(key))) {
      const value = values[chunkKey]
      const chunkSnapshotId = typeof value === 'object' && value ? (value as Record<string, unknown>).snapshotId : undefined
      if (chunkSnapshotId !== undefined && chunkSnapshotId !== publication.id && chunkSnapshotId !== publication.baseSnapshotId) {
        throw new BrowserSyncReplicaChangedError()
      }
    }
    if (current && publication.state !== 'writing') {
      const active = Array.from({ length: current.chunkCount }, (_, index) => parseChunk(values[browserSyncChunkKey(accountScopeId, index)], current.snapshotId))
      if (active.some((chunk) => chunk === undefined)) throw new BrowserSyncReplicaChangedError()
      try { await decodeAndVerifySyncData(current, active.join('')) }
      catch { throw new BrowserSyncReplicaChangedError() }
    }
    const next: Record<string, unknown> = { [key]: manifest }
    chunks.forEach((payload, index) => { next[browserSyncChunkKey(accountScopeId, index)] = { snapshotId: publication.id, payload } })
    const staleKeys = accountChunks.filter((entry) => !Object.hasOwn(next, entry))
    const projected = { ...values, ...next }
    staleKeys.forEach((entry) => delete projected[entry])
    const usage = calculateBrowserSyncUsage(projected)
    const currentUsage = calculateBrowserSyncUsage(values)
    const limits = syncLimits()
    const result: BrowserSyncPublishResult = { projectedFolderBytes: usage.folderBytes,
      projectedTotalBytes: usage.totalBytes, projectedItemCount: Object.keys(projected).length,
      quotaBytes: limits.quotaBytes, folderBudgetBytes: FOLDER_SYNC_BUDGET_BYTES, usagePercent: usage.usagePercent }
    for (const [entry, value] of Object.entries(next)) {
      if (storageItemBytes(entry, value) > limits.quotaBytesPerItem) throw new BrowserSyncQuotaError('item-too-large', result, currentUsage)
    }
    if (usage.folderBytes > FOLDER_SYNC_BUDGET_BYTES) throw new BrowserSyncQuotaError('folder-budget-exceeded', result, currentUsage)
    if (usage.totalBytes > limits.quotaBytes) throw new BrowserSyncQuotaError('quota-exceeded', result, currentUsage)
    if (result.projectedItemCount > limits.maxItems) throw new BrowserSyncQuotaError('max-items-exceeded', result, currentUsage)
    // All validation and preflight precede both the durable writing marker and destructive cleanup.
    const latest = (await browser.storage.sync.get(key))[key]
    assertSupportedVersion(latest, accountScopeId)
    if (stableStringify(latest) !== stableStringify(prior)) throw new BrowserSyncReplicaChangedError()
    await onWriting()
    const beforeWrite = (await browser.storage.sync.get(key))[key]
    assertSupportedVersion(beforeWrite, accountScopeId)
    if (stableStringify(beforeWrite) !== stableStringify(prior)) throw new BrowserSyncReplicaChangedError()
    if (staleKeys.length) await browser.storage.sync.remove(staleKeys)
    await browser.storage.sync.set(next)
    return result
  }
}
