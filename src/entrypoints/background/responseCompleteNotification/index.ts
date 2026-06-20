import { browser } from 'wxt/browser'
import {
  enableResponseCompleteNotification,
  getResponseCompleteNotificationForegroundOnly,
  getResponseCompleteNotificationEnabled,
  getResponseCompleteNotificationReadiness,
} from '@/services/responseCompleteNotificationSettings'
import {
  clearAllDeepResearchTasks,
  clearDeepResearchTasksForTab,
  consumeDeepResearchReport,
  getDeepResearchTask,
  registerDeepResearchHistoryPoll,
  registerDeepResearchPoll,
} from './deepResearchState'
import {
  classifyGeminiResponseRequest,
  GEMINI_RPC_IDS,
  type GeminiResponseRequest,
} from './geminiResponseRequest'
import {
  isResponseCompleteNotificationAudioRequestPermissionMessage,
  isResponseCompleteNotificationGetReadinessMessage,
  isResponseCompleteNotificationOpenPermissionPopupMessage,
  isResponseCompleteNotificationRequestPermissionMessage,
  isResponseCompleteNotificationTestMessage,
  type ResponseCompleteNotificationContent,
  type ResponseCompleteNotificationResponse,
} from '@/types/runtime-messages'
import { playResponseCompleteNotificationAudio } from './audio'
import {
  requestDeepResearchDomStatus,
  requestNotificationContent,
} from './contentClient'
import {
  FALLBACK_NOTIFICATION_MESSAGE,
  FALLBACK_NOTIFICATION_TITLE,
  TEST_NOTIFICATION_MESSAGE,
  TEST_NOTIFICATION_TITLE,
} from './text'
import {
  ensurePermissionEventListeners,
  getReadinessResponse,
  openPermissionPopup,
  resetPermissionControllerForTest,
} from './permissionController'
import {
  logBackgroundEvent,
  logClearedDeepResearchTasks,
  logDeepResearchStateError,
  logExpiredDeepResearchTasks,
  warnNotificationDebugPayload,
} from './logger'
import { isSendableReadiness } from './readiness'
import {
  createResponseCompleteNotification,
  getNotificationsApi,
} from './presenter'
import {
  ensureNotificationEventListeners,
  resetNotificationRoutingForTest,
  scheduleNotificationClear,
} from './routing'
import type {
  CompletionKind,
  DeepResearchHistoryObservationSource,
  DeepResearchPollObservationSource,
  NotificationTarget,
  RuntimeMessageSender,
  WebRequestBeforeRequestDetails,
  WebRequestBeforeRequestListener,
  WebRequestCompletedDetails,
  WebRequestCompletedListener,
} from './types'

export {
  normalizeNotificationMessage,
  normalizeNotificationTitle,
} from './text'

const TEST_NOTIFICATION_DURATION_MS = 5_000
const STREAM_GENERATE_URL = '*://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate*'
const BATCH_EXECUTE_URL = '*://gemini.google.com/_/BardChatUi/data/batchexecute*'

let hasStarted = false
let webRequestListenerStarted = false
let tabEventListenersStarted = false
let unwatchNotificationSetting: (() => void) | null = null
let webRequestSyncPromise: Promise<void> = Promise.resolve()
const deepResearchPollsObservedBeforeRequest = new Set<string>()

export function startResponseCompleteNotificationBackground(): void {
  if (hasStarted) {
    return
  }

  hasStarted = true
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  ensureNotificationEventListeners()
  ensurePermissionEventListeners(scheduleWebRequestListenerSync)
  ensureTabEventListeners()
  unwatchNotificationSetting = enableResponseCompleteNotification.watch(() => {
    void scheduleWebRequestListenerSync()
  })
  void scheduleWebRequestListenerSync()
  if (import.meta.env.DEV) {
    logBackgroundEvent('started', {
      notificationApiAvailable: Boolean(getNotificationsApi()),
    })
  }
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
    .then((tasks) => {
      if (import.meta.env.DEV) {
        logClearedDeepResearchTasks(tasks, 'tab-removed')
      }
    })
    .catch((error) => {
      if (import.meta.env.DEV) {
        logDeepResearchStateError('deep-research-tab-clear-failed', error, { tabId })
      }
    })
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
    if (import.meta.env.DEV) {
      logBackgroundEvent('web-request-listener-started', {
        beforeRequestUrls: [BATCH_EXECUTE_URL],
        completedUrls: [STREAM_GENERATE_URL, BATCH_EXECUTE_URL],
      })
    }
    return
  }

  if (!shouldListen && webRequestListenerStarted) {
    browser.webRequest.onBeforeRequest.removeListener(handleGeminiRequestStarted)
    browser.webRequest.onCompleted.removeListener(handleGeminiRequestCompleted)
    webRequestListenerStarted = false
    if (import.meta.env.DEV) {
      logBackgroundEvent('web-request-listener-stopped', { readiness })
    }
  }

  if (!shouldListen) {
    const tasks = await clearAllDeepResearchTasks()
    if (import.meta.env.DEV) {
      logClearedDeepResearchTasks(tasks, readiness === 'off' ? 'feature-disabled' : 'permission-unavailable')
    }
  }
}

function handleGeminiRequestStarted(
  details: WebRequestBeforeRequestDetails,
): ReturnType<WebRequestBeforeRequestListener> {
  const request = classifyGeminiResponseRequest(details.url)
  if (!isDeepResearchPollRequest(request) || details.tabId < 0) {
    return undefined
  }

  deepResearchPollsObservedBeforeRequest.add(details.requestId)
  void trackDeepResearchPoll(details, request, 'before-request')
  return undefined
}

function trackDeepResearchPoll(
  details: Pick<WebRequestBeforeRequestDetails, 'requestId' | 'tabId' | 'timeStamp'>,
  request: Extract<GeminiResponseRequest, { kind: 'batchexecute' }>,
  observationSource: DeepResearchPollObservationSource,
): Promise<void> {
  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  return registerDeepResearchPoll(details.tabId, request.conversationId, eventTimestamp)
    .then((result) => {
      if (import.meta.env.DEV) {
        logExpiredDeepResearchTasks(result.expiredTasks)
        logBackgroundEvent(result.created ? 'deep-research-started' : 'deep-research-poll-observed', {
          observationSource,
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
          startedAt: result.value.startedAt,
          lastPollAt: result.value.lastPollAt,
        })
      }
    })
    .catch((error) => {
      if (import.meta.env.DEV) {
        logDeepResearchStateError('deep-research-poll-track-failed', error, {
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
          observationSource,
        })
      }
    })
}

function handleGeminiRequestCompleted(details: WebRequestCompletedDetails): void {
  const request = classifyGeminiResponseRequest(details.url)
  if (request.kind === 'stream-generate') {
    void processStreamGenerateCompleted(details)
    return
  }

  if (isDeepResearchPollRequest(request)) {
    void processDeepResearchPollCompleted(details, request)
    return
  }

  if (isConversationHistoryRequest(request)) {
    void processConversationHistoryCompleted(details, request)
  }
}

async function processDeepResearchPollCompleted(
  details: WebRequestCompletedDetails,
  request: Extract<GeminiResponseRequest, { kind: 'batchexecute' }>,
): Promise<void> {
  if (deepResearchPollsObservedBeforeRequest.delete(details.requestId)) {
    return
  }

  if (details.tabId < 0 || details.statusCode !== 200) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('deep-research-poll-complete-ignored-invalid', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        statusCode: details.statusCode,
        eventTimestamp: Math.round(details.timeStamp || Date.now()),
      })
    }
    return
  }

  await trackDeepResearchPoll(details, request, 'completed-fallback')
}

async function processStreamGenerateCompleted(details: WebRequestCompletedDetails): Promise<void> {
  if (details.tabId < 0 || details.statusCode !== 200) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('stream-complete-ignored', {
        tabId: details.tabId,
        requestId: details.requestId,
        statusCode: details.statusCode,
      })
    }
    return
  }

  if (import.meta.env.DEV) {
    logBackgroundEvent('standard-response-completed', {
      tabId: details.tabId,
      requestId: details.requestId,
      eventTimestamp: Math.round(details.timeStamp || Date.now()),
    })
  }
  await processResponseCompleted(details, 'standard-response')
}

async function processConversationHistoryCompleted(
  details: WebRequestCompletedDetails,
  request: Extract<GeminiResponseRequest, { kind: 'batchexecute' }>,
): Promise<void> {
  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  if (details.tabId < 0 || details.statusCode !== 200) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('deep-research-report-ignored-invalid', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        statusCode: details.statusCode,
        eventTimestamp,
      })
    }
    return
  }

  try {
    const trackedResult = await getDeepResearchTask(
      details.tabId,
      request.conversationId,
      eventTimestamp,
    )
    if (import.meta.env.DEV) {
      logExpiredDeepResearchTasks(trackedResult.expiredTasks)
    }
    if (!trackedResult.value) {
      await handleUntrackedConversationHistoryCompleted(details, request, eventTimestamp)
      return
    }

    const content = await requestNotificationContent(details.tabId, 'deep-research')
    if (content?.completionConfirmed !== true) {
      if (import.meta.env.DEV) {
        logBackgroundEvent('deep-research-report-ignored-not-complete', {
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
          contentAvailable: Boolean(content),
        })
      }
      return
    }

    const result = await consumeDeepResearchReport(
      details.tabId,
      request.conversationId,
      eventTimestamp,
    )
    if (import.meta.env.DEV) {
      logExpiredDeepResearchTasks(result.expiredTasks)
    }
    if (!result.value) {
      if (import.meta.env.DEV) {
        logBackgroundEvent('deep-research-report-ignored-already-consumed', {
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
        })
      }
      return
    }

    if (import.meta.env.DEV) {
      logBackgroundEvent('deep-research-report-completed', {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
        startedAt: result.value.startedAt,
        lastPollAt: result.value.lastPollAt,
        taskAgeMs: eventTimestamp - result.value.startedAt,
      })
    }

    await processResponseCompleted(details, 'deep-research', content)
  } catch (error) {
    if (import.meta.env.DEV) {
      logDeepResearchStateError('deep-research-report-consume-failed', error, {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
      })
    }
  }
}

async function handleUntrackedConversationHistoryCompleted(
  details: WebRequestCompletedDetails,
  request: Extract<GeminiResponseRequest, { kind: 'batchexecute' }>,
  eventTimestamp: number,
): Promise<void> {
  const status = await requestDeepResearchDomStatus(details.tabId, request.conversationId)
  if (import.meta.env.DEV) {
    logBackgroundEvent('deep-research-dom-status', {
      tabId: details.tabId,
      conversationId: request.conversationId,
      requestId: details.requestId,
      eventTimestamp,
      state: status?.state ?? 'unavailable',
    })
  }

  if (status?.state === 'processing') {
    await trackDeepResearchHistoryPoll(details, request, 'history-completed')
    return
  }

  if (import.meta.env.DEV) {
    logBackgroundEvent(
      status?.state === 'completed'
        ? 'deep-research-history-completed-untracked'
        : 'deep-research-report-ignored-untracked',
      {
        tabId: details.tabId,
        conversationId: request.conversationId,
        requestId: details.requestId,
        eventTimestamp,
      },
    )
  }
}

function trackDeepResearchHistoryPoll(
  details: Pick<WebRequestCompletedDetails, 'requestId' | 'tabId' | 'timeStamp'>,
  request: Extract<GeminiResponseRequest, { kind: 'batchexecute' }>,
  observationSource: DeepResearchHistoryObservationSource,
): Promise<void> {
  const eventTimestamp = Math.round(details.timeStamp || Date.now())
  return registerDeepResearchHistoryPoll(details.tabId, request.conversationId, eventTimestamp)
    .then((result) => {
      if (import.meta.env.DEV) {
        logExpiredDeepResearchTasks(result.expiredTasks)
        logBackgroundEvent(result.created ? 'deep-research-history-task-started' : 'deep-research-history-poll-observed', {
          observationSource,
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
          startedAt: result.value.startedAt,
          lastPollAt: result.value.lastPollAt,
        })
      }
    })
    .catch((error) => {
      if (import.meta.env.DEV) {
        logDeepResearchStateError('deep-research-history-poll-track-failed', error, {
          tabId: details.tabId,
          conversationId: request.conversationId,
          requestId: details.requestId,
          eventTimestamp,
          observationSource,
        })
      }
    })
}

async function processResponseCompleted(
  details: WebRequestCompletedDetails,
  completionKind: CompletionKind,
  providedContent?: ResponseCompleteNotificationContent,
): Promise<void> {
  const readiness = await getResponseCompleteNotificationReadiness()
  if (!isSendableReadiness(readiness)) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('response-complete-ignored-readiness', {
        completionKind,
        tabId: details.tabId,
        requestId: details.requestId,
        readiness,
      })
    }
    await scheduleWebRequestListenerSync()
    return
  }

  const [foregroundOnly, content] = await Promise.all([
    getResponseCompleteNotificationForegroundOnly(),
    providedContent
      ? Promise.resolve(providedContent)
      : requestNotificationContent(details.tabId, completionKind),
  ])
  const shouldSuppressNotification = foregroundOnly && content?.isForeground === true
  if (shouldSuppressNotification) {
    if (import.meta.env.DEV) {
      logBackgroundEvent('response-complete-suppressed-foreground', {
        completionKind,
        tabId: details.tabId,
        requestId: details.requestId,
        foregroundOnly,
      })
    }
    return
  }

  await handleCreateNotification({
    tabId: details.tabId,
    title: content?.title ?? FALLBACK_NOTIFICATION_TITLE,
    message: content?.message ?? FALLBACK_NOTIFICATION_MESSAGE,
    timestamp: Math.round(details.timeStamp || Date.now()),
    source: 'response-complete',
    completionKind,
    responseType: content?.responseType ?? 'text',
    imageDataUrl: content?.imageDataUrl,
  })
}

function isDeepResearchPollRequest(
  request: GeminiResponseRequest,
): request is Extract<GeminiResponseRequest, { kind: 'batchexecute' }> {
  return request.kind === 'batchexecute' && request.rpcId === GEMINI_RPC_IDS.deepResearchPoll
}

function isConversationHistoryRequest(
  request: GeminiResponseRequest,
): request is Extract<GeminiResponseRequest, { kind: 'batchexecute' }> {
  return request.kind === 'batchexecute' && request.rpcId === GEMINI_RPC_IDS.conversationHistory
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
    if (import.meta.env.DEV) {
      logBackgroundEvent('test-message-received', {
        eventTimestamp: message.payload.timestamp,
      })
    }
    return handleCreateNotification({
      tabId: sender.tab?.id,
      title: TEST_NOTIFICATION_TITLE,
      message: TEST_NOTIFICATION_MESSAGE,
      timestamp: message.payload.timestamp,
      source: 'test',
      responseType: 'text',
    })
  }

  return undefined
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
  if (import.meta.env.DEV) {
    logBackgroundEvent('create-readiness-checked', {
      source: target.source,
      completionKind: target.completionKind,
      readiness,
      tabId: target.tabId,
      eventTimestamp: target.timestamp,
    })
  }
  if (!isSendableReadiness(readiness)) {
    return {
      ok: false,
      readiness,
      error: 'permission-denied',
    }
  }

  try {
    ensureNotificationEventListeners()
    const notificationId = await createResponseCompleteNotification(target)
    if (target.source === 'test') {
      scheduleNotificationClear(notificationId, TEST_NOTIFICATION_DURATION_MS)
    }
    await playResponseCompleteNotificationAudio()
    if (import.meta.env.DEV) {
      logBackgroundEvent('notification-created', {
        notificationId,
        source: target.source,
        completionKind: target.completionKind,
        tabId: target.tabId,
        eventTimestamp: target.timestamp,
      })
    }
    return {
      ok: true,
      readiness,
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      warnNotificationDebugPayload('[ResponseCompleteNotificationBackground]', 'notification-create-failed', {
        source: target.source,
        completionKind: target.completionKind,
        tabId: target.tabId,
        eventTimestamp: target.timestamp,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return {
      ok: false,
      readiness,
      error: 'notification-failed',
    }
  }
}

export function resetResponseCompleteNotificationBackgroundForTest(): void {
  if (webRequestListenerStarted) {
    browser.webRequest.onBeforeRequest.removeListener(handleGeminiRequestStarted)
    browser.webRequest.onCompleted.removeListener(handleGeminiRequestCompleted)
  }
  unwatchNotificationSetting?.()
  unwatchNotificationSetting = null
  hasStarted = false
  tabEventListenersStarted = false
  webRequestListenerStarted = false
  webRequestSyncPromise = Promise.resolve()
  resetPermissionControllerForTest()
  resetNotificationRoutingForTest()
  deepResearchPollsObservedBeforeRequest.clear()
}
