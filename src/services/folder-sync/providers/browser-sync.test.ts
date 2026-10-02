import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failSet: false,
  quotaBytes: 100_000,
  perItemBytes: 8_192,
  maxItems: 512,
  remove: vi.fn(),
  set: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return Object.fromEntries(state.values)
          const requested = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(requested.map((key) => [key, state.values.get(key)]))
        }),
        set: state.set.mockImplementation(async (values: Record<string, unknown>) => {
          if (state.failSet) throw new Error('set failed')
          Object.entries(values).forEach(([key, value]) => state.values.set(key, value))
        }),
        remove: state.remove.mockImplementation(async (keys: string[]) => keys.forEach((key) => state.values.delete(key))),
        getBytesInUse: vi.fn(),
        get QUOTA_BYTES() { return state.quotaBytes },
        get QUOTA_BYTES_PER_ITEM() { return state.perItemBytes },
        get MAX_ITEMS() { return state.maxItems },
      },
    },
  },
}))

import { encodeLzStringBase64, sha256Hex, decodeLzStringBase64 } from '../codec'
import {
  BrowserSyncFolderProvider,
  BrowserSyncQuotaError,
  FOLDER_SYNC_BUDGET_BYTES,
  browserSyncManifestKey,
  measureBrowserSyncUsage,
  storageItemBytes,
} from './browser-sync'
import type { FolderSyncGenerationRow, FolderSettingsRow, BrowserSyncManifest, FolderSyncData } from '@/domain/folder/types'

const scope = 'account-scope-0001'

const settings: FolderSettingsRow = {
  accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [],
  updatedAt: '2026-01-01T00:00:00.000Z', settingsVersion: '0000000000001:000000:device-a', settingsPending: false,
}

async function generation(revision: string, id = 'generation-1', data: FolderSyncData = { folders: [], memberships: [], chatReferences: [] }): Promise<FolderSyncGenerationRow> {
  const payload = encodeLzStringBase64(data)
  return {
    id, accountScopeId: scope, syncMode: 'browser-sync', syncEpoch: 'epoch-a', dataRevision: revision,
    payloadHash: await sha256Hex(payload), payload, includedOperationIds: [],
    createdAt: '2026-01-01T00:00:00.000Z', state: 'prepared',
  }
}

describe('BrowserSyncFolderProvider', () => {
  beforeEach(() => {
    state.values.clear()
    state.failSet = false
    state.quotaBytes = 100_000
    state.perItemBytes = 8_192
    state.maxItems = 512
    state.remove.mockClear()
    state.set.mockClear()
    vi.mocked(browser.storage.sync.get).mockClear()
  })

  it('writes one V3 active manifest and reads it without a confirmation read-back', async () => {
    const provider = new BrowserSyncFolderProvider()
    const result = await provider.publish(await generation('revision-1', 'generation-1'), settings)
    expect(browser.storage.sync.get).toHaveBeenCalledTimes(1)
    expect(browser.storage.sync.get).toHaveBeenCalledWith(null)
    const actual = await measureBrowserSyncUsage()
    expect(actual.folderBytes).toBe(result.projectedFolderBytes)
    expect(actual.totalBytes).toBe(result.projectedTotalBytes)

    const manifest = state.values.get(browserSyncManifestKey(scope)) as Record<string, unknown>
    expect(manifest).toMatchObject({ schemaVersion: 3, generationId: 'generation-1', dataRevision: 'revision-1' })
    expect(manifest).not.toHaveProperty('previous')
    expect(state.set).toHaveBeenCalledTimes(1)
    await expect(provider.read(scope)).resolves.toMatchObject({ status: 'complete', manifest: { dataRevision: 'revision-1' } })
  })

  it('round-trips multiple ordered chunks within the item byte limit', async () => {
    let seed = 42
    const randomTitle = () => Array.from({ length: 400 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return 'abcdefghijklmnopqrstuvwxyz0123456789'[seed % 36]
    }).join('') + '中文😀'
    const data: FolderSyncData = {
      folders: [], memberships: [],
      chatReferences: Array.from({ length: 100 }, (_, index) => ({
        chatId: `chat-${index}`, cachedTitle: randomTitle(),
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', titleVersionStamp: settings.settingsVersion,
      })),
    }
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-multi', 'generation-multi', data), settings)
    const manifest = state.values.get(browserSyncManifestKey(scope)) as BrowserSyncManifest
    expect(manifest.chunkCount).toBeGreaterThan(1)
    for (const [key, value] of state.values) expect(storageItemBytes(key, value)).toBeLessThan(state.perItemBytes)
    const read = await provider.read(scope)
    expect(read).toMatchObject({ status: 'complete', data: { chatReferences: data.chatReferences.map(row => ({ ...row, accountScopeId: scope })) } })
    const chunk = [...state.values.keys()].find(key => key.includes(':chunk:'))!
    state.values.set(chunk, 'corrupted')
    await expect(provider.read(scope)).resolves.toMatchObject({ status: 'invalid', code: 'invalid-payload', manifest })
  })

  it('updates only Manifest settings while preserving the data pointer and chunks', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-1'), settings)
    const before = new Map(state.values)
    state.set.mockClear()
    state.remove.mockClear()
    await provider.publishSettings(scope, { ...settings, hideOrganizedChats: true, settingsVersion: '0000000000002:000000:device-a' })
    expect(state.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(state.set.mock.calls[0][0])).toEqual([browserSyncManifestKey(scope)])
    expect(state.remove).not.toHaveBeenCalled()
    for (const [key, value] of before) if (key.includes(':chunk:')) expect(state.values.get(key)).toEqual(value)
    expect(state.values.get(browserSyncManifestKey(scope))).toMatchObject({ generationId: 'generation-1', dataRevision: 'revision-1', settings: { hideOrganizedChats: true } })
  })

  it('preserves newer remote settings when publishing a prepared data generation', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-1'), { ...settings, enabled: false, settingsVersion: '0000000000002:000000:remote' })
    await provider.publish(await generation('revision-2', 'generation-2'), settings, 'generation-1')
    expect(state.values.get(browserSyncManifestKey(scope))).toMatchObject({ generationId: 'generation-2', settings: { enabled: false }, settingsVersion: '0000000000002:000000:remote' })
    state.remove.mockClear()
    await expect(provider.publish(await generation('revision-3', 'generation-3'), settings, 'generation-1')).rejects.toThrow('active generation changed')
    expect(state.remove).not.toHaveBeenCalled()
  })

  it('reports missing chunks as incomplete without parsing partial data', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-1', 'generation-1'), settings)
    const chunk = [...state.values.keys()].find((key) => key.includes(':chunk:'))!
    state.values.delete(chunk)
    await expect(provider.read(scope)).resolves.toMatchObject({ status: 'incomplete', missingChunkIndexes: [0] })
  })

  it('reports malformed replicas as invalid instead of falling back to another generation', async () => {
    const provider = new BrowserSyncFolderProvider()
    state.values.set(browserSyncManifestKey(scope), { schemaVersion: 3, accountScopeId: scope })
    await expect(provider.read(scope)).resolves.toEqual({ status: 'invalid', code: 'invalid-manifest' })
  })

  it('checks UTF-8 storage item bytes rather than string length', () => {
    expect(storageItemBytes('鍵', '😀')).toBeGreaterThan('鍵'.length + '😀'.length)
  })

  it('measures all actual V3 Folder keys including other scopes and orphans, with exact UTF-8/JSON bytes', async () => {
    state.values.set('folders:v3:another-scope:generation:orphan:chunk:0', '😀\\"\n')
    state.values.set('folders:v3:local-scope:manifest', { text: '中文' })
    state.values.set('other-setting', 'not Folder data')
    const folderBytes = [...state.values.entries()].filter(([key]) => key.startsWith('folders:v3:'))
      .reduce((total, [key, value]) => total + storageItemBytes(key, value), 0)
    const totalBytes = [...state.values.entries()].reduce((total, [key, value]) => total + storageItemBytes(key, value), 0)
    await expect(measureBrowserSyncUsage()).resolves.toEqual({
      folderBytes, totalBytes, folderBudgetBytes: FOLDER_SYNC_BUDGET_BYTES, quotaBytes: state.quotaBytes,
      usagePercent: folderBytes / FOLDER_SYNC_BUDGET_BYTES * 100,
    })
    expect(browser.storage.sync.get).toHaveBeenCalledExactlyOnceWith(null)
    expect(state.set).not.toHaveBeenCalled()
    expect(state.remove).not.toHaveBeenCalled()
  })

  it('includes both current and projected usage in rejected preflight without mutating storage', async () => {
    const provider = new BrowserSyncFolderProvider()
    state.values.set('other-setting', 'outside Folders')
    state.quotaBytes = 1
    const before = Object.fromEntries(state.values)
    try {
      await provider.publish(await generation('revision-1', 'generation-1'), settings)
      expect.fail('Expected quota preflight to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(BrowserSyncQuotaError)
      const quotaError = error as BrowserSyncQuotaError
      expect(quotaError.currentUsage?.folderBytes).toBe(0)
      expect(quotaError.currentUsage?.totalBytes).toBe(storageItemBytes('other-setting', 'outside Folders'))
      expect(quotaError.usage?.projectedFolderBytes).toBeGreaterThan(0)
    }
    expect(Object.fromEntries(state.values)).toEqual(before)
    expect(state.set).not.toHaveBeenCalled()
    expect(state.remove).not.toHaveBeenCalled()
  })

  it('does not remove old chunks when the exact quota preflight fails', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-1', 'generation-1'), settings)
    state.quotaBytes = 1
    await expect(provider.publish(await generation('revision-2', 'generation-2'), settings, 'generation-1')).rejects.toThrow('quota-exceeded')
    expect(state.remove).toHaveBeenCalledTimes(0)
    expect(state.set).toHaveBeenCalledTimes(1)
  })

  it('keeps the prepared generation reusable after chunks were removed and set failed', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await generation('revision-1', 'generation-1'), settings)
    state.failSet = true
    await expect(provider.publish(await generation('revision-2', 'generation-2'), settings, 'generation-1')).rejects.toThrow('set failed')
    expect(state.remove).toHaveBeenCalledTimes(1)
    state.failSet = false
    await provider.publish(await generation('revision-2', 'generation-2'), settings, 'generation-1')
    await expect(provider.read(scope)).resolves.toMatchObject({ status: 'complete', manifest: { dataRevision: 'revision-2' } })
  })
})
