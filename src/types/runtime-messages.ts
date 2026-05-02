import type { StuffMediaDataEvent } from '@/common/event'

export const STUFF_MEDIA_DATA_RECEIVED_MESSAGE = 'stuff-media:data-received' as const
export const OPEN_IN_NEW_TAB_MESSAGE = 'stuff-page:open-in-new-tab' as const

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
