import notificationAudioUrl from '@/assets/sound/notification.mp3?url'
import { logDevMessage } from '@/utils/devLogger'
import { browser } from 'wxt/browser'
import { isResponseCompleteNotificationAudioPlayMessage } from '@/types/runtime-messages'
import { getResponseCompleteNotificationAudioAsset } from '@/services/responseCompleteNotificationAudioAsset'

const audio = new Audio()
audio.preload = 'auto'

let activeCustomAudioUrl: string | null = null
let activeCustomAudioCacheKey: string | null = null

function resetCustomAudioUrl(nextUrl: string | null, nextCacheKey: string | null): void {
  if (activeCustomAudioUrl && activeCustomAudioUrl !== nextUrl) {
    URL.revokeObjectURL(activeCustomAudioUrl)
  }

  activeCustomAudioUrl = nextUrl
  activeCustomAudioCacheKey = nextCacheKey
}

async function resolveNotificationAudioUrl(): Promise<string> {
  try {
    const customAudio = await getResponseCompleteNotificationAudioAsset()
    if (!customAudio) {
      resetCustomAudioUrl(null, null)
      return notificationAudioUrl
    }

    const cacheKey = `${customAudio.id}:${customAudio.updatedAt}`
    if (activeCustomAudioUrl && activeCustomAudioCacheKey === cacheKey) {
      return activeCustomAudioUrl
    }

    const objectUrl = URL.createObjectURL(customAudio.blob)
    resetCustomAudioUrl(objectUrl, cacheKey)
    return objectUrl
  } catch (error) {
    if (import.meta.env.DEV) {
      logDevMessage('error', '[ResponseCompleteNotificationAudioOffscreen] Failed to resolve custom audio:', error)
    }
    resetCustomAudioUrl(null, null)
    return notificationAudioUrl
  }
}

export async function playResponseCompleteNotificationAudioFromOffscreen(): Promise<void> {
  audio.src = await resolveNotificationAudioUrl()
  audio.currentTime = 0
  await audio.play().catch((error) => {
    if (import.meta.env.DEV) {
      logDevMessage('error', '[ResponseCompleteNotificationAudioOffscreen] Failed to play audio:', error)
    }
  })
}

export function resetResponseCompleteNotificationAudioOffscreenForTest(): void {
  resetCustomAudioUrl(null, null)
  audio.removeAttribute('src')
  audio.load()
}

browser.runtime.onMessage.addListener((message) => {
  if (!isResponseCompleteNotificationAudioPlayMessage(message)) {
    return
  }

  return playResponseCompleteNotificationAudioFromOffscreen()
})
