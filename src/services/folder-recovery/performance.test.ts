import { data, resetStorage, scopeA, scopeB } from '@/services/folder-sync/test-storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { browser, type Browser } from 'wxt/browser'

import { db } from '@/data/db'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { folderAccessMiddleware, type FolderAccessReport } from '@/data/folder-access'
import { snapshotBytes, snapshotPayloadBytes, toSnapshotSummary } from '@/domain/folder/snapshot'
import type { FolderSnapshotRow } from '@/domain/folder/types'
import type { FolderRpcMethod } from '@/domain/folder/rpc'
import { FolderQueryService } from '@/entrypoints/background/folders/query-service'
import { createFolderRpcHandler } from '@/entrypoints/background/folders/rpc-handler'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { encodeLzStringBase64, sha256Hex } from '@/services/folder-data/codec'
import { observeFolderIndexedDB } from '@/test/folder-idb-observer'
import { readFolderSnapshot, saveFolderSnapshot } from './snapshots'
import { getLocalStorageStatus, pruneRecoveryHistory, SNAPSHOT_BUDGET_BYTES, trimSnapshots } from './storage'

const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'recovery-test' })
const queries = new FolderQueryService()
const scheduler = { requestRun: vi.fn() } as unknown as FolderSyncScheduler
const sender: Browser.runtime.MessageSender = { id: 'test-extension', url: 'https://gemini.google.com/app' }
let native: ReturnType<typeof observeFolderIndexedDB> | undefined
let debug: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await resetStorage()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime('2026-10-19T00:00:00.000Z')
  Object.defineProperty(browser.runtime, 'id', { value: 'test-extension', configurable: true })
  debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { native?.stop(); native = undefined; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })

function save(name: string, reason: FolderSnapshotRow['reason'] = 'automatic', scope = scopeA, hold = false) {
  return saveFolderSnapshot({ accountScopeId: scope, data: data(name) }, `revision:${name}`, reason, {}, hold)
}
function advance(milliseconds = 1000) { vi.setSystemTime(Date.now() + milliseconds) }
function reports(): FolderAccessReport[] {
  return debug.mock.calls.filter(([label]: unknown[]) => label === '[Folders][data-access]')
    .map(([, report]: unknown[]) => JSON.parse(String(report)) as FolderAccessReport)
}
async function rpc(method: FolderRpcMethod, params: unknown = {}) {
  return createFolderRpcHandler(scheduler)({ namespace: 'folders', protocolVersion: 1, requestId: 'recovery-request',
    accountScopeId: scopeA, identitySource: 'observed', method, params }, sender)
}
async function expectPairs(ids?: string[]) {
  const metadata = (await db.folder_snapshots.toArray()).map((row) => row.id).sort()
  expect((await db.folder_snapshot_payloads.toArray()).map((row) => row.id).sort()).toEqual(metadata)
  if (ids) expect(metadata).toEqual([...ids].sort())
}

describe('Recovery metadata and payload boundaries', () => {
  it.each([true, false])('DEV=%s: list, status and release never touch the payload store', async (development) => {
    const point = await save('Held', 'before-delete', scopeA, true)
    advance()
    await save('Other', 'manual', scopeB)
    vi.stubEnv('DEV', development)
    db.close()
    if (!development) db.unuse({ stack: 'dbcore', name: 'FolderAccess' })
    await db.open()
    debug.mockClear()
    native = observeFolderIndexedDB()
    try {
      const listed = await queries.listSnapshots(scopeA, undefined, 10)
      expect(listed.items).toEqual([toSnapshotSummary(point)])
      expect(await getLocalStorageStatus(scopeA)).toMatchObject({ snapshotCount: 1 })
      await repository().releaseSnapshot(scopeA, point.id, point.protectionToken!)
      expect(native.tables.folder_snapshot_payloads).toBeUndefined()
      for (const transaction of native.transactions.keys()) {
        expect(Array.from(transaction.objectStoreNames)).not.toContain('folder_snapshot_payloads')
      }
      expect(JSON.stringify(listed)).not.toMatch(/compressedPayload|contentHash|organizationHash|dataRevision|payloadBytes|protectionToken|protectionLeases/)
      if (!development) expect(debug).not.toHaveBeenCalled()
      else {
        expect(reports().find((report) => report.operation === 'listSnapshots')?.tables.folder_snapshots.records).toBe(1)
        expect(reports().find((report) => report.operation === 'releaseSnapshot')?.tables.folder_snapshots.writes).toBe(1)
      }
    } finally {
      native.stop(); native = undefined
      vi.unstubAllEnvs(); db.close(); db.use(folderAccessMiddleware); await db.open()
    }
  })

  it('returns explicit summary/protection DTOs through the real RPC handler', async () => {
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'PRIVATE-ORGANIZATION-TITLE' })
    native = observeFolderIndexedDB()
    const created = await rpc('createSnapshot')
    expect(created).toMatchObject({ ok: true, data: { folderCount: 1, chatCount: 0, reason: 'manual' } })
    const prepared = await rpc('prepareChatDeletion')
    expect(prepared).toMatchObject({ ok: true, data: { id: expect.any(String), protectionToken: expect.any(String) } })
    if (!prepared || typeof prepared !== 'object' || !('data' in prepared)) throw new Error('Expected a successful protection RPC')
    expect(Object.keys(prepared.data as object).sort()).toEqual(['id', 'protectionToken'])
    const listed = await rpc('listSnapshots', { limit: 10 })
    for (const response of [created, prepared, listed]) {
      expect(JSON.stringify(response)).not.toMatch(/compressedPayload|contentHash|organizationHash|payloadBytes|protectionLeases|PRIVATE-ORGANIZATION-TITLE/)
    }
    expect(native.tables.folder_snapshot_payloads?.records ?? 0).toBe(0)
    expect((await db.folder_snapshots.toArray()).every((row) => !('compressedPayload' in row) && !row.protectionToken)).toBe(true)
  })

  it('sorts by latest grouped time with stable id ties, preserving account isolation across pages', async () => {
    const first = await save('First', 'manual')
    advance()
    const second = await save('Second', 'manual')
    advance()
    await save('Other', 'manual', scopeB)
    const updatedAt = new Date().toISOString()
    await db.folder_snapshots.update(first.id, { updatedAt })
    await db.folder_snapshots.update(second.id, { updatedAt })
    const expected = [first.id, second.id].sort((a, b) => b.localeCompare(a))
    const page = await queries.listSnapshots(scopeA, undefined, 1)
    expect(page.items.map((row) => row.id)).toEqual(expected.slice(0, 1))
    expect((await queries.listSnapshots(scopeA, page.nextCursor, 1)).items.map((row) => row.id)).toEqual(expected.slice(1))
    expect((await repository().listSnapshots(scopeA)).map((row) => row.id)).toEqual(expected)
  })

  it('creates, groups and reuses with zero payload record reads and matches native transaction counts', async () => {
    native = observeFolderIndexedDB()
    const first = await save('First')
    const before = (await db.folder_snapshot_payloads.get(first.id))!.compressedPayload
    native.reset(); debug.mockClear()
    advance()
    const grouped = await save('Changed')
    expect(grouped.id).toBe(first.id)
    expect(native.tables.folder_snapshot_payloads.records).toBe(0)
    expect(native.tables.folder_snapshot_payloads.writes).toBe(1)
    const report = reports().find((entry) => entry.operation === 'saveFolderSnapshot')!
    const transaction = [...native.transactions.values()].find((tables) => tables.folder_snapshot_payloads?.writes === 1)!
    for (const [table, counts] of Object.entries(transaction)) {
      for (const metric of ['records', 'keys', 'writes', 'deleteRequests'] as const) {
        expect(report.tables[table]?.[metric] ?? 0).toBe(counts[metric])
      }
    }
    expect(JSON.stringify(report)).not.toContain(before)
    const after = (await db.folder_snapshot_payloads.get(first.id))!.compressedPayload
    expect(after).not.toBe(before)
    native.reset()
    advance()
    const reused = await save('Changed', 'before-delete', scopeA, true)
    expect(reused.id).toBe(first.id)
    expect(native.tables.folder_snapshot_payloads.records).toBe(0)
    expect(native.tables.folder_snapshot_payloads.writes).toBe(0)
    expect(native.tables.folder_snapshot_payloads.keys).toBe(1)
    await expectPairs([first.id])
  })

  it('production saves have the same database operations and budget with diagnostics removed', async () => {
    async function run() {
      native = observeFolderIndexedDB()
      await save('First')
      advance()
      await save('Changed')
      advance()
      const held = await save('Changed', 'before-delete', scopeA, true)
      await repository().releaseSnapshot(scopeA, held.id, held.protectionToken!)
      const status = await getLocalStorageStatus(scopeA)
      const result = { tables: structuredClone(native.tables), bytes: status.snapshotBytes,
        scopes: [...native.transactions.keys()].map((transaction) => ({ mode: transaction.mode, tables: Array.from(transaction.objectStoreNames) })) }
      native.stop(); native = undefined
      return result
    }
    const development = await run()
    await Promise.all([db.folder_snapshots.clear(), db.folder_snapshot_payloads.clear(), db.folder_recovery_states.clear()])
    vi.setSystemTime('2026-10-19T00:00:00.000Z')
    vi.stubEnv('DEV', false)
    db.close(); db.unuse({ stack: 'dbcore', name: 'FolderAccess' }); await db.open()
    debug.mockClear()
    try {
      expect(await run()).toEqual(development)
      expect(debug).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs(); db.close(); db.use(folderAccessMiddleware); await db.open()
    }
  })

  it('does not reuse a point whose payload is missing or already marked invalid', async () => {
    const first = await save('Missing', 'manual')
    await db.folder_snapshot_payloads.delete(first.id)
    const replacement = await save('Missing', 'before-delete', scopeA, true)
    expect(replacement.id).not.toBe(first.id)
    expect(await db.folder_snapshots.get(first.id)).toMatchObject({ validationState: 'invalid' })
    await db.folder_snapshots.update(replacement.id, { validationState: 'invalid' })
    expect((await save('Missing', 'before-delete', scopeA, true)).id).not.toBe(replacement.id)
  })

  it('rolls back both stores on failed create, group replacement and physical deletion', async () => {
    const failedCreate = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValueOnce(new Error('Metadata failed'))
    await expect(save('Unsaved')).rejects.toThrow('Metadata failed')
    failedCreate.mockRestore()
    await expectPairs([])
    const first = await save('First')
    const original = await db.folder_snapshot_payloads.get(first.id)
    const failedGroup = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValueOnce(new Error('Metadata failed'))
    advance()
    await expect(save('Changed')).rejects.toThrow('Metadata failed')
    failedGroup.mockRestore()
    expect(await db.folder_snapshot_payloads.get(first.id)).toEqual(original)
    const failedDelete = vi.spyOn(db.folder_snapshots, 'bulkDelete').mockRejectedValueOnce(new Error('Delete failed'))
    await expect(db.transaction('rw', db.folder_snapshots, db.folder_snapshot_payloads, () => trimSnapshots(0)))
      .rejects.toThrow('Delete failed')
    failedDelete.mockRestore()
    await expectPairs([first.id])
    await db.transaction('rw', db.folder_snapshots, db.folder_snapshot_payloads, () => trimSnapshots(0))
    await expectPairs([])
  })

  it('quota retry preserves a prior group, rolls back the first body write and commits a matched pair', async () => {
    const first = await save('First')
    advance()
    const put = vi.spyOn(db.folder_snapshots, 'put')
    put.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'))
    const saved = await save('After quota')
    expect(saved.id).toBe(first.id)
    expect(put).toHaveBeenCalledTimes(2)
    await expectPairs([first.id])
    expect((await readFolderSnapshot(scopeA, first.id)).data.folders[0].name).toBe('After quota')
    expect(reports().filter((report) => report.operation === 'saveFolderSnapshot').map((report) => report.result))
      .toEqual(['success', 'rollback', 'success'])
  })

  it('keeps the logical JSON budget exact for UTF-8/escaping and lease metadata changes', async () => {
    const point = await save('预算', 'before-delete', scopeA, true)
    const compressedPayload = '中文\\"\n🙂'
    const row = { ...point, payloadBytes: snapshotPayloadBytes(compressedPayload) }
    const { payloadBytes: _, validationState: __, protectionToken: ___, ...metadata } = row
    const bytes = new TextEncoder().encode(JSON.stringify({ ...metadata, compressedPayload })).byteLength
    expect(snapshotBytes(row)).toBe(bytes)
    await db.folder_snapshots.put({ ...row, protectionToken: undefined })
    const initial = snapshotBytes(row)
    await repository().releaseSnapshot(scopeA, row.id, point.protectionToken!)
    const released = (await db.folder_snapshots.get(row.id))!
    expect(released.payloadBytes).toBe(row.payloadBytes)
    expect(snapshotBytes(released)).toBeLessThan(initial)
    expect((await getLocalStorageStatus(scopeA)).snapshotBytes).toBe(snapshotBytes(released))
  })

  it('enforces the 20 MiB cross-account boundary from metadata and physically deletes expired leased pairs after reopen', async () => {
    const first = await save('A', 'before-delete', scopeA, true)
    advance()
    const second = await save('B', 'before-delete', scopeB, true)
    // Large bodies have already been encoded; sizing metadata isolates retention from codec cost.
    const remaining = SNAPSHOT_BUDGET_BYTES - snapshotBytes(first) - snapshotBytes(second)
    await db.folder_snapshots.update(second.id, { payloadBytes: second.payloadBytes + remaining })
    db.close(); await db.open()
    native = observeFolderIndexedDB()
    expect((await getLocalStorageStatus(scopeA)).snapshotBytes).toBe(SNAPSHOT_BUDGET_BYTES)
    await pruneRecoveryHistory()
    expect(native.tables.folder_snapshot_payloads?.records ?? 0).toBe(0)
    await db.folder_snapshots.update(second.id, { payloadBytes: second.payloadBytes + remaining + 1 })
    await expect(pruneRecoveryHistory()).rejects.toMatchObject({ code: 'SNAPSHOT_BUDGET_EXCEEDED' })
    await expectPairs([first.id, second.id])
    advance(15 * 60_000 + 1)
    db.close(); await db.open()
    native.reset()
    await pruneRecoveryHistory()
    expect(native.tables.folder_snapshot_payloads?.records ?? 0).toBe(0)
    await expectPairs([second.id])
  })

  it.each(['missing', 'hash', 'schema'] as const)('rejects %s corruption at explicit restore and keeps lists body-free afterward', async (corruption) => {
    const point = await save('Target', 'manual')
    if (corruption === 'missing') await db.folder_snapshot_payloads.delete(point.id)
    if (corruption === 'hash') await db.folder_snapshot_payloads.put({ id: point.id, compressedPayload: 'corrupt' })
    if (corruption === 'schema') {
      const compressedPayload = encodeLzStringBase64({ folders: [] })
      await db.folder_snapshot_payloads.put({ id: point.id, compressedPayload })
      await db.folder_snapshots.update(point.id, { contentHash: await sha256Hex(compressedPayload) })
    }
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Keep current' })
    await expect(repo.restoreSnapshot(scopeA, point.id)).rejects.toThrow('integrity')
    expect((await repo.getAccountData(scopeA)).folders.map((folder) => folder.name)).toEqual(['Keep current'])
    native = observeFolderIndexedDB()
    const listed = await queries.listSnapshots(scopeA, undefined, 10)
    expect(listed.items.find((row) => row.id === point.id)).toMatchObject({ validationState: 'invalid', folderCount: undefined })
    expect(native.tables.folder_snapshot_payloads).toBeUndefined()
  })

  it('hashes outside transactions and holds a target against grouping until restore commits', async () => {
    const point = await save('Target')
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Current' })
    const create = repo.createSnapshot.bind(repo)
    const protect = vi.spyOn(repo, 'createSnapshot').mockImplementation(async (...args) => {
      const target = (await db.folder_snapshots.get(point.id))!
      expect(target.protectionLeases).toHaveLength(1)
      expect((await save('Concurrent')).id).not.toBe(point.id)
      return create(...args)
    })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    vi.spyOn(crypto.subtle, 'digest').mockImplementation((...args) => {
      expect(Dexie.currentTransaction).toBeFalsy()
      return digest(...args)
    })
    await repo.restoreSnapshot(scopeA, point.id)
    expect(protect).toHaveBeenCalled()
    expect((await repo.getAccountData(scopeA)).folders[0].name).toBe('Target')
    expect((await db.folder_snapshots.get(point.id))!.protectionLeases).toEqual([])
    await expectPairs()
  })

  it.each(['expired', 'replaced'] as const)('aborts restore without touching current organization if the target is %s before commit', async (failure) => {
    const point = await save('Target', 'manual')
    const repo = repository()
    await repo.createFolder(scopeA, { name: 'Current' })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const targetPayload = (await db.folder_snapshot_payloads.get(point.id))!.compressedPayload
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, bytes) => {
      const result = await digest(algorithm, bytes)
      if (new TextDecoder().decode(bytes as ArrayBuffer) === targetPayload) {
        if (failure === 'expired') advance(15 * 60_000 + 1)
        else await db.folder_snapshots.update(point.id, { contentHash: 'changed-after-read' })
      }
      return result
    })
    await expect(repo.restoreSnapshot(scopeA, point.id)).rejects.toThrow('changed during restore')
    expect((await repo.getAccountData(scopeA)).folders.map((row) => row.name)).toEqual(['Current'])
  })

  it('does not read another account target payload or modify its leases', async () => {
    const point = await save('Other', 'manual', scopeB)
    native = observeFolderIndexedDB()
    await expect(repository().restoreSnapshot(scopeA, point.id)).rejects.toMatchObject({ code: 'SNAPSHOT_PROTECTION_FAILED' })
    expect(native.tables.folder_snapshot_payloads).toBeUndefined()
    expect((await db.folder_snapshots.get(point.id))?.protectionLeases).toBeUndefined()
  })
})
