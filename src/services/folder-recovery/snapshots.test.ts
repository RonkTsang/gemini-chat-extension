import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const permission = vi.hoisted(() => ({ unlimited: false }))
vi.mock('wxt/browser', () => ({ browser: { permissions: { contains: vi.fn(async () => permission.unlimited) } } }))

import { db } from '@/data/db'
import type { FolderExportPayload, FolderSnapshotRow } from '@/domain/folder/types'
import { saveFolderSnapshot } from './snapshots'
import { getLocalStorageStatus, snapshotBytes, trimSnapshots } from './storage'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'

const scope = 'account-scope-0001'
const initialTime = Date.parse('2026-01-01T00:00:00.000Z')
const ample = {}
function payload(name: string, accountScopeId = scope): FolderExportPayload {
  const timestamp = new Date().toISOString()
  const stamp = '0000000000000:000000:test'
  return {
    schemaVersion: 1, accountScopeId, exportedAt: timestamp,
    settings: { enabled: true, hideOrganizedChats: false }, settingsVersion: stamp,
    folders: [{ id: 'folder-1', accountScopeId, parentFolderId: '__root__', name, iconKey: 'folder', colorValue: '#4285F4',
      orderKey: 'a', createdAt: timestamp, updatedAt: timestamp, versionStamp: stamp,
      fieldVersions: { name: stamp, iconKey: stamp, colorValue: stamp, position: stamp } }],
    memberships: [], chatReferences: [],
  }
}
function advance(milliseconds: number) { vi.setSystemTime(Date.now() + milliseconds) }

describe('Folder restore point policy', () => {
  beforeEach(async () => {
    permission.unlimited = false
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(initialTime)
    await db.folder_snapshots.clear()
    await db.folder_recovery_states.clear()
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('summarizes only the current account and uses the latest grouped update time', async () => {
    expect(await getLocalStorageStatus(scope)).toMatchObject({ snapshotCount: 0, lastSnapshotAt: undefined })
    await saveFolderSnapshot(payload('Manual'), 'rev-0', 'manual', ample)
    advance(1000)
    await saveFolderSnapshot(payload('Automatic'), 'rev-1', 'automatic', ample)
    advance(1000)
    const grouped = await saveFolderSnapshot(payload('Updated automatic'), 'rev-2', 'automatic', ample)
    const lastSnapshotAt = grouped.updatedAt ?? grouped.createdAt
    advance(1000)
    await saveFolderSnapshot(payload('Other account', 'account-scope-0002'), 'rev-other', 'manual', ample)
    const status = await getLocalStorageStatus(scope)
    expect(status).toMatchObject({ snapshotCount: 2, lastSnapshotAt })
    const allRows = await db.folder_snapshots.toArray()
    expect(status.snapshotBytes).toBe(allRows.reduce((total, row) => total + snapshotBytes(row), 0))
  })

  it('groups adjacent changes, caps each group at five minutes, and survives a new caller', async () => {
    const first = await saveFolderSnapshot(payload('0'), 'rev-0', 'automatic', ample)
    for (let index = 1; index < 5; index += 1) {
      advance(60_000)
      expect((await saveFolderSnapshot(payload(String(index)), `rev-${index}`, 'automatic', ample)).id).toBe(first.id)
    }
    advance(60_000)
    const next = await saveFolderSnapshot(payload('5'), 'rev-5', 'automatic', ample)
    expect(next.id).not.toBe(first.id)
    advance(60_001)
    expect((await saveFolderSnapshot(payload('6'), 'rev-6', 'automatic', ample)).id).not.toBe(next.id)
    expect(await db.folder_snapshots.count()).toBe(3)
  })

  it('updates organization counts when an automatic group is replaced', async () => {
    const first = await saveFolderSnapshot(payload('First'), 'rev-0', 'automatic', ample)
    expect(first).toMatchObject({ folderCount: 1, chatCount: 0 })
    const nextPayload = payload('First')
    nextPayload.folders.push({ ...nextPayload.folders[0], id: 'folder-2', name: 'Second' })
    advance(1000)
    const grouped = await saveFolderSnapshot(nextPayload, 'rev-1', 'automatic', ample)
    expect(grouped).toMatchObject({ id: first.id, folderCount: 2, chatCount: 0 })
    expect(await db.folder_snapshots.get(first.id)).toMatchObject({ folderCount: 2, chatCount: 0 })
  })

  it('deduplicates organization independently of timestamps, settings and logical versions; manual points end groups', async () => {
    const first = await saveFolderSnapshot(payload('A'), 'rev-0', 'automatic', ample)
    advance(1000)
    const same = payload('A')
    same.settings.enabled = false
    same.folders[0].versionStamp = '0000000000001:000001:other'
    const manual = await saveFolderSnapshot(same, 'rev-1', 'manual', ample)
    expect(manual.id).toBe(first.id)
    expect(manual.reasons).toEqual(['automatic', 'manual'])
    const frozen = await db.folder_snapshots.get(manual.id)
    advance(1000)
    const next = await saveFolderSnapshot(payload('B'), 'rev-2', 'automatic', ample)
    expect(next.id).not.toBe(first.id)
    expect((await db.folder_snapshots.get(first.id))?.compressedPayload).toBe(frozen?.compressedPayload)
    expect(await db.folder_snapshots.count()).toBe(2)
  })

  it('keeps three recent important points and fills the remaining ten slots with newest history without age expiry', async () => {
    const important: string[] = []
    for (let index = 0; index < 3; index += 1) {
      important.push((await saveFolderSnapshot(payload(`Manual ${index}`), 'rev', 'manual', ample)).id)
      advance(1000)
    }
    advance(365 * 24 * 60 * 60_000)
    const automatic: string[] = []
    for (let index = 0; index < 12; index += 1) {
      automatic.push((await saveFolderSnapshot(payload(`Auto ${index}`), 'rev', 'automatic', ample)).id)
      advance(60_001)
    }
    const retained = new Set((await db.folder_snapshots.toArray()).map((row) => row.id))
    expect(retained.size).toBe(10)
    for (const id of [...important, ...automatic.slice(-7)]) expect(retained.has(id)).toBe(true)
    for (const id of automatic.slice(0, -7)) expect(retained.has(id)).toBe(false)
  })

  it('enforces one budget across accounts, evicting ordinary history before important points', async () => {
    const important = await saveFolderSnapshot(payload('Manual'), 'rev', 'manual', ample)
    advance(1000)
    await saveFolderSnapshot(payload('Other account', 'account-scope-0002'), 'rev', 'automatic', ample)
    advance(60_001)
    const candidate = await saveFolderSnapshot(payload('New'), 'rev', 'automatic', ample)
    const budget = snapshotBytes(important) + snapshotBytes(candidate) + 30
    await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(budget, [candidate.id]))
    const rows = await db.folder_snapshots.toArray()
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([important.id, candidate.id]))
    expect(rows.reduce((sum, row) => sum + snapshotBytes(row), 0)).toBeLessThanOrEqual(budget)
    expect(rows).toHaveLength(2)
  })

  it('reclaims only the required space instead of clearing all eligible history', async () => {
    const points: FolderSnapshotRow[] = []
    for (let index = 0; index < 5; index += 1) {
      points.push(await saveFolderSnapshot(payload(`Point ${index}`), 'rev', 'automatic', ample))
      advance(60_001)
    }
    await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(20 * 1024 * 1024, [points[4].id], snapshotBytes(points[0])))
    const retained = (await db.folder_snapshots.toArray()).map((row) => row.id)
    expect(retained).toHaveLength(4)
    expect(retained).not.toContain(points[0].id)
    expect(retained).toEqual(expect.arrayContaining(points.slice(1).map((row) => row.id)))
  })

  it('preserves in-flight points across accounts and independent leases, which expire after worker loss', async () => {
    const first = await saveFolderSnapshot(payload('Protected'), 'rev', 'before-import', ample, true)
    const second = await saveFolderSnapshot(payload('Protected'), 'rev', 'before-delete', ample, true)
    expect(second.id).toBe(first.id)
    const repository = new FolderRepositoryImpl({ getDeviceId: async () => 'test-device' })
    await repository.releaseSnapshot(scope, first.id, first.protectionToken!)
    expect((await db.folder_snapshots.get(first.id))?.protectionLeases).toHaveLength(1)
    await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(1024 * 1024, [], Number.POSITIVE_INFINITY))
    expect(await db.folder_snapshots.get(first.id)).toBeDefined()
    advance(15 * 60_000 + 1)
    await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(1024 * 1024, [], Number.POSITIVE_INFINITY))
    expect(await db.folder_snapshots.count()).toBe(0)
  })

  it('rejects an oversized single point without removing existing history', async () => {
    const original = await saveFolderSnapshot(payload('Existing'), 'rev', 'manual', ample)
    await expect(saveFolderSnapshot(payload('New'), 'rev', 'before-import', { ...ample, budgetBytes: 50 }, true))
      .rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
    expect((await db.folder_snapshots.toArray()).map((row) => row.id)).toEqual([original.id])
  })

  it('does not reject a write based on an estimated quota', async () => {
    const estimate = vi.fn(async () => ({ quota: 1000, usage: 1000 }))
    vi.stubGlobal('navigator', { storage: { estimate } })
    await expect(saveFolderSnapshot(payload('New'), 'rev', 'manual'))
      .resolves.toMatchObject({ reason: 'manual' })
    expect(estimate).not.toHaveBeenCalled()
  })

  it('retries actual quota failures once even with permission, keeping locked points and failing explicitly', async () => {
    const protection = await saveFolderSnapshot(payload('Protected'), 'rev', 'before-import', ample, true)
    permission.unlimited = true
    const put = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new DOMException('Full disk', 'QuotaExceededError'))
    await expect(saveFolderSnapshot(payload('New'), 'rev', 'manual', ample)).rejects.toMatchObject({ code: 'LOCAL_STORAGE_FULL' })
    expect(put).toHaveBeenCalledTimes(2)
    expect(await db.folder_snapshots.get(protection.id)).toBeDefined()
  })

  it('preserves the previous automatic group payload when a merged write runs out of disk space', async () => {
    const first = await saveFolderSnapshot(payload('Before'), 'rev', 'automatic', ample)
    const stored = await db.folder_snapshots.get(first.id)
    advance(1000)
    vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new DOMException('Disk full', 'QuotaExceededError'))
    await expect(saveFolderSnapshot(payload('After'), 'rev-2', 'automatic', ample)).rejects.toMatchObject({ code: 'LOCAL_STORAGE_FULL' })
    expect((await db.folder_snapshots.get(first.id))?.compressedPayload).toBe(stored?.compressedPayload)
  })

  it('handles a large organization and accounts for compressed data in the budget', async () => {
    const large = payload('Large')
    let seed = 1
    const letters = () => {
      let title = ''
      for (let index = 0; index < 400; index += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        title += String.fromCharCode(33 + (seed >>> 16) % 90)
      }
      return title
    }
    large.chatReferences = Array.from({ length: 2000 }, (_, index) => ({
      accountScopeId: scope, chatId: `chat-${index}`, cachedTitle: letters(),
      createdAt: large.exportedAt, updatedAt: large.exportedAt, titleVersionStamp: large.settingsVersion,
    }))
    const saved = await saveFolderSnapshot(large, 'rev', 'manual', ample)
    expect(snapshotBytes(saved)).toBeGreaterThan(100_000)
    expect(snapshotBytes(saved)).toBeLessThan(20 * 1024 * 1024)
    const before = await db.folder_snapshots.count()
    await expect(saveFolderSnapshot({ ...large, folders: [{ ...large.folders[0], name: 'Changed' }] }, 'rev-2', 'before-import', {
      ...ample, budgetBytes: snapshotBytes(saved) / 2,
    })).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' })
    expect(await db.folder_snapshots.count()).toBe(before)
  })
})
