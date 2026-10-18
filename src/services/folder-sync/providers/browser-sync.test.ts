import { storage, scopeA, scopeB, publication, data, emptyData, resetStorage } from '../test-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { BrowserSyncFolderProvider, BrowserSyncQuotaError, BrowserSyncUnsupportedVersionError, browserSyncManifestKey, browserSyncChunkKey,
  calculateBrowserSyncUsage, storageItemBytes, folderSyncKeyScope } from './browser-sync'
import { sha256Hex, encodeLzStringBase64 } from '../codec'
import type { BrowserSyncManifest } from '@/domain/folder/types'

const provider = () => new BrowserSyncFolderProvider()
const writing = async () => undefined
beforeEach(resetStorage)

describe('fixed account snapshot transport', () => {
  it('keeps account keys independent of the payload version and validates chunk indexes consistently', () => {
    expect(browserSyncManifestKey(scopeA)).toBe(`folders:${scopeA}:manifest`)
    expect(browserSyncChunkKey(scopeA, 511)).toBe(`folders:${scopeA}:chunk:511`)
    expect(folderSyncKeyScope(browserSyncChunkKey(scopeA, 511))).toBe(scopeA)
    for (const suffix of ['-1', '01', '512', '1.5']) expect(folderSyncKeyScope(`folders:${scopeA}:chunk:${suffix}`)).toBeUndefined()
    expect(folderSyncKeyScope(`folders:v4:${scopeA}:manifest`)).toBeUndefined()
  })

  it('protects an unsupported manifest before decoding chunks or starting a publication', async () => {
    const key = browserSyncManifestKey(scopeA)
    storage.values.set(key, { schemaVersion: 5, accountScopeId: scopeA, futureFormat: 'opaque' })
    storage.values.set(browserSyncChunkKey(scopeA, 0), { opaque: 'future payload' })
    const before = [...storage.values]
    expect(await provider().read(scopeA)).toEqual({ status: 'unsupported-schema-version', schemaVersion: 5 })
    const marker = vi.fn(writing)
    const pending = await publication('pending')
    pending.state = 'writing'
    await expect(provider().publish(pending, marker)).rejects.toBeInstanceOf(BrowserSyncUnsupportedVersionError)
    expect(marker).not.toHaveBeenCalled()
    expect([...storage.values]).toEqual(before)
  })

  it('protects a future manifest that arrives during publication preflight', async () => {
    const pending = await publication('pending')
    const key = browserSyncManifestKey(scopeA)
    vi.spyOn(browser.storage.sync, 'get').mockImplementation(async (keys) => {
      if (keys === key) storage.values.set(key, { accountScopeId: scopeA, schemaVersion: 5 })
      return keys === null ? Object.fromEntries(storage.values)
        : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((entry) => [entry, storage.values.get(entry as string)]))
    })
    const marker = vi.fn(writing)
    await expect(provider().publish(pending, marker)).rejects.toBeInstanceOf(BrowserSyncUnsupportedVersionError)
    expect(marker).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(1)
  })

  it('rechecks unknown formats after persisting the writing marker, before destructive storage writes', async () => {
    const key = browserSyncManifestKey(scopeA)
    await expect(provider().publish(await publication('pending'), async () => {
      storage.values.set(key, { accountScopeId: scopeA, schemaVersion: 5 })
    })).rejects.toBeInstanceOf(BrowserSyncUnsupportedVersionError)
    expect(storage.values.get(key)).toEqual({ accountScopeId: scopeA, schemaVersion: 5 })
    expect(storage.values.size).toBe(1)
  })

  it('round trips valid empty snapshots and full settings, distinct from absent storage', async () => {
    expect(await provider().read(scopeA)).toEqual({ status: 'absent' })
    const next = await publication('empty')
    next.settings = { enabled: false, hideOrganizedChats: true }
    const result = await provider().publish(next, writing)
    expect(await provider().read(scopeA)).toMatchObject({ status: 'complete', data: { folders: [], memberships: [] }, manifest: { schemaVersion: 4, snapshotId: 'empty', settings: next.settings } })
    expect(result.projectedFolderBytes).toBe(calculateBrowserSyncUsage(Object.fromEntries(storage.values)).folderBytes)
    expect(storage.values.size).toBe(2)
  })

  it.each(['missing', 'mixed', 'corrupt', 'hash', 'bytes', 'scope', 'tree', 'reference', 'unknown-field'])('rejects %s input', async (mode) => {
    await provider().publish(await publication('first', data('First')), writing)
    const key = browserSyncManifestKey(scopeA)
    const manifest = storage.values.get(key) as BrowserSyncManifest
    if (mode === 'missing') storage.values.delete(browserSyncChunkKey(scopeA, 0))
    if (mode === 'mixed') storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'other', payload: 'x' })
    if (mode === 'corrupt') storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'first', payload: 'x' })
    if (mode === 'hash') storage.values.set(key, { ...manifest, payloadHash: '0'.repeat(64) })
    if (mode === 'bytes') storage.values.set(key, { ...manifest, payloadBytes: 1 })
    if (mode === 'scope') storage.values.set(key, { ...manifest, accountScopeId: scopeB })
    if (['tree', 'reference', 'unknown-field'].includes(mode)) {
      const value = data('Bad')
      if (mode === 'tree') value.folders[0].parentFolderId = 'missing'
      if (mode === 'reference') value.chatReferences.push({ chatId: 'unused', cachedTitle: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
      const payload = encodeLzStringBase64(mode === 'unknown-field' ? { ...value, accountScopeId: scopeB } : value)
      storage.values.set(key, { ...manifest, payloadBytes: payload.length, payloadHash: await sha256Hex(payload) })
      storage.values.set(browserSyncChunkKey(scopeA, 0), { snapshotId: 'first', payload })
    }
    expect((await provider().read(scopeA)).status).toBe(['missing', 'mixed'].includes(mode) ? 'incomplete' : 'invalid')
  })

  it('isolates settings and cleanup across accounts and shrinks fixed keys without generation history', async () => {
    const large = emptyData.folders.concat(Array.from({ length: 220 }, (_, i) => data(`Folder ${i} ${crypto.randomUUID()}`, `id-${i}`).folders[0]))
    await provider().publish(await publication('large', { ...emptyData, folders: large }), writing)
    await provider().publish(await publication('foreign', data('Foreign', 'foreign'), scopeB), writing)
    const foreign = [...storage.values].filter(([key]) => folderSyncKeyScope(key) === scopeB)
    expect([...storage.values.keys()].filter((key) => folderSyncKeyScope(key) === scopeA).length).toBeGreaterThan(2)
    let base = 'large'
    for (let index = 0; index < 30; index += 1) {
      const id = `small-${index}`
      await provider().publish(await publication(id, emptyData, scopeA, base), writing); base = id
    }
    expect([...storage.values].filter(([key]) => folderSyncKeyScope(key) === scopeB)).toEqual(foreign)
    expect([...storage.values.keys()].filter((key) => folderSyncKeyScope(key) === scopeA)).toHaveLength(2)
  })

  it.each(['folder', 'browser', 'item', 'items'])('preflights %s quota before destructive cleanup', async (limit) => {
    await provider().publish(await publication('initial', data('Initial')), writing)
    storage.values.set('unrelated', 'x'.repeat(1000))
    storage.values.set(browserSyncChunkKey(scopeA, 19), { snapshotId: 'initial', payload: 'old' })
    const next = await publication('next', data('New'), scopeA, 'initial')
    if (limit === 'folder') storage.values.set(browserSyncManifestKey(scopeB), 'x'.repeat(72 * 1024))
    if (limit === 'browser') storage.quotaBytes = 1000
    if (limit === 'item') storage.perItemBytes = 80
    if (limit === 'items') storage.maxItems = 1
    const before = [...storage.values]
    const marker = vi.fn(writing)
    await expect(provider().publish(next, marker)).rejects.toBeInstanceOf(BrowserSyncQuotaError)
    expect(marker).not.toHaveBeenCalled()
    expect([...storage.values]).toEqual(before)
  })

  it('counts UTF8 keys, chunk envelopes, all scopes and unrelated extension bytes', () => {
    const values = { [browserSyncChunkKey(scopeA, 0)]: { snapshotId: 'a', payload: '你好' }, [browserSyncManifestKey(scopeB)]: { foo: 'bar' }, unrelated: 'other' }
    const result = calculateBrowserSyncUsage(values)
    expect(result.totalBytes).toBe(Object.entries(values).reduce((sum, [key, value]) => sum + storageItemBytes(key, value), 0))
    expect(result.totalBytes - result.folderBytes).toBe(storageItemBytes('unrelated', 'other'))
  })

  it('detects a manifest change between reading chunks and finishing verification', async () => {
    await provider().publish(await publication('a'), writing)
    vi.spyOn(browser.storage.sync, 'get').mockImplementation(async (keys) => {
      const result = keys === null ? Object.fromEntries(storage.values)
        : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, storage.values.get(key)]))
      if (Array.isArray(keys)) storage.values.set(browserSyncManifestKey(scopeA), { ...(storage.values.get(browserSyncManifestKey(scopeA)) as BrowserSyncManifest), snapshotId: 'b' })
      return result
    })
    expect(await provider().read(scopeA)).toMatchObject({ status: 'invalid', code: 'replica-changed' })
  })
})

it('classifies an oversized valid compressed snapshot as Folder quota before creating chunks or writing keys', async () => {
  const folders = Array.from({ length: 3000 }, (_, index) => data(crypto.randomUUID(), `random-${index}`).folders[0])
  const next = await publication('too-large', { ...emptyData, folders })
  expect(next.payload.length).toBeGreaterThan(70 * 1024)
  const marker = vi.fn(writing)
  await expect(provider().publish(next, marker)).rejects.toMatchObject({ code: 'folder-budget-exceeded' })
  expect(marker).not.toHaveBeenCalled()
  expect(storage.values.size).toBe(0)
})

it('reclaims obsolete foreign tail keys beyond the current manifest without blocking publication', async () => {
  await provider().publish(await publication('base', data('Base')), writing)
  storage.values.set(browserSyncChunkKey(scopeA, 8), { snapshotId: 'obsolete-tail', payload: 'stale' })
  await provider().publish(await publication('next', emptyData, scopeA, 'base'), writing)
  expect(storage.values.has(browserSyncChunkKey(scopeA, 8))).toBe(false)
  expect(storage.values.size).toBe(2)
})
