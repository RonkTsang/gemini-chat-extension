import { browser } from 'wxt/browser'
import {
  getResponseCompleteNotificationAudioEnabled,
  getResponseCompleteNotificationEnabled,
  hasResponseCompleteNotificationAudioPermission,
} from '@/services/responseCompleteNotificationSettings'
import { RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PLAY_MESSAGE } from '@/types/runtime-messages'

const OFFSCREEN_DOCUMENT_PATH = '/notification-audio-offscreen.html'
const OFFSCREEN_JUSTIFICATION = 'Play an optional sound after response-complete notifications'

type RuntimeWithContexts = typeof browser.runtime & {
  getContexts?: (filter: {
    contextTypes: string[]
    documentUrls: string[]
  }) => Promise<unknown[]>
}

type BrowserWithOffscreen = typeof browser & {
  offscreen?: {
    createDocument: (parameters: {
      url: string
      reasons: string[]
      justification: string
    }) => Promise<void>
  }
}

type ServiceWorkerClients = {
  matchAll: () => Promise<Array<{ url: string }>>
}

let creatingOffscreenDocument: Promise<void> | null = null

function logAudioEvent(event: string, details: Record<string, unknown> = {}): void {
  console.info('[ResponseCompleteNotificationAudio]', JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  }))
}

async function hasOffscreenDocument(): Promise<boolean> {
  const extensionUrl = browser.runtime.getURL('/icon/512.png')
  const offscreenUrl = new URL(OFFSCREEN_DOCUMENT_PATH, extensionUrl).href
  const runtime = browser.runtime as RuntimeWithContexts

  if (runtime.getContexts) {
    const contexts = await runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    })
    return contexts.length > 0
  }

  const clientsApi = (globalThis as typeof globalThis & {
    clients?: ServiceWorkerClients
  }).clients
  if (!clientsApi) {
    return false
  }

  const matchedClients = await clientsApi.matchAll()
  return matchedClients.some(client => client.url === offscreenUrl)
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return
  }

  if (!creatingOffscreenDocument) {
    const offscreen = (browser as BrowserWithOffscreen).offscreen
    if (!offscreen?.createDocument) {
      throw new Error('Offscreen API is unavailable')
    }

    creatingOffscreenDocument = offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK'],
      justification: OFFSCREEN_JUSTIFICATION,
    }).then(() => {
      logAudioEvent('notification-audio-offscreen-created')
    }).finally(() => {
      creatingOffscreenDocument = null
    })
  }

  await creatingOffscreenDocument
}

export async function playResponseCompleteNotificationAudio(): Promise<void> {
  if (import.meta.env.FIREFOX) {
    return
  }

  try {
    const [notificationEnabled, audioEnabled, hasPermission] = await Promise.all([
      getResponseCompleteNotificationEnabled(),
      getResponseCompleteNotificationAudioEnabled(),
      hasResponseCompleteNotificationAudioPermission(),
    ])

    if (!notificationEnabled || !audioEnabled || !hasPermission) {
      return
    }

    await ensureOffscreenDocument()
    await browser.runtime.sendMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_PLAY_MESSAGE,
      target: 'offscreen',
    })
    logAudioEvent('notification-audio-play-requested')
  } catch (error) {
    console.warn('[ResponseCompleteNotificationAudio]', JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'notification-audio-play-failed',
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}

export function resetResponseCompleteNotificationAudioForTest(): void {
  creatingOffscreenDocument = null
}
