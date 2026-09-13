import { describe, expect, it, vi } from 'vitest'

vi.mock('wxt/browser', () => ({ browser: { alarms: { create: vi.fn() } } }))

import { FolderSyncScheduler } from './scheduler'

const scope = 'account-scope-0001'

describe('FolderSyncScheduler', () => {
  it('rate-limits activity hints across tabs but never suppresses a write-triggered run', async () => {
    const coordinator = { sync: vi.fn(async () => undefined) }
    const scheduler = new FolderSyncScheduler(coordinator as never)

    scheduler.requestRun(scope, 'content-activity-hint')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    scheduler.requestRun(scope, 'content-activity-hint')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(coordinator.sync).toHaveBeenCalledTimes(1)

    scheduler.requestRun(scope, 'outbox-created')
    await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
  })
})
