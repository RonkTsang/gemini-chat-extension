import { browser } from 'wxt/browser'

import { parseBrowserSyncManifest } from '@/domain/folder/schemas'
import type { BrowserSyncManifest, BrowserSyncUsage, FolderAccountData, FolderSettingsRow, FolderSyncGenerationRow, FolderSyncSettings } from '@/domain/folder/types'
import { logDevEvent } from '@/utils/devLogger'
import { decodeAndVerifySyncData, newestSyncSettings } from '../codec'

export const FOLDER_SYNC_BUDGET_BYTES = 70 * 1024
export const CHUNK_TARGET_BYTES = 7_000
const DEFAULT_QUOTA_BYTES = 100 * 1024
const DEFAULT_QUOTA_BYTES_PER_ITEM = 8 * 1024
const DEFAULT_MAX_ITEMS = 512
const LOG_LABEL = '[Folders][sync]'

type SyncAreaWithLimits = typeof browser.storage.sync & {
  QUOTA_BYTES?: number
  QUOTA_BYTES_PER_ITEM?: number
  MAX_ITEMS?: number
}

interface BrowserSyncLimits {
  quotaBytes: number
  quotaBytesPerItem: number
  maxItems: number
}

export type BrowserSyncReadResult =
  | { status: 'absent' }
  | { status: 'complete'; manifest: BrowserSyncManifest; data: FolderAccountData }
  | { status: 'incomplete'; manifest: BrowserSyncManifest; missingChunkIndexes: number[] }
  | { status: 'invalid'; code: string; manifest?: BrowserSyncManifest }

export interface BrowserSyncPublishResult {
  settings: FolderSyncSettings
  settingsVersion: string
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
  ) {
    super(code)
  }
}

export function browserSyncManifestKey(accountScopeId: string): string {
  return `folders:v3:${accountScopeId}:manifest`
}

export function browserSyncChunkKey(accountScopeId: string, generationId: string, index: number): string {
  return `folders:v3:${accountScopeId}:generation:${generationId}:chunk:${index}`
}

export function storageItemBytes(key: string, value: unknown): number {
  const encoder = new TextEncoder()
  return encoder.encode(key).byteLength + encoder.encode(JSON.stringify(value)).byteLength
}

function syncLimits(): BrowserSyncLimits {
  const sync = browser.storage.sync as SyncAreaWithLimits
  return {
    quotaBytes: sync.QUOTA_BYTES ?? DEFAULT_QUOTA_BYTES,
    quotaBytesPerItem: sync.QUOTA_BYTES_PER_ITEM ?? DEFAULT_QUOTA_BYTES_PER_ITEM,
    maxItems: sync.MAX_ITEMS ?? DEFAULT_MAX_ITEMS,
  }
}

function isFolderSyncKey(key: string): boolean {
  return key.startsWith('folders:v3:')
}

/** Counts the exact key and JSON/UTF-8 bytes for either a current or projected snapshot. */
export function calculateBrowserSyncUsage(values: Record<string, unknown>): BrowserSyncUsage {
  let folderBytes = 0
  let totalBytes = 0
  for (const [key, value] of Object.entries(values)) {
    const bytes = storageItemBytes(key, value)
    totalBytes += bytes
    if (isFolderSyncKey(key)) folderBytes += bytes
  }
  return {
    folderBytes,
    folderBudgetBytes: FOLDER_SYNC_BUDGET_BYTES,
    totalBytes,
    quotaBytes: syncLimits().quotaBytes,
    usagePercent: folderBytes / FOLDER_SYNC_BUDGET_BYTES * 100,
  }
}

/** Explicit measurement only; ordinary status queries must not scan Sync storage. */
export async function measureBrowserSyncUsage(): Promise<BrowserSyncUsage> {
  const values = await browser.storage.sync.get(null) as Record<string, unknown>
  return calculateBrowserSyncUsage(values)
}

function chunksFor(value: string, accountScopeId: string, generationId: string, perItemLimit: number): string[] {
  const codePoints = Array.from(value)
  const chunks: string[] = []
  let cursor = 0
  while (cursor < codePoints.length) {
    let low = 1
    let high = codePoints.length - cursor
    let best = 0
    while (low <= high) {
      const count = Math.floor((low + high) / 2)
      const candidate = codePoints.slice(cursor, cursor + count).join('')
      const key = browserSyncChunkKey(accountScopeId, generationId, chunks.length)
      if (storageItemBytes(key, candidate) <= Math.min(CHUNK_TARGET_BYTES, perItemLimit)) {
        best = count
        low = count + 1
      } else {
        high = count - 1
      }
    }
    if (!best) throw new BrowserSyncQuotaError('item-too-large')
    chunks.push(codePoints.slice(cursor, cursor + best).join(''))
    cursor += best
  }
  return chunks
}

function invalid(code: string, manifest?: BrowserSyncManifest): BrowserSyncReadResult {
  return { status: 'invalid', code, ...(manifest ? { manifest } : {}) }
}

function parseManifest(value: unknown): BrowserSyncManifest | undefined {
  if (value === undefined) return undefined
  return parseBrowserSyncManifest(value)
}

function activeChunkKeys(manifest: BrowserSyncManifest): string[] {
  return Array.from({ length: manifest.chunkCount }, (_, index) => browserSyncChunkKey(
    manifest.accountScopeId,
    manifest.generationId,
    index,
  ))
}

/** Browser Sync transport with one active generation and no cloud-confirmation claim. */
export class BrowserSyncFolderProvider {
  async read(accountScopeId: string): Promise<BrowserSyncReadResult> {
    const key = browserSyncManifestKey(accountScopeId)
    let manifest: BrowserSyncManifest | undefined
    try {
      manifest = parseManifest((await browser.storage.sync.get(key) as Record<string, unknown>)[key])
    } catch {
      return invalid('invalid-manifest')
    }
    if (!manifest) return { status: 'absent' }
    if (manifest.accountScopeId !== accountScopeId || manifest.schemaVersion !== 3) return invalid('manifest-scope-mismatch')

    const keys = activeChunkKeys(manifest)
    const stored = await browser.storage.sync.get(keys) as Record<string, unknown>
    const missingChunkIndexes = keys.flatMap((chunkKey, index) => typeof stored[chunkKey] === 'string' ? [] : [index])
    if (missingChunkIndexes.length) return { status: 'incomplete', manifest, missingChunkIndexes }

    try {
      const payload = keys.map((chunkKey) => stored[chunkKey] as string).join('')
      const data = await decodeAndVerifySyncData(manifest, payload)
      return { status: 'complete', manifest, data }
    } catch {
      return invalid('invalid-payload', manifest)
    }
  }

  private preflight(values: Record<string, unknown>, nextEntries: Record<string, unknown>, manifest: BrowserSyncManifest, removedKeys: string[] = []): BrowserSyncPublishResult {
    const limits = syncLimits()
    for (const [key, value] of Object.entries(nextEntries)) {
      if (storageItemBytes(key, value) > limits.quotaBytesPerItem) throw new BrowserSyncQuotaError('item-too-large')
    }
    const projectedValues = { ...values }
    removedKeys.forEach((key) => delete projectedValues[key])
    Object.assign(projectedValues, nextEntries)
    const currentUsage = calculateBrowserSyncUsage(values)
    const usage = calculateBrowserSyncUsage(projectedValues)
    const result: BrowserSyncPublishResult = {
      settings: manifest.settings, settingsVersion: manifest.settingsVersion,
      projectedFolderBytes: usage.folderBytes, projectedTotalBytes: usage.totalBytes,
      projectedItemCount: Object.keys(projectedValues).length,
      quotaBytes: limits.quotaBytes, folderBudgetBytes: FOLDER_SYNC_BUDGET_BYTES, usagePercent: usage.usagePercent,
    }
    if (usage.folderBytes > FOLDER_SYNC_BUDGET_BYTES) throw new BrowserSyncQuotaError('folder-budget-exceeded', result, currentUsage)
    if (usage.totalBytes > limits.quotaBytes) throw new BrowserSyncQuotaError('quota-exceeded', result, currentUsage)
    if (result.projectedItemCount > limits.maxItems) throw new BrowserSyncQuotaError('max-items-exceeded', result, currentUsage)
    return result
  }

  /** Preserve the latest data pointer, including while its chunks are still arriving. */
  async publishSettings(accountScopeId: string, local: FolderSettingsRow): Promise<BrowserSyncPublishResult | undefined> {
    const values = await browser.storage.sync.get(null) as Record<string, unknown>
    const key = browserSyncManifestKey(accountScopeId)
    const current = parseManifest(values[key])
    if (!current) return undefined
    if (current.accountScopeId !== accountScopeId) throw new Error('Manifest account scope does not match')
    const selected = newestSyncSettings(current, {
      ...current, settings: { enabled: local.enabled, hideOrganizedChats: local.hideOrganizedChats }, settingsVersion: local.settingsVersion,
    })
    const nextEntries = { [key]: selected }
    const result = this.preflight(values, nextEntries, selected)
    if (selected !== current) await browser.storage.sync.set(nextEntries)
    return result
  }

  async publish(
    generation: FolderSyncGenerationRow,
    localSettings: FolderSettingsRow,
    replacedGenerationId?: string,
  ): Promise<BrowserSyncPublishResult> {
    const accountScopeId = generation.accountScopeId
    const chunks = chunksFor(generation.payload, accountScopeId, generation.id, syncLimits().quotaBytesPerItem)
    const values = await browser.storage.sync.get(null) as Record<string, unknown>
    const current = parseManifest(values[browserSyncManifestKey(accountScopeId)])
    if (current && current.accountScopeId !== accountScopeId) throw new Error('Manifest account scope does not match')
    if (current?.generationId !== replacedGenerationId) throw new Error('Browser Sync active generation changed before publish')
    const local = {
      settings: { enabled: localSettings.enabled, hideOrganizedChats: localSettings.hideOrganizedChats },
      settingsVersion: localSettings.settingsVersion,
    }
    const selected = current ? newestSyncSettings(local, current) : local
    const manifest: BrowserSyncManifest = parseBrowserSyncManifest({
      schemaVersion: 3, accountScopeId, generationId: generation.id,
      dataRevision: generation.dataRevision, authorityEpoch: generation.syncEpoch,
      chunkCount: chunks.length,
      payloadBytes: new TextEncoder().encode(generation.payload).byteLength,
      payloadHash: generation.payloadHash,
      settings: selected.settings, settingsVersion: selected.settingsVersion,
    })
    await decodeAndVerifySyncData(manifest, generation.payload)
    const nextEntries: Record<string, unknown> = Object.fromEntries(chunks.map((chunk, index) => [
      browserSyncChunkKey(accountScopeId, generation.id, index), chunk,
    ]))
    nextEntries[browserSyncManifestKey(accountScopeId)] = manifest
    const keysToRemove = current ? activeChunkKeys(current) : []
    const result = this.preflight(values, nextEntries, manifest, keysToRemove)
    if (keysToRemove.length) await browser.storage.sync.remove(keysToRemove)
    await browser.storage.sync.set(nextEntries)
    logDevEvent('info', LOG_LABEL, 'browser-sync.publish.accepted', { accountScopeId, generationId: generation.id, chunkCount: chunks.length })
    return result
  }

  /** Reclaims only generations explicitly recorded as locally owned by the repository. */
  async cleanupLocalOrphans(accountScopeId: string, generationIds: string[]): Promise<void> {
    if (!generationIds.length) return
    const values = await browser.storage.sync.get(null) as Record<string, unknown>
    const manifest = (() => {
      try { return parseManifest(values[browserSyncManifestKey(accountScopeId)]) } catch { return undefined }
    })()
    const keys: string[] = []
    for (const generationId of generationIds) {
      if (manifest?.generationId === generationId) continue
      const prefix = `folders:v3:${accountScopeId}:generation:${generationId}:chunk:`
      keys.push(...Object.keys(values).filter((key) => key.startsWith(prefix)))
    }
    if (keys.length) await browser.storage.sync.remove(keys)
  }
}
