import notificationAudioUrl from '@/assets/sound/notification.mp3?url'
import { logDevMessage } from '@/utils/devLogger'
import { browser } from 'wxt/browser'
import { isResponseCompleteNotificationAudioPlayMessage } from '@/types/runtime-messages'

const audio = new Audio(notificationAudioUrl)
audio.preload = 'auto'

browser.runtime.onMessage.addListener((message) => {
  if (!isResponseCompleteNotificationAudioPlayMessage(message)) {
    return
  }

  audio.currentTime = 0
  return audio.play().catch((error) => {
    if (import.meta.env.DEV) {
      logDevMessage('error', '[ResponseCompleteNotificationAudioOffscreen] Failed to play audio:', error)
    }
  })
})
