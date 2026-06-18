import type { StuffMediaDataEvent } from '@/common/event'
import type { ResponseCompleteNotificationPermissionKind } from '@/services/responseCompleteNotificationPermissionIntent'
import type { NotificationReadiness } from '@/services/responseCompleteNotificationSettings'

export const STUFF_MEDIA_DATA_RECEIVED_MESSAGE = 'stuff-media:data-received' as const
export const OPEN_IN_NEW_TAB_MESSAGE = 'stuff-page:open-in-new-tab' as const
export const FIREFOX_GET_INSTANCE_ID_MESSAGE = 'firefox:get-instance-id' as const
export const RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE = 'response-complete-notification:get-content' as const
export const RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE = 'response-complete-notification:test' as const
export const RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE = 'response-complete-notification:get-readiness' as const
export const RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE = 'response-complete-notification:request-permission' as const
export const RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE = 'response-complete-notification-audio:request-permission' as const
export const RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE = 'response-complete-notification:open-permission-popup' as const
export const RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PLAY_MESSAGE = 'response-complete-notification-audio:play' as const

export type ResponseNotificationContentType = 'text' | 'image'
export type ResponseCompletionKind = 'standard-response' | 'deep-research'

export interface StuffMediaDataReceivedMessage {
  type: typeof STUFF_MEDIA_DATA_RECEIVED_MESSAGE
  payload: StuffMediaDataEvent
}

export interface OpenInNewTabMessage {
  type: typeof OPEN_IN_NEW_TAB_MESSAGE
  payload: {
    url: string
  }
}

export interface FirefoxGetInstanceIdMessage {
  type: typeof FIREFOX_GET_INSTANCE_ID_MESSAGE
}

export interface FirefoxGetInstanceIdResponse {
  instanceId: string
}

export interface ResponseCompleteNotificationGetContentMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE
  payload: {
    completionKind: ResponseCompletionKind
  }
}

export interface ResponseCompleteNotificationContent {
  suppressed: boolean
  title: string
  message: string
  responseType: ResponseNotificationContentType
  completionConfirmed?: boolean
  imageDataUrl?: string
}

export interface ResponseCompleteNotificationTestMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE
  payload: {
    timestamp: number
  }
}

export interface ResponseCompleteNotificationGetReadinessMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE
}

export interface ResponseCompleteNotificationRequestPermissionMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE
}

export interface ResponseCompleteNotificationAudioRequestPermissionMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE
}

export interface ResponseCompleteNotificationOpenPermissionPopupMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE
  payload: {
    permissionKind: ResponseCompleteNotificationPermissionKind
  }
}

export interface ResponseCompleteNotificationAudioPlayMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PLAY_MESSAGE
  target: 'offscreen'
}

export interface ResponseCompleteNotificationResponse {
  ok: boolean
  status?: 'already-granted' | 'popup-opened' | 'fallback-window-opened'
  readiness?: NotificationReadiness
  audioPermissionAvailable?: boolean
  error?: 'missing-tab' | 'permission-denied' | 'notification-failed' | 'popup-open-failed' | 'permission-api-unavailable'
}

export function isStuffMediaDataReceivedMessage(
  message: unknown,
): message is StuffMediaDataReceivedMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<StuffMediaDataReceivedMessage>
  return candidate.type === STUFF_MEDIA_DATA_RECEIVED_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
}

export function isOpenInNewTabMessage(
  message: unknown,
): message is OpenInNewTabMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<OpenInNewTabMessage>
  return candidate.type === OPEN_IN_NEW_TAB_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
    && typeof candidate.payload.url === 'string'
}

export function isFirefoxGetInstanceIdMessage(
  message: unknown,
): message is FirefoxGetInstanceIdMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<FirefoxGetInstanceIdMessage>
  return candidate.type === FIREFOX_GET_INSTANCE_ID_MESSAGE
}

export function isResponseCompleteNotificationGetContentMessage(
  message: unknown,
): message is ResponseCompleteNotificationGetContentMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationGetContentMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
    && (
      candidate.payload.completionKind === 'standard-response'
      || candidate.payload.completionKind === 'deep-research'
    )
}

export function isResponseCompleteNotificationTestMessage(
  message: unknown,
): message is ResponseCompleteNotificationTestMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationTestMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
    && typeof candidate.payload.timestamp === 'number'
}

export function isResponseCompleteNotificationGetReadinessMessage(
  message: unknown,
): message is ResponseCompleteNotificationGetReadinessMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationGetReadinessMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE
}

export function isResponseCompleteNotificationRequestPermissionMessage(
  message: unknown,
): message is ResponseCompleteNotificationRequestPermissionMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationRequestPermissionMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE
}

export function isResponseCompleteNotificationAudioRequestPermissionMessage(
  message: unknown,
): message is ResponseCompleteNotificationAudioRequestPermissionMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationAudioRequestPermissionMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE
}

export function isResponseCompleteNotificationOpenPermissionPopupMessage(
  message: unknown,
): message is ResponseCompleteNotificationOpenPermissionPopupMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationOpenPermissionPopupMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
    && (
      candidate.payload.permissionKind === 'visual'
      || candidate.payload.permissionKind === 'audio'
    )
}

export function isResponseCompleteNotificationAudioPlayMessage(
  message: unknown,
): message is ResponseCompleteNotificationAudioPlayMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationAudioPlayMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PLAY_MESSAGE
    && candidate.target === 'offscreen'
}
