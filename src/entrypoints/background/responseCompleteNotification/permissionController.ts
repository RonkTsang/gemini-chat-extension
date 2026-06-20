import { browser } from 'wxt/browser'
import {
  clearResponseCompleteNotificationPermissionIntent,
  createResponseCompleteNotificationPermissionIntent,
  getResponseCompleteNotificationPermissionIntent,
  setResponseCompleteNotificationPermissionIntent,
  type ResponseCompleteNotificationPermissionKind,
} from '@/services/responseCompleteNotificationPermissionIntent'
import {
  getResponseCompleteNotificationReadiness,
  hasResponseCompleteNotificationAudioPermission,
  hasResponseCompleteNotificationPermission,
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings'
import type { ResponseCompleteNotificationResponse } from '@/types/runtime-messages'
import type {
  BrowserWithOptionalAction,
  RuntimeMessageSender,
} from './types'
import {
  isSendableReadiness,
} from './readiness'
import {
  logBackgroundEvent,
  warnNotificationDebugEvent,
} from './logger'

const PERMISSION_POPUP_WIDTH = 360
const PERMISSION_POPUP_HEIGHT = 520
const PERMISSION_INTENT_POLL_INTERVAL_MS = 500
const PERMISSION_INTENT_POLL_MAX_ATTEMPTS = 60

let permissionEventListenersStarted = false
let permissionIntentPollTimer: ReturnType<typeof setTimeout> | null = null
let permissionIntentPollAttempts = 0
let onPermissionStateChanged: (() => Promise<void>) | null = null

export function ensurePermissionEventListeners(
  handlePermissionStateChanged: () => Promise<void>,
): void {
  onPermissionStateChanged = handlePermissionStateChanged
  if (permissionEventListenersStarted) {
    return
  }

  permissionEventListenersStarted = true
  browser.permissions.onAdded.addListener(handlePermissionChanged)
  browser.permissions.onRemoved.addListener(handlePermissionChanged)
}

function handlePermissionChanged(): void {
  void handlePermissionChangedAsync()
}

async function handlePermissionChangedAsync(): Promise<void> {
  const result = await enablePendingPermissionIntentIfGranted()
  if (result !== 'pending') {
    stopPendingPermissionIntentPolling()
  }
  await onPermissionStateChanged?.()
}

export async function openPermissionPopup(
  payload: { permissionKind: ResponseCompleteNotificationPermissionKind },
  sender: RuntimeMessageSender,
): Promise<ResponseCompleteNotificationResponse> {
  const sourceTabId = sender.tab?.id
  const sourceWindowId = sender.tab?.windowId
  if (typeof sourceTabId !== 'number' || typeof sourceWindowId !== 'number') {
    return {
      ok: false,
      error: 'missing-tab',
    }
  }

  try {
    if (await hasPermissionForKind(payload.permissionKind)) {
      await enableSettingForKind(payload.permissionKind)
      await onPermissionStateChanged?.()
      return {
        ok: true,
        status: 'already-granted',
      }
    }

    const intent = createResponseCompleteNotificationPermissionIntent(payload.permissionKind, {
      tabId: sourceTabId,
      windowId: sourceWindowId,
    })
    await setResponseCompleteNotificationPermissionIntent(intent)
    startPendingPermissionIntentPolling()

    const openedPopup = await tryOpenActionPopup(sourceWindowId)
    if (openedPopup) {
      return {
        ok: true,
        status: 'popup-opened',
      }
    }

    const openedFallback = await tryOpenPermissionWindow(intent.nonce)
    if (openedFallback) {
      return {
        ok: true,
        status: 'fallback-window-opened',
      }
    }

    await clearResponseCompleteNotificationPermissionIntent()
    stopPendingPermissionIntentPolling()
    return {
      ok: false,
      error: 'popup-open-failed',
    }
  } catch (error) {
    await clearResponseCompleteNotificationPermissionIntent()
    stopPendingPermissionIntentPolling()
    if (import.meta.env.DEV) {
      warnNotificationDebugEvent('[ResponseCompleteNotification] Failed to open permission popup:', error)
    }
    return {
      ok: false,
      error: 'popup-open-failed',
    }
  }
}

async function hasPermissionForKind(
  permissionKind: ResponseCompleteNotificationPermissionKind,
): Promise<boolean> {
  if (permissionKind === 'audio') {
    return hasResponseCompleteNotificationAudioPermission()
  }

  return hasResponseCompleteNotificationPermission()
}

async function enableSettingForKind(
  permissionKind: ResponseCompleteNotificationPermissionKind,
): Promise<void> {
  if (permissionKind === 'audio') {
    await setResponseCompleteNotificationAudioEnabled(true)
    return
  }

  await setResponseCompleteNotificationEnabled(true)
}

async function enablePendingPermissionIntentIfGranted(): Promise<'enabled' | 'pending' | 'missing'> {
  const intent = await getResponseCompleteNotificationPermissionIntent()
  if (!intent) {
    return 'missing'
  }

  if (!await hasPermissionForKind(intent.permissionKind)) {
    return 'pending'
  }

  await enableSettingForKind(intent.permissionKind)
  await clearResponseCompleteNotificationPermissionIntent()
  await onPermissionStateChanged?.()
  return 'enabled'
}

function startPendingPermissionIntentPolling(): void {
  stopPendingPermissionIntentPolling()
  permissionIntentPollAttempts = 0
  void pollPendingPermissionIntent()
}

export function stopPendingPermissionIntentPolling(): void {
  if (permissionIntentPollTimer) {
    clearTimeout(permissionIntentPollTimer)
    permissionIntentPollTimer = null
  }
  permissionIntentPollAttempts = 0
}

async function pollPendingPermissionIntent(): Promise<void> {
  try {
    const result = await enablePendingPermissionIntentIfGranted()
    if (result !== 'pending') {
      stopPendingPermissionIntentPolling()
      return
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('permission-intent-poll-failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  permissionIntentPollAttempts += 1
  if (permissionIntentPollAttempts >= PERMISSION_INTENT_POLL_MAX_ATTEMPTS) {
    stopPendingPermissionIntentPolling()
    return
  }

  permissionIntentPollTimer = setTimeout(() => {
    permissionIntentPollTimer = null
    void pollPendingPermissionIntent()
  }, PERMISSION_INTENT_POLL_INTERVAL_MS)
}

async function tryOpenActionPopup(windowId: number): Promise<boolean> {
  const actionApi = (browser as BrowserWithOptionalAction).action
  if (!actionApi?.openPopup) {
    return false
  }

  try {
    await actionApi.openPopup({ windowId })
    return true
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('permission-action-popup-open-failed', {
        windowId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return false
  }
}

async function tryOpenPermissionWindow(nonce: string): Promise<boolean> {
  const windowsApi = (browser as BrowserWithOptionalAction).windows
  if (!windowsApi.create) {
    return false
  }

  try {
    const popupUrl = new URL(browser.runtime.getURL('/popup.html'))
    popupUrl.searchParams.set('intent', 'response-complete-notification')
    popupUrl.searchParams.set('nonce', nonce)
    await windowsApi.create({
      type: 'popup',
      url: popupUrl.href,
      width: PERMISSION_POPUP_WIDTH,
      height: PERMISSION_POPUP_HEIGHT,
    })
    return true
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('permission-fallback-window-open-failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return false
  }
}

export async function getReadinessResponse(): Promise<ResponseCompleteNotificationResponse> {
  await enablePendingPermissionIntentIfGranted()
  const [readiness, audioPermissionAvailable] = await Promise.all([
    getResponseCompleteNotificationReadiness(),
    hasResponseCompleteNotificationAudioPermission(),
  ])
  return {
    ok: isSendableReadiness(readiness),
    readiness,
    audioPermissionAvailable,
  }
}

export function resetPermissionControllerForTest(): void {
  permissionEventListenersStarted = false
  stopPendingPermissionIntentPolling()
  onPermissionStateChanged = null
}
