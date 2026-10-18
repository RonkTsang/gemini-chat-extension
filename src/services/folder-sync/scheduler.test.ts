import { describe, expect, it, vi } from 'vitest'

vi.mock('wxt/browser', () => ({ browser: { alarms: { clear: vi.fn(async () => true), create: vi.fn(), get: vi.fn(async () => undefined) } } }))

import { FolderSyncScheduler } from './scheduler'

const scope = 'account-scope-0001'

describe('FolderSyncScheduler', () => {
  it('serializes explicit recreation with other sync work and keeps a trailing storage wake', async () => {
    let finish!: () => void
    const coordinator = { sync: vi.fn(async () => ({ outcome: 'accepted-by-browser-storage' as const })),
      recreateMissingReplica: vi.fn(() => new Promise<{ outcome: 'accepted-by-browser-storage' }>((resolve) => {
        finish = () => resolve({ outcome: 'accepted-by-browser-storage' })
      })) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    const request = { expectedRevision: 'local', baseSnapshotId: 'missing' }
    const recreating = scheduler.retry(scope, request)
    expect(coordinator.recreateMissingReplica).toHaveBeenCalledExactlyOnceWith(scope, request)
    expect(await scheduler.retry(scope)).toEqual({ outcome: 'busy' })
    scheduler.requestRun(scope, 'browser-sync-area-changed')
    expect(coordinator.sync).not.toHaveBeenCalled()
    finish()
    await recreating
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledExactlyOnceWith(scope, undefined, true))
  })

  it('clears an old retry alarm when the coordinator stops retrying an unsupported version', async () => {
    const { browser } = await import('wxt/browser')
    const coordinator = { sync: vi.fn(async () => ({ outcome: 'failed' as const })) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    vi.mocked(browser.alarms.create).mockClear()
    vi.mocked(browser.alarms.clear).mockClear()
    scheduler.handleAlarm(`gpk-folders-retry:${scope}`)
    await vi.waitFor(() => expect(browser.alarms.clear).toHaveBeenCalledWith(`gpk-folders-retry:${scope}`))
    expect(browser.alarms.create).not.toHaveBeenCalled()
  })
  it('rate-limits activity hints across tabs but never suppresses a write-triggered run', async () => {
    const coordinator = { sync: vi.fn(async () => ({})) }
    const scheduler = new FolderSyncScheduler(coordinator as never)

    scheduler.requestRun(scope, 'content-activity-hint')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    scheduler.requestRun(scope, 'content-activity-hint')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(coordinator.sync).toHaveBeenCalledTimes(1)

    scheduler.requestRun(scope, 'local-changes-committed')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
  })

  it('runs once more when an local commit wake-up arrives during an active run', async () => {
    let finishFirstRun!: () => void
    const firstRun = new Promise<void>((resolve) => { finishFirstRun = resolve })
    const coordinator = {
      sync: vi.fn()
        .mockImplementationOnce(async () => { await firstRun; return {} })
        .mockResolvedValue({}),
    }
    const scheduler = new FolderSyncScheduler(coordinator as never)

    scheduler.requestRun(scope, 'background-resume')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    scheduler.requestRun(scope, 'local-changes-committed')
    expect(coordinator.sync).toHaveBeenCalledTimes(1)

    finishFirstRun()
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
    expect(coordinator.sync).toHaveBeenLastCalledWith(scope, undefined)
  })

  it('does not let a later activity hint overwrite a queued local commit run', async () => {
    let finishFirstRun!: () => void
    const firstRun = new Promise<void>((resolve) => { finishFirstRun = resolve })
    const coordinator = {
      sync: vi.fn()
        .mockImplementationOnce(async () => { await firstRun; return {} })
        .mockResolvedValue({}),
    }
    const scheduler = new FolderSyncScheduler(coordinator as never)

    scheduler.requestRun(scope, 'background-resume')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    scheduler.requestRun(scope, 'local-changes-committed')
    scheduler.requestRun(scope, 'content-activity-hint')
    finishFirstRun()
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
    expect(coordinator.sync).toHaveBeenLastCalledWith(scope, undefined)
  })

  it('consumes an accepted trailing activity hint without throttling it a second time', async () => {
    let finishFirstRun!: () => void
    const firstRun = new Promise<void>((resolve) => { finishFirstRun = resolve })
    const coordinator = {
      sync: vi.fn()
        .mockImplementationOnce(async () => { await firstRun; return {} })
        .mockResolvedValue({}),
    }
    const scheduler = new FolderSyncScheduler(coordinator as never)

    scheduler.requestRun(scope, 'background-resume')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    scheduler.requestRun(scope, 'content-activity-hint')
    finishFirstRun()

    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
  })

  it('requests one run per account for a storage callback with multiple chunk and manifest keys', async () => {
    const coordinator = { sync: vi.fn(async () => ({})) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    const otherScope = 'account-scope-0002'
    scheduler.requestStorageChanges({
      [`folders:${scope}:chunk:0`]: {},
      [`folders:${scope}:chunk:1`]: {},
      [`folders:${scope}:manifest`]: {},
      [`folders:${otherScope}:manifest`]: {},
      'unrelated-setting': {},
      'folders:legacy': {},
    }, 'storage-event')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(coordinator.sync).toHaveBeenCalledTimes(2)
    expect(coordinator.sync).toHaveBeenCalledWith(scope, 'storage-event', true)
    expect(coordinator.sync).toHaveBeenCalledWith(otherScope, 'storage-event', true)
  })

  it('merges notifications before execution without scheduling a trailing run', async () => {
    const coordinator = { sync: vi.fn(async () => ({})) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    scheduler.requestRun(scope, 'browser-sync-area-changed', 'first')
    scheduler.requestRun(scope, 'browser-sync-area-changed', 'second')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(coordinator.sync).toHaveBeenCalledExactlyOnceWith(scope, 'second', true)
  })

  it('does not downgrade a queued command to a storage-only check', async () => {
    const coordinator = { sync: vi.fn(async () => ({})) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    scheduler.requestRun(scope, 'browser-sync-area-changed', 'first')
    scheduler.requestRun(scope, 'local-changes-committed', 'command')
    scheduler.requestRun(scope, 'browser-sync-area-changed', 'echo')
    scheduler.requestRun(scope, 'content-activity-hint', 'hint')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    expect(coordinator.sync).toHaveBeenCalledExactlyOnceWith(scope, 'command')
  })

  it('retains a command committed during execution despite later storage echoes', async () => {
    let finishFirstRun!: () => void
    const firstRun = new Promise<void>((resolve) => { finishFirstRun = resolve })
    const coordinator = { sync: vi.fn().mockImplementationOnce(async () => { await firstRun; return {} }).mockResolvedValue({}) }
    const scheduler = new FolderSyncScheduler(coordinator as never)
    scheduler.requestRun(scope, 'background-resume')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    scheduler.requestRun(scope, 'local-changes-committed', 'command')
    scheduler.requestRun(scope, 'browser-sync-area-changed', 'echo')
    finishFirstRun()
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
    expect(coordinator.sync).toHaveBeenLastCalledWith(scope, 'command')
  })
})

it('uses the existing retry alarm for lease deferral and resumes without page activity', async () => {
  const { browser } = await import('wxt/browser')
  const coordinator = { sync: vi.fn().mockResolvedValueOnce({ retryAt: new Date(Date.now() + 30_000).toISOString() }).mockResolvedValue({}) }
  const scheduler = new FolderSyncScheduler(coordinator as never)
  scheduler.requestRun(scope, 'background-resume')
  await vi.waitFor(() => expect(browser.alarms.create).toHaveBeenCalledWith(`gpk-folders-retry:${scope}`, { delayInMinutes: 1 }))
  scheduler.handleAlarm(`gpk-folders-retry:${scope}`)
  await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
})
