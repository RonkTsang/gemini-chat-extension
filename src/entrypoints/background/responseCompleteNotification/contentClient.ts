import { browser } from 'wxt/browser'
import {
  RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE,
  type ResponseCompleteNotificationContent,
  type ResponseCompleteNotificationDeepResearchStatus,
} from '@/types/runtime-messages'
import type { CompletionKind } from './types'
import { logBackgroundEvent } from './logger'

const CONTENT_REQUEST_TIMEOUT_MS = 2_000

export async function requestNotificationContent(
  tabId: number,
  completionKind: CompletionKind,
): Promise<ResponseCompleteNotificationContent | null> {
  try {
    return await Promise.race([
      browser.tabs.sendMessage(tabId, {
        type: RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE,
        payload: {
          completionKind,
        },
      }) as Promise<ResponseCompleteNotificationContent>,
      new Promise<null>(resolve => setTimeout(() => resolve(null), CONTENT_REQUEST_TIMEOUT_MS)),
    ])
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('notification-content-unavailable', {
        tabId,
        completionKind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

export async function requestDeepResearchDomStatus(
  tabId: number,
  conversationId?: string,
): Promise<ResponseCompleteNotificationDeepResearchStatus | null> {
  try {
    return await Promise.race([
      browser.tabs.sendMessage(tabId, {
        type: RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE,
        payload: {
          conversationId,
        },
      }) as Promise<ResponseCompleteNotificationDeepResearchStatus>,
      new Promise<null>(resolve => setTimeout(() => resolve(null), CONTENT_REQUEST_TIMEOUT_MS)),
    ])
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('deep-research-dom-status-unavailable', {
        tabId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}
