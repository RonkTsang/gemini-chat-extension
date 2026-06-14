import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllDeepResearchTasks,
  clearDeepResearchTasksForTab,
  consumeDeepResearchReport,
  consumeDeepResearchStreamSuppression,
  registerDeepResearchPoll,
  resetDeepResearchNotificationStateForTest,
} from './deepResearchNotificationState'

const storageData: Record<string, unknown> = {}

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

  it('creates a task and refreshes polls without rearming consumed suppression', async () => {
    const created = await registerDeepResearchPoll(7, 'c_1', 100)
    expect(created.created).toBe(true)
    expect(created.value.suppressNextStreamGenerate).toBe(true)

    const consumed = await consumeDeepResearchStreamSuppression(7, 110)
    expect(consumed.value?.conversationId).toBe('c_1')
    expect(consumed.value?.suppressNextStreamGenerate).toBe(false)

    const refreshed = await registerDeepResearchPoll(7, 'c_1', 120)
    expect(refreshed.created).toBe(false)
    expect(refreshed.value.lastPollAt).toBe(120)
    expect(refreshed.value.suppressNextStreamGenerate).toBe(false)
  })

  it('consumes the most recently polled armed task for a tab', async () => {
    await registerDeepResearchPoll(7, 'c_old', 100)
    await registerDeepResearchPoll(7, 'c_new', 200)

    const result = await consumeDeepResearchStreamSuppression(7, 210)

    expect(result.value?.conversationId).toBe('c_new')
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
