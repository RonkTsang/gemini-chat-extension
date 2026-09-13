import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'

import { parseFolderSyncEnvelope } from '@/domain/folder/schemas'
import type { FolderSyncEnvelope } from '@/domain/folder/types'
import { decodeAndVerifyEnvelopePayload, stableStringify } from '../codec'

const CHUNK_TARGET_BYTES = 7_000
const DEFAULT_QUOTA_BYTES = 100_000

interface BrowserSyncGeneration {
  generation: string
  chunkCount: number
  dataRevision: string
  contentHash: string
}

interface BrowserSyncManifest {
  active: BrowserSyncGeneration
  previous?: BrowserSyncGeneration
}

export interface BrowserSyncPublishResult {
  usedBytes: number
  quotaBytes: number
  warning: 'near-quota' | undefined
}

function manifestKey(accountScopeId: string): string {
  return `folders:${accountScopeId}:manifest`
}

function chunkKey(accountScopeId: string, generation: string, index: number): string {
  return `folders:${accountScopeId}:${generation}:chunk:${index}`
}

function splitChunks(value: string): string[] {
  return Array.from(
    { length: Math.ceil(value.length / CHUNK_TARGET_BYTES) },
    (_, index) => value.slice(index * CHUNK_TARGET_BYTES, (index + 1) * CHUNK_TARGET_BYTES),
  )
}

function parseManifest(value: unknown): BrowserSyncManifest | undefined {
  if (!value || typeof value !== 'object') return undefined
  const manifest = value as Partial<BrowserSyncManifest>
  const isGeneration = (candidate: unknown): candidate is BrowserSyncGeneration => {
    if (!candidate || typeof candidate !== 'object') return false
    const entry = candidate as Partial<BrowserSyncGeneration>
    return typeof entry.generation === 'string'
      && typeof entry.chunkCount === 'number'
      && Number.isInteger(entry.chunkCount)
      && entry.chunkCount > 0
      && typeof entry.dataRevision === 'string'
      && typeof entry.contentHash === 'string'
  }
  if (!isGeneration(manifest.active)) return undefined
  if (manifest.previous !== undefined && !isGeneration(manifest.previous)) return undefined
  return { active: manifest.active, previous: manifest.previous }
}

async function readGeneration(accountScopeId: string, descriptor: BrowserSyncGeneration): Promise<FolderSyncEnvelope> {
  const keys = Array.from({ length: descriptor.chunkCount }, (_, index) => chunkKey(accountScopeId, descriptor.generation, index))
  const stored = await browser.storage.sync.get(keys) as Record<string, unknown>
  if (keys.some((key) => typeof stored[key] !== 'string')) {
    throw new Error('Browser Sync generation is incomplete')
  }
  const serialized = keys.map((key) => stored[key]).join('')
  const envelope = parseFolderSyncEnvelope(JSON.parse(serialized))
  if (envelope.accountScopeId !== accountScopeId || envelope.dataRevision !== descriptor.dataRevision || envelope.contentHash !== descriptor.contentHash) {
    throw new Error('Browser Sync manifest does not match its generation')
  }
  await decodeAndVerifyEnvelopePayload(envelope)
  return envelope
}

function quotaBytes(): number {
  const sync = browser.storage.sync as typeof browser.storage.sync & { QUOTA_BYTES?: number }
  return sync.QUOTA_BYTES ?? DEFAULT_QUOTA_BYTES
}

function generationKeys(accountScopeId: string, generation: string, chunkCount: number): string[] {
  return Array.from({ length: chunkCount }, (_, index) => chunkKey(accountScopeId, generation, index))
}

/**
 * Immutable-generation Browser Sync transport. It writes and verifies every
 * chunk before atomically switching the small manifest, retaining one complete
 * previous generation for a read fallback.
 */
export class BrowserSyncFolderProvider {
  async publish(envelope: FolderSyncEnvelope, generationId = nanoid()): Promise<BrowserSyncPublishResult> {
    const accountScopeId = envelope.accountScopeId
    const generation = generationId
    const chunks = splitChunks(stableStringify(envelope))
    const rawManifest = await browser.storage.sync.get(manifestKey(accountScopeId)) as Record<string, unknown>
    const existing = parseManifest(rawManifest[manifestKey(accountScopeId)])
    const descriptor: BrowserSyncGeneration = {
      generation,
      chunkCount: chunks.length,
      dataRevision: envelope.dataRevision,
      contentHash: envelope.contentHash,
    }
    const entries = Object.fromEntries(chunks.map((chunk, index) => [chunkKey(accountScopeId, generation, index), chunk]))
    const usedBytes = await browser.storage.sync.getBytesInUse(null)
    const estimatedWriteBytes = Object.entries(entries).reduce((total, [key, value]) => total + key.length + value.length, 0)
    const quota = quotaBytes()
    if (usedBytes + estimatedWriteBytes > quota) {
      throw new Error('Browser Sync does not have enough peak storage for a safe generation write')
    }

    try {
      await browser.storage.sync.set(entries)
      await readGeneration(accountScopeId, descriptor)
      const manifest: BrowserSyncManifest = { active: descriptor, previous: existing?.active }
      await browser.storage.sync.set({ [manifestKey(accountScopeId)]: manifest })

      // A concurrent Browser Sync write may supersede us after set() resolves.
      // Do not mark this local generation accepted unless it is still visible
      // through the manifest.
      const committed = parseManifest((await browser.storage.sync.get(manifestKey(accountScopeId)) as Record<string, unknown>)[manifestKey(accountScopeId)])
      if (committed?.active.generation !== generation) {
        throw new Error('Browser Sync generation was superseded before manifest verification')
      }
      await this.cleanupLocalOrphans(accountScopeId, envelope.generatedByDeviceId)
    } catch (error) {
      // Chunk writes precede the manifest switch. If the switch (or its
      // verification) failed, remove only this unreferenced generation; the
      // prior active/previous pair remains untouched.
      await this.removeGenerationIfUnreferenced(accountScopeId, descriptor)
      throw error
    }
    const finalUsedBytes = await browser.storage.sync.getBytesInUse(null)
    return {
      usedBytes: finalUsedBytes,
      quotaBytes: quota,
      warning: finalUsedBytes >= quota * 0.6 ? 'near-quota' : undefined,
    }
  }

  async read(accountScopeId: string): Promise<FolderSyncEnvelope | undefined> {
    const raw = await browser.storage.sync.get(manifestKey(accountScopeId)) as Record<string, unknown>
    const manifest = parseManifest(raw[manifestKey(accountScopeId)])
    if (!manifest) return undefined
    try {
      return await readGeneration(accountScopeId, manifest.active)
    } catch (error) {
      if (!manifest.previous) throw error
      return await readGeneration(accountScopeId, manifest.previous)
    }
  }

  /** Reclaims stale generations produced by this installation only. */
  async cleanupLocalOrphans(accountScopeId: string, deviceId: string): Promise<void> {
    try {
      const values = await browser.storage.sync.get(null) as Record<string, unknown>
      const manifest = parseManifest(values[manifestKey(accountScopeId)])
      const retained = new Set([manifest?.active.generation, manifest?.previous?.generation])
      const keyPattern = new RegExp(`^folders:${accountScopeId}:([^:]+):chunk:(\\d+)$`, 'u')
      const candidates = new Map<string, string[]>()
      for (const [key, value] of Object.entries(values)) {
        const match = key.match(keyPattern)
        if (!match || retained.has(match[1])) continue
        // Metadata appears before the compressed payload, including when the
        // envelope has multiple chunks. This prevents one device from deleting
        // another device's in-flight generation.
        if (typeof value !== 'string' || !value.includes(`\"generatedByDeviceId\":\"${deviceId}\"`)) continue
        candidates.set(match[1], [...(candidates.get(match[1]) ?? []), key])
      }
      const candidateKeys = [...candidates.values()]
      if (candidateKeys.length === 0) return
      const results = await Promise.allSettled(candidateKeys.map((keys) => browser.storage.sync.remove(keys)))
      const removedGenerations = results.filter((result) => result.status === 'fulfilled').length
      const removedChunks = candidateKeys
        .filter((_, index) => results[index].status === 'fulfilled')
        .reduce((total, keys) => total + keys.length, 0)
      console.info('[Folders][sync] reclaimed local orphan generations', {
        accountScopeId,
        removedGenerations,
        removedChunks,
      })
    } catch {
      // Cleanup is recoverable. A later successful sync retries it.
    }
  }

  private async removeGenerationIfUnreferenced(
    accountScopeId: string,
    descriptor: BrowserSyncGeneration,
  ): Promise<void> {
    try {
      const manifest = parseManifest((await browser.storage.sync.get(manifestKey(accountScopeId)) as Record<string, unknown>)[manifestKey(accountScopeId)])
      if (manifest?.active.generation === descriptor.generation || manifest?.previous?.generation === descriptor.generation) return
      await browser.storage.sync.remove(generationKeys(accountScopeId, descriptor.generation, descriptor.chunkCount))
    } catch {
      // Preserve the original publish failure. The next successful sync can
      // recover any chunks that remain.
    }
  }
}
