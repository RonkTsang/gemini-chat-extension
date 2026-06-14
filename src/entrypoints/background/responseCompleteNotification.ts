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
  clearAllDeepResearchTasks,
  clearDeepResearchTasksForTab,
  consumeDeepResearchReport,
  consumeDeepResearchStreamSuppression,
  registerDeepResearchPoll,
  type DeepResearchTask,
} from './deepResearchNotificationState'
import {
  classifyGeminiResponseRequest,
  type GeminiResponseRequest,
} from './geminiResponseRequest'
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
const BATCH_EXECUTE_URL = '*://gemini.google.com/_/BardChatUi/data/batchexecute*'
const CONTENT_REQUEST_TIMEOUT_MS = 2_000

let hasStarted = false
let notificationEventListenersStarted = false
let webRequestListenerStarted = false
let permissionEventListenersStarted = false
let tabEventListenersStarted = false
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
type WebRequestBeforeRequestListener = Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0]
type WebRequestBeforeRequestDetails = Parameters<WebRequestBeforeRequestListener>[0]

type NotificationSource = 'response-complete' | 'test'
type CompletionKind = 'standard-response' | 'deep-research'
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
  completionKind?: CompletionKind
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
  ensureTabEventListeners()
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

function ensureTabEventListeners(): void {
  if (tabEventListenersStarted) {
    return
  }

  tabEventListenersStarted = true
  browser.tabs.onRemoved.addListener(handleTabRemoved)
}

function handleTabRemoved(tabId: number): void {
  void clearDeepResearchTasksForTab(tabId)
    .then(tasks => logClearedDeepResearchTasks(tasks, 'tab-removed'))
    .catch(error => logDeepResearchStateError('deep-research-tab-clear-failed', error, { tabId }))
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
    browser.webRequest.onBeforeRequest.addListener(
      handleGeminiRequestStarted,
      { urls: [BATCH_EXECUTE_URL] },
    )
    browser.webRequest.onCompleted.addListener(
      handleGeminiRequestCompleted,
      { urls: [STREAM_GENERATE_URL, BATCH_EXECUTE_URL] },
    )
    webRequestListenerStarted = true
    logBackgroundEvent('web-request-listener-started', {
      beforeRequestUrls: [BATCH_EXECUTE_URL],
      completedUrls: [STREAM_GENERATE_URL, BATCH_EXECUTE_URL],
    })
    return
  }

  if (!shouldListen && webRequestListenerStarted) {
    browser.webRequest.onBeforeRequest.removeListener(handleGeminiRequestStarted)
    browser.webRequest.onCompleted.removeListener(handleGeminiRequestCompleted)
    webRequestListenerStarted = false
    logBackgroundEvent('web-request-listener-stopped', { readiness })
  }

  if (!shouldListen) {
    const tasks = await clearAllDeepResearchTasks()
    logClearedDeepResearchTasks(tasks, readiness === 'off' ? 'feature-disabled' : 'permission-unavailable')
  }
}

function handleGeminiRequestStarted(
  details: WebRequestBeforeRequestDetails,
): ReturnType<WebRequestBeforeRequestListener> {
  const request = classifyGeminiResponseRequest(details.url)
  if (request.kind !== 'deep-research-poll' || details.tabId < 0) {
    return undefined
  }

  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  void registerDeepResearchPoll(details.tabId, request.conversationId, eventTimestamp)
    .then((result) => {
      logExpiredDeepResearchTasks(result.expiredTasks)
      logBackgroundEvent(result.created ? 'deep-research-started' : 'deep-research-poll-observed', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
        startedAt: result.value.startedAt,
        lastPollAt: result.value.lastPollAt,
        suppressNextStreamGenerate: result.value.suppressNextStreamGenerate,
      })
    })
    .catch(error => logDeepResearchStateError('deep-research-poll-track-failed', error, {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      eventTimestamp,
    }))
  return undefined
}

function handleGeminiRequestCompleted(details: WebRequestCompletedDetails): void {
  const request = classifyGeminiResponseRequest(details.url)
  if (request.kind === 'stream-generate') {
    void processStreamGenerateCompleted(details)
    return
  }

  if (request.kind === 'deep-research-report') {
    void processDeepResearchReportCompleted(details, request)
  }
}

async function processStreamGenerateCompleted(details: WebRequestCompletedDetails): Promise<void> {
  if (details.tabId < 0 || details.statusCode !== 200) {
    logBackgroundEvent('stream-complete-ignored', {
      tabId: details.tabId,
      requestId: details.requestId,
      statusCode: details.statusCode,
    })
    return
  }

  try {
    const result = await consumeDeepResearchStreamSuppression(
      details.tabId,
      Math.round(details.timeStamp || Date.now()),
    )
    logExpiredDeepResearchTasks(result.expiredTasks)
    if (result.value) {
      logBackgroundEvent('deep-research-stream-suppressed', {
        tabId: details.tabId,
        conversationId: result.value.conversationId,
        requestId: details.requestId,
        eventTimestamp: Math.round(details.timeStamp || Date.now()),
        startedAt: result.value.startedAt,
        lastPollAt: result.value.lastPollAt,
      })
      return
    }
  } catch (error) {
    logDeepResearchStateError('deep-research-stream-suppression-check-failed', error, {
      tabId: details.tabId,
      requestId: details.requestId,
    })
  }

  logBackgroundEvent('standard-response-completed', {
    tabId: details.tabId,
    requestId: details.requestId,
    eventTimestamp: Math.round(details.timeStamp || Date.now()),
  })
  await processResponseCompleted(details, 'standard-response')
}

async function processDeepResearchReportCompleted(
  details: WebRequestCompletedDetails,
  request: Extract<GeminiResponseRequest, { kind: 'deep-research-report' }>,
): Promise<void> {
  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  if (details.tabId < 0 || details.statusCode !== 200) {
    logBackgroundEvent('deep-research-report-ignored-invalid', {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      statusCode: details.statusCode,
      eventTimestamp,
    })
    return
  }

  try {
    const result = await consumeDeepResearchReport(
      details.tabId,
      request.conversationId,
      eventTimestamp,
    )
    logExpiredDeepResearchTasks(result.expiredTasks)
    if (!result.value) {
      logBackgroundEvent('deep-research-report-ignored-untracked', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
      })
      return
    }

    logBackgroundEvent('deep-research-report-completed', {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      eventTimestamp,
      startedAt: result.value.startedAt,
      lastPollAt: result.value.lastPollAt,
      taskAgeMs: eventTimestamp - result.value.startedAt,
    })
  } catch (error) {
    logDeepResearchStateError('deep-research-report-consume-failed', error, {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      eventTimestamp,
    })
    return
  }

  await processResponseCompleted(details, 'deep-research')
}

async function processResponseCompleted(
  details: WebRequestCompletedDetails,
  completionKind: CompletionKind,
): Promise<void> {
  const readiness = await getResponseCompleteNotificationReadiness()
  if (!isSendableReadiness(readiness)) {
    logBackgroundEvent('response-complete-ignored-readiness', {
      completionKind,
      tabId: details.tabId,
      requestId: details.requestId,
      readiness,
    })
    await scheduleWebRequestListenerSync()
    return
  }

  const content = await requestNotificationContent(details.tabId, completionKind)
  if (content?.suppressed) {
    logBackgroundEvent('response-complete-suppressed-foreground', {
      completionKind,
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
    completionKind,
    responseType: content?.responseType ?? 'text',
    imageDataUrl: content?.imageDataUrl,
  })
}

function logExpiredDeepResearchTasks(tasks: DeepResearchTask[]): void {
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

function logClearedDeepResearchTasks(tasks: DeepResearchTask[], reason: string): void {
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

function logDeepResearchStateError(
  event: string,
  error: unknown,
  details: Record<string, unknown>,
): void {
  logBackgroundEvent(event, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  })
}

async function requestNotificationContent(
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
    logBackgroundEvent('notification-content-unavailable', {
      tabId,
      completionKind,
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
    completionKind: target.completionKind,
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
      completionKind: target.completionKind,
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
      completionKind: target.completionKind,
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
        completionKind: target.completionKind,
        templateType: imageOptions.type,
        imagePresentation: imagePresentation.presentation,
        platformOs: imagePresentation.platformOs,
      })
      return notificationId
    } catch (error) {
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

  logBackgroundEvent('notification-create-requested', {
    notificationId,
    source: target.source,
    completionKind: target.completionKind,
    templateType: 'basic',
  })
  await notificationsApi.create(notificationId, basicOptions)
  logBackgroundEvent('notification-template-selected', {
    notificationId,
    source: target.source,
    completionKind: target.completionKind,
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
    browser.webRequest.onBeforeRequest.removeListener(handleGeminiRequestStarted)
    browser.webRequest.onCompleted.removeListener(handleGeminiRequestCompleted)
  }
  unwatchNotificationSetting?.()
  unwatchNotificationSetting = null
  hasStarted = false
  notificationEventListenersStarted = false
  permissionEventListenersStarted = false
  tabEventListenersStarted = false
  webRequestListenerStarted = false
  webRequestSyncPromise = Promise.resolve()
  for (const timer of notificationClearTimers.values()) {
    clearTimeout(timer)
  }
  notificationClearTimers.clear()
  notificationTargets.clear()
}
