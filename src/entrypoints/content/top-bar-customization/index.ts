import {
  DEFAULT_TOP_BAR_SETTINGS,
  normalizeTopBarSettings,
  topBarSettingsStorage,
  type TopBarSettings,
} from '@/services/topBarCustomizationSettings'
import {
  startChatSettingsTopBarAction,
  startTopBarAction,
  stopChatSettingsTopBarAction,
  stopTopBarAction,
} from '../top-bar-action'
import topBarCustomizationCss from './style.css?raw'

const STYLE_ID = 'gpk-top-bar-customization-style'
const ROOT_HIDE_UPGRADE_REMINDER_ATTR = 'data-gpk-hide-upgrade-reminder'

export interface TopBarSettingsSource {
  getValue: () => Promise<unknown>
  watch: (callback: (settings: unknown) => void) => () => void
}

interface TopBarCustomizationControllerOptions {
  setting?: TopBarSettingsSource
  startChatSettingsShortcut?: () => void
  stopChatSettingsShortcut?: () => void
  startThemeShortcut?: () => void
  stopThemeShortcut?: () => void
}

export interface TopBarCustomizationController {
  start: () => Promise<void>
  stop: () => void
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = topBarCustomizationCss
  document.head.appendChild(style)
}

function applyUpgradeReminderSetting(hidden: boolean): void {
  document.documentElement.toggleAttribute(
    ROOT_HIDE_UPGRADE_REMINDER_ATTR,
    hidden,
  )

  if (hidden) {
    ensureStyle()
  } else {
    document.getElementById(STYLE_ID)?.remove()
  }
}

function clearUpgradeReminderSetting(): void {
  document.documentElement.removeAttribute(ROOT_HIDE_UPGRADE_REMINDER_ATTR)
  document.getElementById(STYLE_ID)?.remove()
}

export function createTopBarCustomizationController(
  {
    setting = topBarSettingsStorage,
    startChatSettingsShortcut = startChatSettingsTopBarAction,
    stopChatSettingsShortcut = stopChatSettingsTopBarAction,
    startThemeShortcut = startTopBarAction,
    stopThemeShortcut = stopTopBarAction,
  }: TopBarCustomizationControllerOptions = {},
): TopBarCustomizationController {
  let isStarted = false
  let lifecycleGeneration = 0
  let unwatch: (() => void) | null = null

  const applySettings = (settings: TopBarSettings): void => {
    if (settings.showChatSettingsShortcut) {
      startChatSettingsShortcut()
    } else {
      stopChatSettingsShortcut()
    }
    if (settings.showThemeShortcut) {
      startThemeShortcut()
    } else {
      stopThemeShortcut()
    }
    applyUpgradeReminderSetting(settings.hideUpgradeReminder)
  }

  return {
    async start() {
      if (isStarted) return
      isStarted = true
      const startGeneration = ++lifecycleGeneration

      let settings = DEFAULT_TOP_BAR_SETTINGS
      try {
        settings = normalizeTopBarSettings(await setting.getValue())
      } catch (error) {
        if (!isStarted || lifecycleGeneration !== startGeneration) return
        console.warn(
          '[TopBarCustomization] Failed to load settings; using defaults',
          error,
        )
      }

      if (!isStarted || lifecycleGeneration !== startGeneration) return

      applySettings(settings)
      unwatch = setting.watch((nextSettings) => {
        if (!isStarted || lifecycleGeneration !== startGeneration) return
        applySettings(normalizeTopBarSettings(nextSettings))
      })
    },

    stop() {
      isStarted = false
      lifecycleGeneration += 1
      unwatch?.()
      unwatch = null
      stopChatSettingsShortcut()
      stopThemeShortcut()
      clearUpgradeReminderSetting()
    },
  }
}
