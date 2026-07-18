export interface BooleanSetting {
  getValue: () => Promise<boolean>
  watch: (callback: (enabled: boolean) => void) => () => void
}

interface BulkDeleteSettingsControllerOptions {
  setting: BooleanSetting
  start: () => void
  stop: () => void
}

export interface BulkDeleteSettingsController {
  start: () => Promise<void>
  stop: () => void
}

export function createBulkDeleteSettingsController({
  setting,
  start,
  stop,
}: BulkDeleteSettingsControllerOptions): BulkDeleteSettingsController {
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

      let enabled = true
      try {
        enabled = await setting.getValue()
      } catch (error) {
        console.warn('[BulkDelete] Failed to load setting; enabling by default', error)
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
