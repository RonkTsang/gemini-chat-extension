import { browser } from 'wxt/browser'

export const RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY = 'responseCompleteNotificationPermissionIntent'
export const RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_TTL_MS = 5 * 60 * 1000

export type ResponseCompleteNotificationPermissionKind = 'visual' | 'audio'

export interface ResponseCompleteNotificationPermissionIntent {
  permissionKind: ResponseCompleteNotificationPermissionKind
  createdAt: number
  nonce: string
  sourceTabId?: number
  sourceWindowId?: number
}

export function isResponseCompleteNotificationPermissionKind(
  value: unknown,
): value is ResponseCompleteNotificationPermissionKind {
  return value === 'visual' || value === 'audio'
}

export function createResponseCompleteNotificationPermissionIntent(
  permissionKind: ResponseCompleteNotificationPermissionKind,
  source: {
    tabId?: number
    windowId?: number
  },
): ResponseCompleteNotificationPermissionIntent {
  return {
    permissionKind,
    createdAt: Date.now(),
    nonce: createNonce(),
    sourceTabId: source.tabId,
    sourceWindowId: source.windowId,
  }
}

export async function setResponseCompleteNotificationPermissionIntent(
  intent: ResponseCompleteNotificationPermissionIntent,
): Promise<void> {
  await browser.storage.session.set({
    [RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]: intent,
  })
}

export async function clearResponseCompleteNotificationPermissionIntent(): Promise<void> {
  await browser.storage.session.remove(RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY)
}

export async function consumeResponseCompleteNotificationPermissionIntent(
  expectedNonce?: string | null,
): Promise<ResponseCompleteNotificationPermissionIntent | null> {
  const intent = await getResponseCompleteNotificationPermissionIntent(expectedNonce)
  if (intent) {
    await clearResponseCompleteNotificationPermissionIntent()
  }
  return intent
}

export async function getResponseCompleteNotificationPermissionIntent(
  expectedNonce?: string | null,
): Promise<ResponseCompleteNotificationPermissionIntent | null> {
  const stored = await browser.storage.session.get(RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY)
  const candidate = stored[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]
  if (!isValidResponseCompleteNotificationPermissionIntent(candidate, expectedNonce)) {
    await clearResponseCompleteNotificationPermissionIntent()
    return null
  }
  return candidate
}

function isValidResponseCompleteNotificationPermissionIntent(
  value: unknown,
  expectedNonce?: string | null,
): value is ResponseCompleteNotificationPermissionIntent {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ResponseCompleteNotificationPermissionIntent>
  const now = Date.now()
  const isFresh = typeof candidate.createdAt === 'number'
    && candidate.createdAt <= now + 30_000
    && now - candidate.createdAt <= RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_TTL_MS

  return isResponseCompleteNotificationPermissionKind(candidate.permissionKind)
    && typeof candidate.nonce === 'string'
    && candidate.nonce.length > 0
    && (!expectedNonce || candidate.nonce === expectedNonce)
    && isFresh
    && (typeof candidate.sourceTabId === 'number' || typeof candidate.sourceTabId === 'undefined')
    && (typeof candidate.sourceWindowId === 'number' || typeof candidate.sourceWindowId === 'undefined')
}

function createNonce(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
