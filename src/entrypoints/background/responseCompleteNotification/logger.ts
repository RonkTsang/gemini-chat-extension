import {
  logDevEvent,
  logDevMessage,
} from '@/utils/devLogger'
import type { DeepResearchTask } from './deepResearchState'

const BACKGROUND_LOG_LABEL = '[ResponseCompleteNotificationBackground]'
const AUDIO_LOG_LABEL = '[ResponseCompleteNotificationAudio]'

export const logBackgroundEvent = import.meta.env.DEV
  ? function logBackgroundEvent(
      event: string,
      details: Record<string, unknown> = {},
    ): void {
      logDevEvent('info', BACKGROUND_LOG_LABEL, event, details)
    }
  : function logBackgroundEvent(): void {}

export const logAudioEvent = import.meta.env.DEV
  ? function logAudioEvent(
      event: string,
      details: Record<string, unknown> = {},
    ): void {
      logDevEvent('info', AUDIO_LOG_LABEL, event, details)
    }
  : function logAudioEvent(): void {}

export function logExpiredDeepResearchTasks(tasks: DeepResearchTask[]): void {
  if (!import.meta.env.DEV) {
    return
  }

  for (const task of tasks) {
    logBackgroundEvent('deep-research-task-expired', {
      tabId: task.tabId,
      conversationId: task.conversationId,
      startedAt: task.startedAt,
      lastPollAt: task.lastPollAt,
      taskAgeMs: Date.now() - task.startedAt,
    })
  }
}

export function logClearedDeepResearchTasks(tasks: DeepResearchTask[], reason: string): void {
  if (!import.meta.env.DEV) {
    return
  }

  for (const task of tasks) {
    logBackgroundEvent('deep-research-task-cleared', {
      tabId: task.tabId,
      conversationId: task.conversationId,
      startedAt: task.startedAt,
      lastPollAt: task.lastPollAt,
      reason,
    })
  }
}

export function logDeepResearchStateError(
  event: string,
  error: unknown,
  details: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) {
    return
  }

  logBackgroundEvent(event, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  })
}

export const warnNotificationDebugEvent = import.meta.env.DEV
  ? function warnNotificationDebugEvent(
      label: string,
      details: unknown,
    ): void {
      logDevMessage('warn', label, details)
    }
  : function warnNotificationDebugEvent(): void {}

export const warnNotificationDebugPayload = import.meta.env.DEV
  ? function warnNotificationDebugPayload(
      label: string,
      event: string,
      details: Record<string, unknown> = {},
    ): void {
      logDevEvent('warn', label, event, details)
    }
  : function warnNotificationDebugPayload(): void {}
