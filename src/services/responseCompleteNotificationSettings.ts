import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import { storage } from '#imports'

export const RESPONSE_COMPLETE_NOTIFICATION_PERMISSION = 'notifications' as const
export const RESPONSE_COMPLETE_NOTIFICATION_WEB_REQUEST_PERMISSION = 'webRequest' as const
export const RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PERMISSION = 'offscreen' as const

export type NotificationReadiness =
  | 'off'
  | 'missing-extension-permission'
  | 'blocked-by-browser'
  | 'allowed'
  | 'allowed-but-system-unknown'

type NotificationPermissionLevel = 'granted' | 'denied'

type NotificationsApiWithPermissionLevel = typeof browser.notifications & {
  getPermissionLevel?: () => Promise<NotificationPermissionLevel> | NotificationPermissionLevel
}

type BrowserWithOptionalNotifications = typeof browser & {
  notifications?: NotificationsApiWithPermissionLevel
}

export const enableResponseCompleteNotification = storage.defineItem<boolean>(
  'sync:enableResponseCompleteNotification',
  {
    fallback: false,
  },
)

export const enableResponseCompleteNotificationAudio = storage.defineItem<boolean>(
  'sync:enableResponseCompleteNotificationAudio',
  {
    fallback: false,
  },
)

export const getResponseCompleteNotificationEnabled = () =>
  enableResponseCompleteNotification.getValue()

export const setResponseCompleteNotificationEnabled = (enabled: boolean) =>
  enableResponseCompleteNotification.setValue(enabled)

export const getResponseCompleteNotificationAudioEnabled = () =>
  enableResponseCompleteNotificationAudio.getValue()

export const setResponseCompleteNotificationAudioEnabled = (enabled: boolean) =>
  enableResponseCompleteNotificationAudio.setValue(enabled)

export async function hasResponseCompleteNotificationPermission(): Promise<boolean> {
  return browser.permissions.contains(getResponseCompleteNotificationPermissionRequest())
}

export function getResponseCompleteNotificationPermissionRequest(): Browser.permissions.Permissions {
  if (import.meta.env.FIREFOX) {
    return {
      permissions: [RESPONSE_COMPLETE_NOTIFICATION_PERMISSION],
    }
  }

  return {
    permissions: [
      RESPONSE_COMPLETE_NOTIFICATION_PERMISSION,
      RESPONSE_COMPLETE_NOTIFICATION_WEB_REQUEST_PERMISSION,
    ],
  }
}

export function getResponseCompleteNotificationAudioPermissionRequest(): Browser.permissions.Permissions {
  return {
    permissions: [RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PERMISSION],
  }
}

export async function hasResponseCompleteNotificationAudioPermission(): Promise<boolean> {
  if (import.meta.env.FIREFOX) {
    return false
  }

  return browser.permissions.contains(getResponseCompleteNotificationAudioPermissionRequest())
}

export async function getResponseCompleteNotificationReadiness(): Promise<NotificationReadiness> {
  const enabled = await getResponseCompleteNotificationEnabled()
  if (!enabled) {
    return 'off'
  }

  return getNotificationPermissionReadiness()
}

export async function getNotificationPermissionReadiness(): Promise<Exclude<NotificationReadiness, 'off'>> {
  const hasPermission = await hasResponseCompleteNotificationPermission()
  if (!hasPermission) {
    return 'missing-extension-permission'
  }

  const notificationsApi = (browser as BrowserWithOptionalNotifications).notifications
  if (!notificationsApi?.getPermissionLevel) {
    return 'allowed-but-system-unknown'
  }

  const permissionLevel = await notificationsApi.getPermissionLevel()
  if (permissionLevel === 'denied') {
    return 'blocked-by-browser'
  }

  return 'allowed'
}
