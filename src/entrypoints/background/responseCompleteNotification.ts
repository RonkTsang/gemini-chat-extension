import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'
import {
  enableResponseCompleteNotification,
  getResponseCompleteNotificationAudioPermissionRequest,
  getResponseCompleteNotificationEnabled,
  getResponseCompleteNotificationPermissionRequest,
  getResponseCompleteNotificationReadiness,
  hasResponseCompleteNotificationAudioPermission,
  hasResponseCompleteNotificationPermission,
  type NotificationReadiness,
} from '@/services/responseCompleteNotificationSettings'
import {
  isResponseCompleteNotificationAudioRequestPermissionMessage,
  isResponseCompleteNotificationGetReadinessMessage,
  isResponseCompleteNotificationRequestPermissionMessage,
  isResponseCompleteNotificationTestMessage,
  RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE,
  type ResponseCompleteNotificationContent,
  type ResponseCompleteNotificationResponse,
  type ResponseNotificationContentType,
} from '@/types/runtime-messages'
import { playResponseCompleteNotificationAudio } from './responseCompleteNotificationAudio'

const MAX_NOTIFICATION_TITLE_LENGTH = 120
const MAX_NOTIFICATION_MESSAGE_LENGTH = 200
const FALLBACK_NOTIFICATION_TITLE = 'Gemini finished replying'
const FALLBACK_NOTIFICATION_MESSAGE = 'Your response is ready.'
const TEST_NOTIFICATION_TITLE = 'Gemini Power Kit notification test'
const TEST_NOTIFICATION_MESSAGE = 'Notifications are working.'
const TEST_NOTIFICATION_DURATION_MS = 5_000
const IMAGE_DATA_URL_PREFIX = 'data:image/jpeg;base64,'
const MAX_IMAGE_DATA_URL_LENGTH = 750_000
const STREAM_GENERATE_URL = '*://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate*'
const CONTENT_REQUEST_TIMEOUT_MS = 2_000

let hasStarted = false
let notificationEventListenersStarted = false
let webRequestListenerStarted = false
let permissionEventListenersStarted = false
let unwatchNotificationSetting: (() => void) | null = null
let webRequestSyncPromise: Promise<void> = Promise.resolve()

const notificationTargets = new Map<string, {
  tabId: number
  windowId?: number
}>()
const notificationClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

type NotificationsApi = typeof browser.notifications

type BrowserWithOptionalNotifications = typeof browser & {
  notifications?: NotificationsApi
}

type RuntimeMessageSender = Parameters<
  Parameters<typeof browser.runtime.onMessage.addListener>[0]
>[1]
type WebRequestCompletedListener = Parameters<typeof browser.webRequest.onCompleted.addListener>[0]
type WebRequestCompletedDetails = Parameters<WebRequestCompletedListener>[0]

type NotificationSource = 'response-complete' | 'test'
type ImageNotificationPresentation = 'basic-icon' | 'image-template'

interface ImageNotificationPresentationResult {
  presentation: ImageNotificationPresentation
  platformOs: string
}

interface NotificationTarget {
  tabId?: number
  windowId?: number
  title: string
  message: string
  timestamp: number
  source: NotificationSource
  responseType: ResponseNotificationContentType
  imageDataUrl?: string
}

function logBackgroundEvent(
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.info('[ResponseCompleteNotificationBackground]', JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  }))
}

export function normalizeNotificationTitle(title: string): string {
  return normalizeNotificationText(title, MAX_NOTIFICATION_TITLE_LENGTH, FALLBACK_NOTIFICATION_TITLE)
}

export function normalizeNotificationMessage(message: string): string {
  return normalizeNotificationText(message, MAX_NOTIFICATION_MESSAGE_LENGTH, FALLBACK_NOTIFICATION_MESSAGE)
}

function normalizeNotificationText(text: string, maxLength: number, fallback: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const value = normalized || fallback
  return value.slice(0, maxLength)
}

function isSendableReadiness(readiness: NotificationReadiness): boolean {
  return readiness === 'allowed' || readiness === 'allowed-but-system-unknown'
}

export function startResponseCompleteNotificationBackground(): void {
  if (hasStarted) {
    return
  }

  hasStarted = true
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  ensureNotificationEventListeners()
  ensurePermissionEventListeners()
  unwatchNotificationSetting = enableResponseCompleteNotification.watch(() => {
    void scheduleWebRequestListenerSync()
  })
  void scheduleWebRequestListenerSync()
  logBackgroundEvent('started', {
    notificationApiAvailable: Boolean(getNotificationsApi()),
  })
}

function ensurePermissionEventListeners(): void {
  if (permissionEventListenersStarted) {
    return
  }

  permissionEventListenersStarted = true
  browser.permissions.onAdded.addListener(handlePermissionChanged)
  browser.permissions.onRemoved.addListener(handlePermissionChanged)
}

function handlePermissionChanged(): void {
  void scheduleWebRequestListenerSync()
}

function scheduleWebRequestListenerSync(): Promise<void> {
  webRequestSyncPromise = webRequestSyncPromise.then(
    syncWebRequestListener,
    syncWebRequestListener,
  )
  return webRequestSyncPromise
}

async function syncWebRequestListener(): Promise<void> {
  const enabled = await getResponseCompleteNotificationEnabled()
  const readiness = enabled
    ? await getResponseCompleteNotificationReadiness()
    : 'off'
  const shouldListen = enabled && isSendableReadiness(readiness)

  if (shouldListen && !webRequestListenerStarted) {
    browser.webRequest.onCompleted.addListener(
      handleStreamGenerateCompleted,
      { urls: [STREAM_GENERATE_URL] },
    )
    webRequestListenerStarted = true
    logBackgroundEvent('web-request-listener-started')
    return
  }

  if (!shouldListen && webRequestListenerStarted) {
    browser.webRequest.onCompleted.removeListener(handleStreamGenerateCompleted)
    webRequestListenerStarted = false
    logBackgroundEvent('web-request-listener-stopped', { readiness })
  }
}

function handleStreamGenerateCompleted(details: WebRequestCompletedDetails): void {
  void processStreamGenerateCompleted(details)
}

async function processStreamGenerateCompleted(details: WebRequestCompletedDetails): Promise<void> {
  if (details.tabId < 0 || details.statusCode !== 200) {
    return
  }

  const readiness = await getResponseCompleteNotificationReadiness()
  if (!isSendableReadiness(readiness)) {
    await scheduleWebRequestListenerSync()
    return
  }

  const content = await requestNotificationContent(details.tabId)
  if (content?.suppressed) {
    logBackgroundEvent('stream-complete-suppressed-foreground', {
      tabId: details.tabId,
      requestId: details.requestId,
    })
    return
  }

  const tab = await getTab(details.tabId)
  await handleCreateNotification({
    tabId: details.tabId,
    windowId: tab?.windowId,
    title: content?.title ?? FALLBACK_NOTIFICATION_TITLE,
    message: content?.message ?? FALLBACK_NOTIFICATION_MESSAGE,
    timestamp: Math.round(details.timeStamp || Date.now()),
    source: 'response-complete',
    responseType: content?.responseType ?? 'text',
    imageDataUrl: content?.imageDataUrl,
  })
}

async function requestNotificationContent(
  tabId: number,
): Promise<ResponseCompleteNotificationContent | null> {
  try {
    return await Promise.race([
      browser.tabs.sendMessage(tabId, {
        type: RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE,
      }) as Promise<ResponseCompleteNotificationContent>,
      new Promise<null>(resolve => setTimeout(() => resolve(null), CONTENT_REQUEST_TIMEOUT_MS)),
    ])
  } catch (error) {
    logBackgroundEvent('notification-content-unavailable', {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function getTab(tabId: number): Promise<Browser.tabs.Tab | null> {
  try {
    return await browser.tabs.get(tabId)
  } catch (error) {
    logBackgroundEvent('notification-tab-unavailable', {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function getNotificationsApi(): NotificationsApi | undefined {
  return (browser as BrowserWithOptionalNotifications).notifications
}

function ensureNotificationEventListeners(): void {
  if (notificationEventListenersStarted) {
    return
  }

  const notificationsApi = getNotificationsApi()
  if (!notificationsApi?.onClicked || !notificationsApi.onClosed) {
    logBackgroundEvent('notification-event-listeners-unavailable')
    return
  }

  notificationEventListenersStarted = true
  notificationsApi.onClicked.addListener(handleNotificationClicked)
  notificationsApi.onClosed.addListener(handleNotificationClosed)
  logBackgroundEvent('notification-event-listeners-started')
}

function handleRuntimeMessage(
  message: unknown,
  sender: RuntimeMessageSender,
): Promise<ResponseCompleteNotificationResponse> | undefined {
  if (isResponseCompleteNotificationGetReadinessMessage(message)) {
    return getReadinessResponse()
  }

  if (isResponseCompleteNotificationRequestPermissionMessage(message)) {
    return requestPermission()
  }

  if (isResponseCompleteNotificationAudioRequestPermissionMessage(message)) {
    return requestAudioPermission()
  }

  if (isResponseCompleteNotificationTestMessage(message)) {
    logBackgroundEvent('test-message-received', {
      eventTimestamp: message.payload.timestamp,
    })
    return handleCreateNotification({
      tabId: sender.tab?.id,
      windowId: sender.tab?.windowId,
      title: TEST_NOTIFICATION_TITLE,
      message: TEST_NOTIFICATION_MESSAGE,
      timestamp: message.payload.timestamp,
      source: 'test',
      responseType: 'text',
    })
  }

  return undefined
}

async function requestPermission(): Promise<ResponseCompleteNotificationResponse> {
  try {
    if (await hasResponseCompleteNotificationPermission()) {
      await scheduleWebRequestListenerSync()
      return { ok: true }
    }

    const granted = await browser.permissions.request({
      ...getResponseCompleteNotificationPermissionRequest(),
    })

    if (granted) {
      await scheduleWebRequestListenerSync()
      return { ok: true }
    }
    return { ok: false, error: 'permission-denied' }
  } catch (error) {
    console.warn('[ResponseCompleteNotification] Failed to request permission:', error)
    return {
      ok: false,
      error: 'permission-denied',
    }
  }
}

async function requestAudioPermission(): Promise<ResponseCompleteNotificationResponse> {
  if (import.meta.env.FIREFOX) {
    return {
      ok: false,
      audioPermissionAvailable: false,
      error: 'permission-denied',
    }
  }

  try {
    const granted = await browser.permissions.request({
      ...getResponseCompleteNotificationAudioPermissionRequest(),
    })
    return {
      ok: granted,
      audioPermissionAvailable: granted,
      ...(granted ? {} : { error: 'permission-denied' as const }),
    }
  } catch (error) {
    console.warn('[ResponseCompleteNotification] Failed to request audio permission:', error)
    return {
      ok: false,
      audioPermissionAvailable: false,
      error: 'permission-denied',
    }
  }
}

async function getReadinessResponse(): Promise<ResponseCompleteNotificationResponse> {
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

async function handleCreateNotification(
  target: NotificationTarget,
): Promise<ResponseCompleteNotificationResponse> {
  if (target.source === 'response-complete' && typeof target.tabId !== 'number') {
    return {
      ok: false,
      error: 'missing-tab',
    }
  }

  const readiness = await getResponseCompleteNotificationReadiness()
  logBackgroundEvent('create-readiness-checked', {
    source: target.source,
    readiness,
    tabId: target.tabId,
    eventTimestamp: target.timestamp,
  })
  if (!isSendableReadiness(readiness)) {
    return {
      ok: false,
      readiness,
      error: 'permission-denied',
    }
  }

  try {
    const notificationId = await createResponseCompleteNotification(target)
    if (target.source === 'test') {
      scheduleNotificationClear(notificationId, TEST_NOTIFICATION_DURATION_MS)
    }
    await playResponseCompleteNotificationAudio()
    logBackgroundEvent('notification-created', {
      notificationId,
      source: target.source,
      tabId: target.tabId,
      eventTimestamp: target.timestamp,
    })
    return {
      ok: true,
      readiness,
    }
  } catch (error) {
    console.warn('[ResponseCompleteNotificationBackground]', JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'notification-create-failed',
      source: target.source,
      tabId: target.tabId,
      eventTimestamp: target.timestamp,
      error: error instanceof Error ? error.message : String(error),
    }))
    return {
      ok: false,
      readiness,
      error: 'notification-failed',
    }
  }
}

async function createResponseCompleteNotification(target: NotificationTarget): Promise<string> {
  const notificationsApi = getNotificationsApi()
  if (!notificationsApi) {
    throw new Error('Notifications API is unavailable')
  }

  ensureNotificationEventListeners()
  const notificationId = `${target.source}:${target.tabId ?? 'popup'}:${target.timestamp}`
  if (typeof target.tabId === 'number') {
    notificationTargets.set(notificationId, {
      tabId: target.tabId,
      windowId: target.windowId,
    })
  }

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
      logBackgroundEvent('notification-template-selected', {
        notificationId,
        source: target.source,
        templateType: imageOptions.type,
        imagePresentation: imagePresentation.presentation,
        platformOs: imagePresentation.platformOs,
      })
      return notificationId
    } catch (error) {
      logBackgroundEvent('image-notification-fallback-basic', {
        notificationId,
        source: target.source,
        imagePresentation: imagePresentation.presentation,
        platformOs: imagePresentation.platformOs,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logBackgroundEvent('notification-create-requested', {
    notificationId,
    source: target.source,
    templateType: 'basic',
  })
  await notificationsApi.create(notificationId, basicOptions)
  logBackgroundEvent('notification-template-selected', {
    notificationId,
    source: target.source,
    templateType: 'basic',
  })

  return notificationId
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
    logBackgroundEvent('notification-platform-info-unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
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
    console.warn('[ResponseCompleteNotification] Failed to clear notification:', error)
  }
}

function scheduleNotificationClear(notificationId: string, delayMs: number): void {
  cancelScheduledNotificationClear(notificationId)
  const timer = setTimeout(() => {
    notificationClearTimers.delete(notificationId)
    notificationTargets.delete(notificationId)
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
  const target = notificationTargets.get(notificationId)
  if (!target) {
    return
  }

  try {
    if (typeof target.windowId === 'number') {
      await browser.windows.update(target.windowId, { focused: true })
    }
    await browser.tabs.update(target.tabId, { active: true })
  } catch (error) {
    console.warn('[ResponseCompleteNotification] Failed to focus notification target:', error)
  } finally {
    notificationTargets.delete(notificationId)
  }
}

function handleNotificationClosed(notificationId: string): void {
  cancelScheduledNotificationClear(notificationId)
  notificationTargets.delete(notificationId)
}

export function resetResponseCompleteNotificationBackgroundForTest(): void {
  if (webRequestListenerStarted) {
    browser.webRequest.onCompleted.removeListener(handleStreamGenerateCompleted)
  }
  unwatchNotificationSetting?.()
  unwatchNotificationSetting = null
  hasStarted = false
  notificationEventListenersStarted = false
  permissionEventListenersStarted = false
  webRequestListenerStarted = false
  webRequestSyncPromise = Promise.resolve()
  for (const timer of notificationClearTimers.values()) {
    clearTimeout(timer)
  }
  notificationClearTimers.clear()
  notificationTargets.clear()
}
