import { browser } from 'wxt/browser'

const STORAGE_KEY = 'responseCompleteNotification.deepResearchTasks'
const DEFAULT_TASK_TTL_MS = 30 * 60 * 1_000

export interface DeepResearchTask {
  tabId: number
  conversationId: string
  startedAt: number
  lastPollAt: number
  suppressNextStreamGenerate: boolean
}

interface TaskMutationResult<T> {
  value: T
  expiredTasks: DeepResearchTask[]
}

export interface RegisterDeepResearchPollResult extends TaskMutationResult<DeepResearchTask> {
  created: boolean
}

let tasks: Map<string, DeepResearchTask> | null = null
let operationQueue: Promise<void> = Promise.resolve()

export function registerDeepResearchPoll(
  tabId: number,
  conversationId: string,
  timestamp: number,
): Promise<RegisterDeepResearchPollResult> {
  return runExclusive(async () => {
    const expiredTasks = removeExpiredTasks(timestamp)
    const key = getTaskKey(tabId, conversationId)
    const existingTask = getTasks().get(key)
    const task: DeepResearchTask = existingTask
      ? {
          ...existingTask,
          lastPollAt: timestamp,
        }
      : {
          tabId,
          conversationId,
          startedAt: timestamp,
          lastPollAt: timestamp,
          suppressNextStreamGenerate: true,
        }

    getTasks().set(key, task)
    await persistTasks()
    return {
      value: task,
      created: !existingTask,
      expiredTasks,
    }
  })
}

export function consumeDeepResearchStreamSuppression(
  tabId: number,
  timestamp: number,
): Promise<TaskMutationResult<DeepResearchTask | null>> {
  return runExclusive(async () => {
    const expiredTasks = removeExpiredTasks(timestamp)
    const task = Array.from(getTasks().values())
      .filter(candidate => candidate.tabId === tabId && candidate.suppressNextStreamGenerate)
      .sort((left, right) => right.lastPollAt - left.lastPollAt)[0]

    if (!task) {
      await persistTasksIfNeeded(expiredTasks.length > 0)
      return {
        value: null,
        expiredTasks,
      }
    }

    const updatedTask = {
      ...task,
      suppressNextStreamGenerate: false,
    }
    getTasks().set(getTaskKey(task.tabId, task.conversationId), updatedTask)
    await persistTasks()
    return {
      value: updatedTask,
      expiredTasks,
    }
  })
}

export function consumeDeepResearchReport(
  tabId: number,
  conversationId: string,
  timestamp: number,
): Promise<TaskMutationResult<DeepResearchTask | null>> {
  return runExclusive(async () => {
    const expiredTasks = removeExpiredTasks(timestamp)
    const key = getTaskKey(tabId, conversationId)
    const task = getTasks().get(key) ?? null
    if (task) {
      getTasks().delete(key)
    }
    await persistTasksIfNeeded(Boolean(task) || expiredTasks.length > 0)
    return {
      value: task,
      expiredTasks,
    }
  })
}

export function clearDeepResearchTasksForTab(
  tabId: number,
): Promise<DeepResearchTask[]> {
  return runExclusive(async () => {
    const removedTasks = Array.from(getTasks().values())
      .filter(task => task.tabId === tabId)
    for (const task of removedTasks) {
      getTasks().delete(getTaskKey(task.tabId, task.conversationId))
    }
    await persistTasksIfNeeded(removedTasks.length > 0)
    return removedTasks
  })
}

export function clearAllDeepResearchTasks(): Promise<DeepResearchTask[]> {
  return runExclusive(async () => {
    const removedTasks = Array.from(getTasks().values())
    getTasks().clear()
    await persistTasksIfNeeded(removedTasks.length > 0)
    return removedTasks
  })
}

async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const resultPromise = operationQueue.then(async () => {
    await ensureTasksLoaded()
    return operation()
  })
  operationQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  )
  return resultPromise
}

async function ensureTasksLoaded(): Promise<void> {
  if (tasks) {
    return
  }

  const stored = await browser.storage.session.get(STORAGE_KEY)
  const storedTasks = stored[STORAGE_KEY]
  tasks = new Map(
    Array.isArray(storedTasks)
      ? storedTasks
          .filter(isDeepResearchTask)
          .map(task => [getTaskKey(task.tabId, task.conversationId), task])
      : [],
  )
}

function getTasks(): Map<string, DeepResearchTask> {
  if (!tasks) {
    throw new Error('Deep Research task state has not been loaded')
  }
  return tasks
}

function removeExpiredTasks(
  timestamp: number,
  taskTtlMs: number = DEFAULT_TASK_TTL_MS,
): DeepResearchTask[] {
  const expiredTasks = Array.from(getTasks().values())
    .filter(task => timestamp - task.lastPollAt > taskTtlMs)
  for (const task of expiredTasks) {
    getTasks().delete(getTaskKey(task.tabId, task.conversationId))
  }
  return expiredTasks
}

async function persistTasksIfNeeded(shouldPersist: boolean): Promise<void> {
  if (shouldPersist) {
    await persistTasks()
  }
}

async function persistTasks(): Promise<void> {
  await browser.storage.session.set({
    [STORAGE_KEY]: Array.from(getTasks().values()),
  })
}

function getTaskKey(tabId: number, conversationId: string): string {
  return `${tabId}:${conversationId}`
}

function isDeepResearchTask(value: unknown): value is DeepResearchTask {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DeepResearchTask>
  return typeof candidate.tabId === 'number'
    && typeof candidate.conversationId === 'string'
    && typeof candidate.startedAt === 'number'
    && typeof candidate.lastPollAt === 'number'
    && typeof candidate.suppressNextStreamGenerate === 'boolean'
}

export function resetDeepResearchNotificationStateForTest(): void {
  tasks = null
  operationQueue = Promise.resolve()
}
