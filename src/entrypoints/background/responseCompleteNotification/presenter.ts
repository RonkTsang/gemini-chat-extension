import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import type {
  BrowserWithOptionalNotifications,
  ImageNotificationPresentationResult,
  NotificationSource,
  NotificationTarget,
  NotificationsApi,
  ParsedNotificationId,
} from './types'
import {
  normalizeNotificationMessage,
  normalizeNotificationTitle,
} from './text'
import { logBackgroundEvent } from './logger'

const IMAGE_DATA_URL_PREFIX = 'data:image/jpeg;base64,'
const MAX_IMAGE_DATA_URL_LENGTH = 750_000

export function getNotificationsApi(): NotificationsApi | undefined {
  return (browser as BrowserWithOptionalNotifications).notifications
}

export async function createResponseCompleteNotification(target: NotificationTarget): Promise<string> {
  const notificationsApi = getNotificationsApi()
  if (!notificationsApi) {
    throw new Error('Notifications API is unavailable')
  }

  const notificationId = buildNotificationId(target)

  const basicOptions: Browser.notifications.NotificationCreateOptions = {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/gemini-sparkle-aurora.png'),
    title: normalizeNotificationTitle(target.title),
    message: normalizeNotificationMessage(target.message),
    ...(import.meta.env.FIREFOX ? {} : { silent: true }),
  }
  const imageDataUrl = getValidImageDataUrl(target)
  if (imageDataUrl) {
    const imagePresentation = await getImageNotificationPresentation()
    const imageOptions: Browser.notifications.NotificationCreateOptions = imagePresentation.presentation === 'basic-icon'
      ? {
          ...basicOptions,
          type: 'basic',
          iconUrl: imageDataUrl,
        }
      : {
          ...basicOptions,
          type: 'image',
          imageUrl: imageDataUrl,
        }

    try {
      await notificationsApi.create(notificationId, imageOptions)
      if (import.meta.env.DEV) {
        logBackgroundEvent('notification-template-selected', {
          notificationId,
          source: target.source,
          completionKind: target.completionKind,
          templateType: imageOptions.type,
          imagePresentation: imagePresentation.presentation,
          platformOs: imagePresentation.platformOs,
        })
      }
      return notificationId
    } catch (error) {
      if (import.meta.env.DEV) {
        logBackgroundEvent('image-notification-fallback-basic', {
          notificationId,
          source: target.source,
          completionKind: target.completionKind,
          imagePresentation: imagePresentation.presentation,
          platformOs: imagePresentation.platformOs,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  if (import.meta.env.DEV) {
    logBackgroundEvent('notification-create-requested', {
      notificationId,
      source: target.source,
      completionKind: target.completionKind,
      templateType: 'basic',
    })
  }
  await notificationsApi.create(notificationId, basicOptions)
  if (import.meta.env.DEV) {
    logBackgroundEvent('notification-template-selected', {
      notificationId,
      source: target.source,
      completionKind: target.completionKind,
      templateType: 'basic',
    })
  }

  return notificationId
}

export function buildNotificationId(target: NotificationTarget): string {
  return `${target.source}:${target.tabId ?? 'popup'}:${target.timestamp}`
}

export function parseNotificationId(notificationId: string): ParsedNotificationId | null {
  const parts = notificationId.split(':')
  if (parts.length !== 3) {
    return null
  }

  const [source, targetId, timestampText] = parts
  if (!isNotificationSource(source)) {
    return null
  }

  const timestamp = Number(timestampText)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  if (targetId === 'popup') {
    return {
      source,
      timestamp,
    }
  }

  const tabId = Number(targetId)
  if (!Number.isInteger(tabId) || tabId < 0) {
    return null
  }

  return {
    source,
    tabId,
    timestamp,
  }
}

function isNotificationSource(source: string): source is NotificationSource {
  return source === 'response-complete' || source === 'test'
}

async function getImageNotificationPresentation(): Promise<ImageNotificationPresentationResult> {
  try {
    const platformInfo = await browser.runtime.getPlatformInfo()
    return {
      presentation: platformInfo.os === 'mac'
        ? 'basic-icon'
        : 'image-template',
      platformOs: platformInfo.os,
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('notification-platform-info-unavailable', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return {
      presentation: 'image-template',
      platformOs: 'unknown',
    }
  }
}

function getValidImageDataUrl(target: NotificationTarget): string | null {
  if (
    import.meta.env.FIREFOX
    || target.responseType !== 'image'
    || typeof target.imageDataUrl !== 'string'
    || !target.imageDataUrl.startsWith(IMAGE_DATA_URL_PREFIX)
    || target.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH
  ) {
    return null
  }

  return target.imageDataUrl
}
