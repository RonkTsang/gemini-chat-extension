import { GEM_EXT_EVENTS } from '@/common/event'
import type { AppearanceMode, AppearanceState, GeminiTheme } from './types'

const STORAGE_KEY_THEME = 'theme'
const STORAGE_KEY_BARD_COLOR_THEME = 'Bard-Color-Theme'
const BARD_LIGHT_THEME = 'Bard-Light-Theme'
const BARD_DARK_THEME = 'Bard-Dark-Theme'
const BODY_LIGHT_THEME_CLASS = 'light-theme'
const BODY_DARK_THEME_CLASS = 'dark-theme'
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const MAIN_WORLD_THEME_SYNC_READY_ATTR = 'data-gpk-theme-sync-ready'

type BardColorTheme = 'Bard-Light-Theme' | 'Bard-Dark-Theme' | null

interface ThemeAppearanceApplyEventDetail {
  mode: AppearanceMode
  theme: GeminiTheme
  bardColorTheme: BardColorTheme
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function safeGetLocalStorageItem(key: string): string | null {
  try {
    return getSafeLocalStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSetLocalStorageItem(key: string, value: string): void {
  try {
    getSafeLocalStorage()?.setItem(key, value)
  } catch {
    // Ignore localStorage write errors and keep runtime theme in sync via body class.
  }
}

function safeRemoveLocalStorageItem(key: string): void {
  try {
    getSafeLocalStorage()?.removeItem(key)
  } catch {
    // Ignore localStorage write errors and keep runtime theme in sync via body class.
  }
}

function getThemeFromBodyClass(): GeminiTheme | null {
  if (typeof document === 'undefined' || !document.body) return null

  if (document.body.classList.contains(BODY_DARK_THEME_CLASS)) return 'dark'
  if (document.body.classList.contains(BODY_LIGHT_THEME_CLASS)) return 'light'

  return null
}

function getSystemThemePreference(): GeminiTheme | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
}

function getThemeFromStorage(): GeminiTheme | null {
  const value = safeGetLocalStorageItem(STORAGE_KEY_THEME)
  if (value === 'light' || value === 'dark') {
    return value
  }
  return null
}

function getEffectiveTheme(): GeminiTheme {
  return (
    getThemeFromBodyClass()
    ?? getSystemThemePreference()
    ?? getThemeFromStorage()
    ?? 'light'
  )
}

function resolveAppearanceMode(): AppearanceMode {
  const bardColorTheme = safeGetLocalStorageItem(STORAGE_KEY_BARD_COLOR_THEME)
  if (bardColorTheme === BARD_LIGHT_THEME) return 'light'
  if (bardColorTheme === BARD_DARK_THEME) return 'dark'
  return 'system'
}

function applyBodyTheme(theme: GeminiTheme): void {
  if (typeof document === 'undefined' || !document.body) return

  const body = document.body
  body.classList.remove(BODY_LIGHT_THEME_CLASS, BODY_DARK_THEME_CLASS)
  body.classList.add(theme === 'dark' ? BODY_DARK_THEME_CLASS : BODY_LIGHT_THEME_CLASS)
}

function buildAppearanceState(mode: AppearanceMode): AppearanceState {
  return {
    mode,
    effectiveTheme: getEffectiveTheme(),
  }
}

function getSystemTargetTheme(): GeminiTheme {
  return getSystemThemePreference() ?? getThemeFromStorage() ?? 'light'
}

function isMainWorldThemeSyncReady(): boolean {
  if (typeof document === 'undefined' || !document.documentElement) return false
  return document.documentElement.getAttribute(MAIN_WORLD_THEME_SYNC_READY_ATTR) === 'true'
}

function dispatchMainWorldAppearanceApply(
  detail: ThemeAppearanceApplyEventDetail,
): boolean {
  if (typeof window === 'undefined' || !isMainWorldThemeSyncReady()) {
    return false
  }

  try {
    window.dispatchEvent(
      new CustomEvent<ThemeAppearanceApplyEventDetail>(
        GEM_EXT_EVENTS.THEME_APPEARANCE_APPLY,
        { detail },
      ),
    )
    return true
  } catch {
    return false
  }
}

function applyAppearanceLocally(
  theme: GeminiTheme,
  bardColorTheme: BardColorTheme,
): void {
  applyBodyTheme(theme)
  safeSetLocalStorageItem(STORAGE_KEY_THEME, theme)
  if (bardColorTheme) {
    safeSetLocalStorageItem(STORAGE_KEY_BARD_COLOR_THEME, bardColorTheme)
  } else {
    safeRemoveLocalStorageItem(STORAGE_KEY_BARD_COLOR_THEME)
  }
}

export function getAppearanceState(): AppearanceState {
  return buildAppearanceState(resolveAppearanceMode())
}

export function setAppearanceMode(mode: AppearanceMode): AppearanceState {
  if (mode === 'light' || mode === 'dark') {
    const bardColorTheme = mode === 'dark' ? BARD_DARK_THEME : BARD_LIGHT_THEME
    const bridged = dispatchMainWorldAppearanceApply({
      mode,
      theme: mode,
      bardColorTheme,
    })

    if (!bridged) {
      applyAppearanceLocally(mode, bardColorTheme)
    }

    return {
      mode,
      effectiveTheme: mode,
    }
  }

  const systemTheme = getSystemTargetTheme()
  const bridged = dispatchMainWorldAppearanceApply({
    mode: 'system',
    theme: systemTheme,
    bardColorTheme: null,
  })

  if (!bridged) {
    applyAppearanceLocally(systemTheme, null)
  }

  return {
    mode: 'system',
    effectiveTheme: systemTheme,
  }
}
type ThemeChangeHandler = (event: MediaQueryListEvent) => void

function addMediaQueryListener(
  mediaQueryList: MediaQueryList,
  handler: ThemeChangeHandler,
): void {
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handler)
    return
  }
  if (typeof mediaQueryList.addListener === 'function') {
    mediaQueryList.addListener(handler)
  }
}

function removeMediaQueryListener(
  mediaQueryList: MediaQueryList,
  handler: ThemeChangeHandler,
): void {
  if (typeof mediaQueryList.removeEventListener === 'function') {
    mediaQueryList.removeEventListener('change', handler)
    return
  }
  if (typeof mediaQueryList.removeListener === 'function') {
    mediaQueryList.removeListener(handler)
  }
}

export function subscribeSystemThemeChange(
  onChange: (theme: GeminiTheme) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }

  const mediaQueryList = window.matchMedia(COLOR_SCHEME_QUERY)
  const handler: ThemeChangeHandler = (event) => {
    onChange(event.matches ? 'dark' : 'light')
  }

  addMediaQueryListener(mediaQueryList, handler)

  return () => {
    removeMediaQueryListener(mediaQueryList, handler)
  }
}
