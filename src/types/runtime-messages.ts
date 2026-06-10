import type { StuffMediaDataEvent } from '@/common/event'
import type { NotificationReadiness } from '@/services/responseCompleteNotificationSettings'

export const STUFF_MEDIA_DATA_RECEIVED_MESSAGE = 'stuff-media:data-received' as const
export const OPEN_IN_NEW_TAB_MESSAGE = 'stuff-page:open-in-new-tab' as const
export const FIREFOX_GET_INSTANCE_ID_MESSAGE = 'firefox:get-instance-id' as const
export const RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE = 'response-complete-notification:create' as const
export const RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE = 'response-complete-notification:test' as const
export const RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE = 'response-complete-notification:get-readiness' as const
export const RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE = 'response-complete-notification:request-permission' as const

export type ResponseNotificationContentType = 'text' | 'image'

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

export interface ResponseCompleteNotificationCreateMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE
  payload: {
    title: string
    message: string
    timestamp: number
    responseType: ResponseNotificationContentType
    imageDataUrl?: string
  }
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

export interface ResponseCompleteNotificationResponse {
  ok: boolean
  readiness?: NotificationReadiness
  error?: 'missing-tab' | 'permission-denied' | 'notification-failed'
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

export function isResponseCompleteNotificationCreateMessage(
  message: unknown,
): message is ResponseCompleteNotificationCreateMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as Partial<ResponseCompleteNotificationCreateMessage>
  return candidate.type === RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE
    && !!candidate.payload
    && typeof candidate.payload === 'object'
    && typeof candidate.payload.title === 'string'
    && typeof candidate.payload.message === 'string'
    && typeof candidate.payload.timestamp === 'number'
    && (candidate.payload.responseType === 'text' || candidate.payload.responseType === 'image')
    && (
      candidate.payload.imageDataUrl === undefined
      || typeof candidate.payload.imageDataUrl === 'string'
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
