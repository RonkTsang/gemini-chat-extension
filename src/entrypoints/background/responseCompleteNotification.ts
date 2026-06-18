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
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
  type NotificationReadiness,
} from '@/services/responseCompleteNotificationSettings'
import {
  clearResponseCompleteNotificationPermissionIntent,
  createResponseCompleteNotificationPermissionIntent,
  getResponseCompleteNotificationPermissionIntent,
  setResponseCompleteNotificationPermissionIntent,
  type ResponseCompleteNotificationPermissionKind,
} from '@/services/responseCompleteNotificationPermissionIntent'
import {
  clearAllDeepResearchTasks,
  clearDeepResearchTasksForTab,
  consumeDeepResearchReport,
  consumeDeepResearchStreamSuppression,
  getDeepResearchTask,
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
  isResponseCompleteNotificationOpenPermissionPopupMessage,
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
const PERMISSION_POPUP_WIDTH = 360
const PERMISSION_POPUP_HEIGHT = 520
const PERMISSION_INTENT_POLL_INTERVAL_MS = 500
const PERMISSION_INTENT_POLL_MAX_ATTEMPTS = 60

let hasStarted = false
let notificationEventListenersStarted = false
let webRequestListenerStarted = false
let permissionEventListenersStarted = false
let tabEventListenersStarted = false
let unwatchNotificationSetting: (() => void) | null = null
let webRequestSyncPromise: Promise<void> = Promise.resolve()
let permissionIntentPollTimer: ReturnType<typeof setTimeout> | null = null
let permissionIntentPollAttempts = 0
const deepResearchPollsObservedBeforeRequest = new Set<string>()

const notificationTargets = new Map<string, {
  tabId: number
  windowId?: number
}>()
const notificationClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

type NotificationsApi = typeof browser.notifications

type BrowserWithOptionalNotifications = typeof browser & {
  notifications?: NotificationsApi
}

type BrowserWithOptionalAction = typeof browser & {
  action?: {
    openPopup?: (details?: { windowId?: number }) => Promise<void> | void
  }
  windows: typeof browser.windows & {
    create?: typeof browser.windows.create
  }
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
type DeepResearchPollObservationSource = 'before-request' | 'completed-fallback'
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
  void handlePermissionChangedAsync()
}

async function handlePermissionChangedAsync(): Promise<void> {
  const result = await enablePendingPermissionIntentIfGranted()
  if (result !== 'pending') {
    stopPendingPermissionIntentPolling()
  }
  await scheduleWebRequestListenerSync()
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

  deepResearchPollsObservedBeforeRequest.add(details.requestId)
  void trackDeepResearchPoll(details, request, 'before-request')
  return undefined
}

function trackDeepResearchPoll(
  details: Pick<WebRequestBeforeRequestDetails, 'requestId' | 'tabId' | 'timeStamp'>,
  request: Extract<GeminiResponseRequest, { kind: 'deep-research-poll' }>,
  observationSource: DeepResearchPollObservationSource,
): Promise<void> {
  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  return registerDeepResearchPoll(details.tabId, request.conversationId, eventTimestamp)
    .then((result) => {
      logExpiredDeepResearchTasks(result.expiredTasks)
      logBackgroundEvent(result.created ? 'deep-research-started' : 'deep-research-poll-observed', {
        observationSource,
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
      observationSource,
    }))
}

function handleGeminiRequestCompleted(details: WebRequestCompletedDetails): void {
  const request = classifyGeminiResponseRequest(details.url)
  if (request.kind === 'stream-generate') {
    void processStreamGenerateCompleted(details)
    return
  }

  if (request.kind === 'deep-research-poll') {
    void processDeepResearchPollCompleted(details, request)
    return
  }

  if (request.kind === 'deep-research-report') {
    void processDeepResearchReportCompleted(details, request)
  }
}

async function processDeepResearchPollCompleted(
  details: WebRequestCompletedDetails,
  request: Extract<GeminiResponseRequest, { kind: 'deep-research-poll' }>,
): Promise<void> {
  if (deepResearchPollsObservedBeforeRequest.delete(details.requestId)) {
    return
  }

  if (details.tabId < 0 || details.statusCode !== 200) {
    logBackgroundEvent('deep-research-poll-complete-ignored-invalid', {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      statusCode: details.statusCode,
      eventTimestamp: Math.round(details.timeStamp || Date.now()),
    })
    return
  }

  await trackDeepResearchPoll(details, request, 'completed-fallback')
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
    const trackedResult = await getDeepResearchTask(
      details.tabId,
      request.conversationId,
      eventTimestamp,
    )
    logExpiredDeepResearchTasks(trackedResult.expiredTasks)
    if (!trackedResult.value) {
      logBackgroundEvent('deep-research-report-ignored-untracked', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
      })
      return
    }

    const content = await requestNotificationContent(details.tabId, 'deep-research')
    if (content?.completionConfirmed !== true) {
      logBackgroundEvent('deep-research-report-ignored-not-complete', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
        contentAvailable: Boolean(content),
      })
      return
    }

    const result = await consumeDeepResearchReport(
      details.tabId,
      request.conversationId,
      eventTimestamp,
    )
    logExpiredDeepResearchTasks(result.expiredTasks)
    if (!result.value) {
      logBackgroundEvent('deep-research-report-ignored-already-consumed', {
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

    await processResponseCompleted(details, 'deep-research', content)
  } catch (error) {
    logDeepResearchStateError('deep-research-report-consume-failed', error, {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      eventTimestamp,
    })
  }
}

async function processResponseCompleted(
  details: WebRequestCompletedDetails,
  completionKind: CompletionKind,
  providedContent?: ResponseCompleteNotificationContent,
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

  const content = providedContent ?? await requestNotificationContent(details.tabId, completionKind)
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
    return openPermissionPopup({
      permissionKind: 'visual',
    }, sender)
  }

  if (isResponseCompleteNotificationAudioRequestPermissionMessage(message)) {
    return openPermissionPopup({
      permissionKind: 'audio',
    }, sender)
  }

  if (isResponseCompleteNotificationOpenPermissionPopupMessage(message)) {
    return openPermissionPopup(message.payload, sender)
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

async function openPermissionPopup(
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
      await scheduleWebRequestListenerSync()
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
    console.warn('[ResponseCompleteNotification] Failed to open permission popup:', error)
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
  await scheduleWebRequestListenerSync()
  return 'enabled'
}

function startPendingPermissionIntentPolling(): void {
  stopPendingPermissionIntentPolling()
  permissionIntentPollAttempts = 0
  void pollPendingPermissionIntent()
}

function stopPendingPermissionIntentPolling(): void {
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
    logBackgroundEvent('permission-intent-poll-failed', {
      error: error instanceof Error ? error.message : String(error),
    })
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
    logBackgroundEvent('permission-action-popup-open-failed', {
      windowId,
      error: error instanceof Error ? error.message : String(error),
    })
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
    logBackgroundEvent('permission-fallback-window-open-failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

async function getReadinessResponse(): Promise<ResponseCompleteNotificationResponse> {
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
  stopPendingPermissionIntentPolling()
  deepResearchPollsObservedBeforeRequest.clear()
  for (const timer of notificationClearTimers.values()) {
    clearTimeout(timer)
  }
  notificationClearTimers.clear()
  notificationTargets.clear()
}
