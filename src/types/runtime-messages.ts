import type { StuffMediaDataEvent } from '@/common/event'

export const STUFF_MEDIA_DATA_RECEIVED_MESSAGE = 'stuff-media:data-received' as const

export interface StuffMediaDataReceivedMessage {
  type: typeof STUFF_MEDIA_DATA_RECEIVED_MESSAGE
  payload: StuffMediaDataEvent
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
