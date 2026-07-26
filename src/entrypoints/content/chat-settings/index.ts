import {
  DEFAULT_CHAT_SETTINGS,
  chatSettingsStorage,
  normalizeChatSettings,
  type ChatSettings,
} from '@/services/chatSettings'
import {
  applyChatSettingsStyles,
  clearChatSettingsStyles,
} from './styleController'

export interface ChatSettingsSource {
  getValue: () => Promise<unknown>
  watch: (callback: (settings: unknown) => void) => () => void
}

interface ChatSettingsControllerOptions {
  setting?: ChatSettingsSource
  apply?: (settings: ChatSettings) => void
  clear?: () => void
}

export interface ChatSettingsController {
  start: () => Promise<void>
  stop: () => void
}

export function createChatSettingsController(
  {
    setting = chatSettingsStorage,
    apply = applyChatSettingsStyles,
    clear = clearChatSettingsStyles,
  }: ChatSettingsControllerOptions = {},
): ChatSettingsController {
  let isStarted = false
  let lifecycleGeneration = 0
  let unwatch: (() => void) | null = null

  return {
    async start() {
      if (isStarted) return
      isStarted = true
      const startGeneration = ++lifecycleGeneration

      let settings = DEFAULT_CHAT_SETTINGS
      try {
        settings = normalizeChatSettings(await setting.getValue())
      } catch (error) {
        if (!isStarted || lifecycleGeneration !== startGeneration) return
        console.warn(
          '[ChatSettings] Failed to load settings; using defaults',
          error,
        )
      }

      if (!isStarted || lifecycleGeneration !== startGeneration) return

      apply(settings)
      unwatch = setting.watch((nextSettings) => {
        if (!isStarted || lifecycleGeneration !== startGeneration) return
        apply(normalizeChatSettings(nextSettings))
      })
    },

    stop() {
      isStarted = false
      lifecycleGeneration += 1
      unwatch?.()
      unwatch = null
      clear()
    },
  }
}
