import { browser } from 'wxt/browser'
import type { BrowserTab } from './types'
import {
  logBackgroundEvent,
  warnNotificationDebugEvent,
} from './logger'
import {
  getNotificationsApi,
  parseNotificationId,
} from './presenter'

let notificationEventListenersStarted = false
const notificationClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function ensureNotificationEventListeners(): void {
  if (notificationEventListenersStarted) {
    return
  }

  const notificationsApi = getNotificationsApi()
  if (!notificationsApi?.onClicked || !notificationsApi.onClosed) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('notification-event-listeners-unavailable')
    }
    return
  }

  notificationEventListenersStarted = true
  notificationsApi.onClicked.addListener(handleNotificationClicked)
  notificationsApi.onClosed.addListener(handleNotificationClosed)
  if (import.meta.env.DEV) {
    logBackgroundEvent('notification-event-listeners-started')
  }
}

function handleNotificationClicked(notificationId: string): void {
  cancelScheduledNotificationClear(notificationId)
  void handleNotificationClick(notificationId)
}

async function handleNotificationClick(notificationId: string): Promise<void> {
  const clearPromise = clearNotification(notificationId)
  await focusNotificationTarget(notificationId)
  await clearPromise
}

async function clearNotification(notificationId: string): Promise<void> {
  const notificationsApi = getNotificationsApi()
  if (!notificationsApi?.clear) {
    return
  }

  try {
    await notificationsApi.clear(notificationId)
  } catch (error) {
    if (import.meta.env.DEV) {
      warnNotificationDebugEvent('[ResponseCompleteNotification] Failed to clear notification:', error)
    }
  }
}

export function scheduleNotificationClear(notificationId: string, delayMs: number): void {
  cancelScheduledNotificationClear(notificationId)
  const timer = setTimeout(() => {
    notificationClearTimers.delete(notificationId)
    void clearNotification(notificationId)
  }, delayMs)
  notificationClearTimers.set(notificationId, timer)
}

function cancelScheduledNotificationClear(notificationId: string): void {
  const timer = notificationClearTimers.get(notificationId)
  if (!timer) {
    return
  }

  clearTimeout(timer)
  notificationClearTimers.delete(notificationId)
}

async function focusNotificationTarget(notificationId: string): Promise<void> {
  const target = parseNotificationId(notificationId)
  if (typeof target?.tabId !== 'number') {
    return
  }

  try {
    const tab = await getTab(target.tabId)
    if (!tab) {
      return
    }

    if (typeof tab.windowId === 'number') {
      await browser.windows.update(tab.windowId, { focused: true })
    }
    await browser.tabs.update(target.tabId, { active: true })
  } catch (error) {
    if (import.meta.env.DEV) {
      warnNotificationDebugEvent('[ResponseCompleteNotification] Failed to focus notification target:', error)
    }
  }
}

async function getTab(tabId: number): Promise<BrowserTab | null> {
  try {
    return await browser.tabs.get(tabId)
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('notification-tab-unavailable', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

function handleNotificationClosed(notificationId: string): void {
  cancelScheduledNotificationClear(notificationId)
}

export function resetNotificationRoutingForTest(): void {
  notificationEventListenersStarted = false
  for (const timer of notificationClearTimers.values()) {
    clearTimeout(timer)
  }
  notificationClearTimers.clear()
}
