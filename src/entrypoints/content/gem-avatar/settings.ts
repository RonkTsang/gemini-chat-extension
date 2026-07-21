export interface GemAvatarBooleanSetting {
  getValue: () => Promise<boolean>
  watch: (callback: (enabled: boolean) => void) => () => void
}

interface GemAvatarSettingsControllerOptions {
  setting: GemAvatarBooleanSetting
  start: () => void
  stop: () => void
}

export interface GemAvatarSettingsController {
  start: () => Promise<void>
  stop: () => void
}

export function createGemAvatarSettingsController({
  setting,
  start,
  stop,
}: GemAvatarSettingsControllerOptions): GemAvatarSettingsController {
  let isStarted = false
  let unwatch: (() => void) | null = null

  const applySetting = (enabled: boolean): void => {
    if (enabled) {
      start()
      return
    }

    stop()
  }

  return {
    async start() {
      if (isStarted) {
        return
      }

      isStarted = true

      let enabled = false
      try {
        enabled = await setting.getValue()
      } catch (error) {
        console.warn('[GemAvatar] Failed to load setting; disabling by default', error)
      }

      if (!isStarted) {
        return
      }

      applySetting(enabled)
      unwatch = setting.watch(applySetting)
    },

    stop() {
      isStarted = false
      unwatch?.()
      unwatch = null
      stop()
    },
  }
}
