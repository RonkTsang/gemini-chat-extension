import { storage } from '#imports'
import {
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  normalizeThemeBackgroundSettings,
  type ThemeBackgroundSettings,
} from './types'

export const themeBackgroundSettingsStorage =
  storage.defineItem<ThemeBackgroundSettings>('local:themeBackgroundSettings', {
    fallback: DEFAULT_THEME_BACKGROUND_SETTINGS,
  })

export async function getStoredThemeBackgroundSettings(): Promise<ThemeBackgroundSettings> {
  const raw = await themeBackgroundSettingsStorage.getValue()
  return normalizeThemeBackgroundSettings(raw)
}

export async function setStoredThemeBackgroundSettings(
  settings: ThemeBackgroundSettings,
): Promise<ThemeBackgroundSettings> {
  const normalized = normalizeThemeBackgroundSettings(settings)
  await themeBackgroundSettingsStorage.setValue(normalized)
  return normalized
}
