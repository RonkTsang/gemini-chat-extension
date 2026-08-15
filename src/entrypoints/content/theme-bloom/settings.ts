export interface ThemeBloomBooleanSetting {
  getValue: () => Promise<boolean>
  watch: (callback: (enabled: boolean) => void) => () => void
}

interface ThemeBloomSettingsControllerOptions {
  setting: ThemeBloomBooleanSetting
  prepare?: (signal: AbortSignal) => Promise<void>
  enable: () => void
  disable: () => void
}

export interface ThemeBloomSettingsController {
  start: () => Promise<void>
  stop: () => void
}

export function createThemeBloomSettingsController({
  setting,
  prepare = async () => undefined,
  enable,
  disable,
}: ThemeBloomSettingsControllerOptions): ThemeBloomSettingsController {
  let isStarted = false
  let appliedSetting: boolean | null = null
  let settingRevision = 0
  let unwatch: (() => void) | null = null
  let preparationAbortController: AbortController | null = null

  const abortPreparation = (): void => {
    preparationAbortController?.abort()
    preparationAbortController = null
  }

  const applySetting = (enabled: boolean): void => {
    if (appliedSetting === enabled) return

    appliedSetting = enabled
    settingRevision += 1
    const revision = settingRevision
    abortPreparation()

    if (!enabled) {
      disable()
      return
    }

    const abortController = new AbortController()
    preparationAbortController = abortController
    void prepare(abortController.signal)
      .then(() => {
        if (
          !isStarted
          || appliedSetting !== true
          || settingRevision !== revision
          || abortController.signal.aborted
        ) {
          return
        }
        enable()
      })
      .catch(() => {
        if (abortController.signal.aborted) return
        // Do not intercept page drops until preparation has succeeded.
        disable()
      })
      .finally(() => {
        if (preparationAbortController === abortController) {
          preparationAbortController = null
        }
      })
  }

  return {
    async start() {
      if (isStarted) return
      isStarted = true

      const initialRevision = settingRevision
      unwatch = setting.watch((enabled) => {
        applySetting(enabled)
      })

      let enabled = false
      try {
        enabled = await setting.getValue()
      } catch {
        // A failed read leaves Theme Bloom disabled for safety.
        enabled = false
      }

      if (!isStarted || settingRevision !== initialRevision) return
      applySetting(enabled)
    },

    stop() {
      if (!isStarted) return
      isStarted = false
      settingRevision += 1
      appliedSetting = null
      abortPreparation()
      unwatch?.()
      unwatch = null
      disable()
    },
  }
}
