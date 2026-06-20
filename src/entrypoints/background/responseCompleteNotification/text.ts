export const FALLBACK_NOTIFICATION_TITLE = 'Gemini finished replying'
export const FALLBACK_NOTIFICATION_MESSAGE = 'Your response is ready.'
export const TEST_NOTIFICATION_TITLE = 'Gemini Power Kit notification test'
export const TEST_NOTIFICATION_MESSAGE = 'Notifications are working.'

const MAX_NOTIFICATION_TITLE_LENGTH = 120
const MAX_NOTIFICATION_MESSAGE_LENGTH = 200

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
