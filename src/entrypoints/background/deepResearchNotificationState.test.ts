import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllDeepResearchTasks,
  clearDeepResearchTasksForTab,
  consumeDeepResearchReport,
  registerDeepResearchHistoryPoll,
  registerDeepResearchPoll,
  resetDeepResearchNotificationStateForTest,
} from './deepResearchNotificationState'

const storageData: Record<string, unknown> = {}
const STORAGE_KEY = 'responseCompleteNotification.deepResearchTasks'

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({
          [key]: storageData[key],
        })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageData, items)
        }),
      },
    },
  },
}))

describe('deepResearchNotificationState', () => {
  beforeEach(() => {
    resetDeepResearchNotificationStateForTest()
    for (const key of Object.keys(storageData)) {
      delete storageData[key]
    }
  })

  it('creates a job-poll task and refreshes later polls', async () => {
    const created = await registerDeepResearchPoll(7, 'c_1', 100)
    expect(created.created).toBe(true)
    expect(created.value.source).toBe('job-poll')

    const refreshed = await registerDeepResearchPoll(7, 'c_1', 120)
    expect(refreshed.created).toBe(false)
    expect(refreshed.value.lastPollAt).toBe(120)
    expect(refreshed.value.source).toBe('job-poll')
  })

  it('creates history-poll tasks', async () => {
    const created = await registerDeepResearchHistoryPoll(7, 'c_1', 100)

    expect(created.created).toBe(true)
    expect(created.value.source).toBe('history-poll')
  })

  it('consumes only the exact report task once', async () => {
    await registerDeepResearchPoll(7, 'c_1', 100)

    const first = await consumeDeepResearchReport(7, 'c_1', 200)
    const duplicate = await consumeDeepResearchReport(7, 'c_1', 201)

    expect(first.value?.conversationId).toBe('c_1')
    expect(duplicate.value).toBeNull()
  })

  it('recovers tasks from session storage after an in-memory reset', async () => {
    await registerDeepResearchPoll(7, 'c_1', 100)
    resetDeepResearchNotificationStateForTest()

    const result = await consumeDeepResearchReport(7, 'c_1', 200)

    expect(result.value?.conversationId).toBe('c_1')
  })

  it('drops obsolete StreamGenerate suppression fields from stored tasks', async () => {
    storageData[STORAGE_KEY] = [{
      tabId: 7,
      conversationId: 'c_1',
      startedAt: 100,
      lastPollAt: 100,
      suppressNextStreamGenerate: true,
      source: 'job-poll',
    }]

    const result = await consumeDeepResearchReport(7, 'c_1', 200)

    expect(result.value).toEqual({
      tabId: 7,
      conversationId: 'c_1',
      startedAt: 100,
      lastPollAt: 100,
      source: 'job-poll',
    })
  })

  it('expires stale tasks opportunistically', async () => {
    await registerDeepResearchPoll(7, 'c_old', 100)

    const result = await registerDeepResearchPoll(7, 'c_new', 30 * 60 * 1_000 + 101)

    expect(result.expiredTasks).toEqual([
      expect.objectContaining({ conversationId: 'c_old' }),
    ])
  })

  it('clears tasks by tab and globally', async () => {
    await registerDeepResearchPoll(7, 'c_1', 100)
    await registerDeepResearchPoll(8, 'c_2', 100)

    await expect(clearDeepResearchTasksForTab(7)).resolves.toEqual([
      expect.objectContaining({ conversationId: 'c_1' }),
    ])
    await expect(clearAllDeepResearchTasks()).resolves.toEqual([
      expect.objectContaining({ conversationId: 'c_2' }),
    ])
  })
})
