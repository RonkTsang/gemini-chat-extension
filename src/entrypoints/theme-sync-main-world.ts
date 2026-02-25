import { GEM_EXT_EVENTS } from '@/common/event'

const STORAGE_KEY_THEME = 'theme'
const STORAGE_KEY_BARD_COLOR_THEME = 'Bard-Color-Theme'
const BODY_LIGHT_THEME_CLASS = 'light-theme'
const BODY_DARK_THEME_CLASS = 'dark-theme'
const READY_ATTR = 'data-gpk-theme-sync-ready'

type GeminiTheme = 'light' | 'dark'

interface ThemeAppearanceApplyEventDetail {
  mode: 'system' | 'light' | 'dark'
  theme: GeminiTheme
  bardColorTheme: 'Bard-Light-Theme' | 'Bard-Dark-Theme' | null
}

function applyBodyTheme(theme: GeminiTheme): void {
  const body = document.body
  body.classList.remove(BODY_LIGHT_THEME_CLASS, BODY_DARK_THEME_CLASS)
  body.classList.add(theme === 'dark' ? BODY_DARK_THEME_CLASS : BODY_LIGHT_THEME_CLASS)
}

function safeGetStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Keep runtime theme in sync even if persistence fails.
  }
}

function safeRemoveStorageValue(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Keep runtime theme in sync even if persistence fails.
  }
}

function dispatchSyntheticStorageEvent(
  key: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        oldValue,
        newValue,
        storageArea: window.localStorage,
        url: window.location.href,
      }),
    )
  } catch {
    // Ignore synthetic event dispatch failures.
  }
}

function applyAppearance(detail: ThemeAppearanceApplyEventDetail): void {
  const oldTheme = safeGetStorageValue(STORAGE_KEY_THEME)
  const oldBardColorTheme = safeGetStorageValue(STORAGE_KEY_BARD_COLOR_THEME)

  applyBodyTheme(detail.theme)
  safeSetStorageValue(STORAGE_KEY_THEME, detail.theme)
  if (detail.bardColorTheme) {
    safeSetStorageValue(STORAGE_KEY_BARD_COLOR_THEME, detail.bardColorTheme)
  } else {
    safeRemoveStorageValue(STORAGE_KEY_BARD_COLOR_THEME)
  }

  dispatchSyntheticStorageEvent(STORAGE_KEY_THEME, oldTheme, detail.theme)
  dispatchSyntheticStorageEvent(
    STORAGE_KEY_BARD_COLOR_THEME,
    oldBardColorTheme,
    detail.bardColorTheme,
  )
}

export default defineUnlistedScript(() => {
  const handleAppearanceApply = (event: Event) => {
    const customEvent = event as CustomEvent<ThemeAppearanceApplyEventDetail>
    const detail = customEvent.detail
    if (!detail || (detail.theme !== 'light' && detail.theme !== 'dark')) {
      return
    }
    applyAppearance(detail)
  }

  window.addEventListener(GEM_EXT_EVENTS.THEME_APPEARANCE_APPLY, handleAppearanceApply)
  document.documentElement.setAttribute(READY_ATTR, 'true')
})

