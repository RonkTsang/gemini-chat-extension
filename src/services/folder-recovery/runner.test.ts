import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('wxt/browser', () => ({ browser: { permissions: { contains: vi.fn(async () => true) } } }))
vi.mock('@/entrypoints/background/folders/invalidation', () => ({ publishFolderInvalidation: vi.fn(async () => undefined) }))

import { db } from '@/data/db'
import { decodeGzip } from '@/services/folder-data/codec'
import { parseFolderOrganizationData } from '@/domain/folder/schemas'
import { FolderRepositoryImpl } from '@/data/repositories/folderRepository'
import { clearRecoveryFailure } from './failure-fallback'
import { FolderRecoveryRunner } from './runner'
import { recordRecoveryFailure } from './snapshots'

const scopeA = 'account-scope-0001'
const scopeB = 'account-scope-0002'
const repository = () => new FolderRepositoryImpl({ getDeviceId: async () => 'device-test' })
const idle = (runner: FolderRecoveryRunner) => vi.waitFor(() => expect((runner as unknown as { running: boolean }).running).toBe(false))

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.folders.clear(), db.folder_memberships.clear(), db.folder_chat_references.clear(),
    db.folder_settings.clear(), db.folder_sync_states.clear(), db.folder_snapshots.clear(), db.folder_recovery_states.clear()])
  clearRecoveryFailure(scopeA)
  clearRecoveryFailure(scopeB)
})

describe('FolderRecoveryRunner', () => {
  it('resumes persisted intent and preserves snapshot grouping across runner instances', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    expect(await repo.listSnapshots(scopeA)).toHaveLength(0)
    const runner = new FolderRecoveryRunner(repo)
    runner.requestRun()
    await idle(runner)
    const snapshot = (await repo.listSnapshots(scopeA))[0]
    await repo.updateFolder(scopeA, first.data.id, { name: 'Second' })
    const restarted = new FolderRecoveryRunner(repo)
    restarted.requestRun()
    await idle(restarted)
    const points = await repo.listSnapshots(scopeA)
    expect(points).toHaveLength(1)
    expect(points[0].id).toBe(snapshot.id)
    expect(parseFolderOrganizationData(await decodeGzip((await db.folder_snapshot_payloads.get(points[0].id))!.compressedPayload)).folders[0].name).toBe('Second')
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
  })

  it('finishes captured pending even when SYNC changes only the data revision', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    const capture = await repo.getAccountDataWithRevision(scopeA)
    await db.folder_sync_states.update(scopeA, { localDataRevision: 'remote-revision' })
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBe(first.commit.dataRevision)
    const runner = new FolderRecoveryRunner(repo)
    runner.requestRun()
    await idle(runner)
    expect((await db.folder_snapshots.get((await repo.listSnapshots(scopeA))[0].id))?.dataRevision).toBe('remote-revision')
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
  })

  it('keeps a newer pending/warning and rotates accounts before processing it', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    await repo.createFolder(scopeB, { name: 'Other' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let releaseNew!: () => void
    const newGate = new Promise<void>((resolve) => { releaseNew = resolve })
    const save = repo.createSnapshot.bind(repo)
    const calls: string[] = []
    vi.spyOn(repo, 'createSnapshot').mockImplementation(async (...args) => {
      calls.push(args[0])
      if (calls.length === 1) await gate
      if (calls.length === 3) await newGate
      return save(...args)
    })
    const runner = new FolderRecoveryRunner(repo)
    runner.requestRun()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const next = await repo.updateFolder(scopeA, first.data.id, { name: 'Second' })
    await db.folder_recovery_states.update(scopeA, { warning: 'snapshot-failed', automaticSnapshotFailed: true })
    const old = await repo.getAccountDataWithRevision(scopeA)
    await recordRecoveryFailure(scopeA, new Error('Old failure'), 'automatic', first.commit.dataRevision)
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBe(next.commit.dataRevision)
    expect(old.dataRevision).toBe(next.commit.dataRevision)
    runner.requestRun(scopeA)
    release()
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(await db.folder_recovery_states.get(scopeA)).toMatchObject({ pendingRevision: next.commit.dataRevision, warning: 'snapshot-failed', automaticSnapshotFailed: true })
    releaseNew()
    await idle(runner)
    expect(calls).toEqual([scopeA, scopeB, scopeA])
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
    expect((await repo.listSnapshots(scopeA))).toHaveLength(1)
  })

  it('ends a failed pass when snapshot and failure status writes fail, then accepts a new version', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    const save = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new Error('Disk full'))
    const status = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('No room for failure status'))
    const runner = new FolderRecoveryRunner(repo)
    runner.requestRun()
    await idle(runner)
    runner.requestRun()
    await idle(runner)
    expect(save).toHaveBeenCalledTimes(1)
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBe(first.commit.dataRevision)
    status.mockRestore()
    await repo.updateFolder(scopeA, first.data.id, { name: 'Second' })
    save.mockRestore()
    runner.requestRun(scopeA)
    await idle(runner)
    expect(await repo.listSnapshots(scopeA)).toHaveLength(1)
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
  })

  it('terminates a single failed pass even when more accounts fail than the fallback can retain', async () => {
    const repo = repository()
    const scopes = Array.from({ length: 24 }, (_, index) => `account-scope-${String(index).padStart(4, '0')}`)
    for (const scope of scopes) {
      clearRecoveryFailure(scope)
      await repo.createFolder(scope, { name: `Folder ${scope}` })
    }
    const save = vi.spyOn(repo, 'createSnapshot').mockRejectedValue(new Error('Unavailable'))
    const runner = new FolderRecoveryRunner(repo)
    runner.requestRun()
    await idle(runner)
    expect(save).toHaveBeenCalledTimes(24)
    for (const scope of scopes) clearRecoveryFailure(scope)
  })
})

describe('Folder transaction boundaries', () => {
  it('rolls back organization and SYNC intent if Recovery pending cannot be persisted', async () => {
    const repo = repository()
    vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValueOnce(new Error('Pending write failed'))
    await expect(repo.createFolder(scopeA, { name: 'Must roll back' })).rejects.toThrow('Pending write failed')
    expect(await db.folders.count()).toBe(0)
    expect(await db.folder_sync_states.count()).toBe(0)
  })

  it('rejects an obsolete SYNC replacement inside the write transaction', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    const captured = await repo.getAccountDataWithRevision(scopeA)
    const renamed = await repo.updateFolder(scopeA, first.data.id, { name: 'Latest' })
    await expect(repo.applyBrowserSyncSnapshot(scopeA, captured.data, { schemaVersion: 4, accountScopeId: scopeA, snapshotId: 'remote', chunkCount: 1, payloadBytes: 1, payloadHash: '0'.repeat(64), settings: { enabled: true, hideOrganizedChats: false } }, captured.dataRevision)).resolves.toBe(false)
    expect((await repo.listFolders(scopeA))[0].name).toBe('Latest')
    expect((await repo.getSyncState(scopeA))?.localDataRevision).toBe(renamed.commit.dataRevision)
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBe(renamed.commit.dataRevision)
  })

  it('classifies actual settings changes and excludes no-ops from post-commit work', async () => {
    const repo = repository()
    const first = await repo.createFolder(scopeA, { name: 'First' })
    const pending = first.commit.dataRevision
    const settings = await repo.getSettings(scopeA)
    const view = await repo.updateSettings(scopeA, { enabled: settings.enabled, collapsedFolderIds: [first.data.id] })
    expect(view.commit.effect).toBe('local-view')
    expect((await repo.updateFolder(scopeA, first.data.id, { name: 'First' })).commit.effect).toBeUndefined()
    expect((await repo.updateSettings(scopeA, { enabled: !settings.enabled })).commit.effect).toBe('sync-settings')
    expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBe(pending)
    await repo.upsertMembership(scopeA, { folderId: first.data.id, chatId: 'chat-1' })
    expect((await repo.upsertChatReference(scopeA, 'chat-1', 'New title')).commit.effect).toBe('organization')
    expect((await repo.upsertChatReference(scopeA, 'chat-1', 'New title')).commit.effect).toBeUndefined()
  })
})

it('returns an existing membership with an identical title as a no-op', async () => {
  const repo = repository()
  const folder = await repo.createFolder(scopeA, { name: 'First' })
  const first = await repo.upsertMembership(scopeA, { folderId: folder.data.id, chatId: 'chat-1', cachedTitle: 'Same' })
  const next = await repo.upsertMembership(scopeA, { folderId: folder.data.id, chatId: 'chat-1', cachedTitle: 'Same' })
  expect(next.data.id).toBe(first.data.id)
  expect(next.commit.effect).toBeUndefined()
  expect(next.commit.dataRevision).toBe(first.commit.dataRevision)
})

it('does not turn a saved snapshot into a failure when the completion status read fails', async () => {
  const repo = repository()
  await repo.createFolder(scopeA, { name: 'First' })
  const save = repo.createSnapshot.bind(repo)
  vi.spyOn(repo, 'createSnapshot').mockImplementation(async (...args) => {
    const result = await save(...args)
    vi.spyOn(db.folder_recovery_states, 'get').mockRejectedValueOnce(new Error('Status read unavailable'))
    return result
  })
  const runner = new FolderRecoveryRunner(repo)
  runner.requestRun()
  await idle(runner)
  expect(await repo.listSnapshots(scopeA)).toHaveLength(1)
  expect((await db.folder_recovery_states.get(scopeA))?.pendingRevision).toBeUndefined()
  const { readRecoveryFailure } = await import('./failure-fallback')
  expect(readRecoveryFailure(scopeA)).toBeUndefined()
})
