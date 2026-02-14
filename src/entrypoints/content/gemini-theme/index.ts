/**
 * Gemini page theme service.
 * Manages applying, switching, and clearing theme CSS overrides,
 * as well as persisting the active theme key.
 */

import { injectGeminiThemeOverride, removeGeminiThemeOverride } from './inject'
import { themePresets, getPresetByKey } from './preset/presets'
import { getThemeKey, setThemeKey } from './themeStorage'

export { themePresets, getPresetByKey } from './preset/presets'
export { getThemeKey } from './themeStorage'
export type { ThemePreset } from './preset/presets'

/**
 * Apply a theme by key. Injects CSS override and persists the choice.
 * If the key is 'blue' or empty, clears any override (Gemini default).
 */
export async function applyTheme(key: string): Promise<void> {
  const preset = getPresetByKey(key)

  if (!preset || !preset.css) {
    // Default theme: remove CSS override
    removeGeminiThemeOverride()
    await setThemeKey('')
    return
  }

  injectGeminiThemeOverride(preset.css)
  await setThemeKey(key)
}

/**
 * Initialize theme on page load. Reads persisted key and applies.
 */
export async function initTheme(): Promise<void> {
  try {
    const key = await getThemeKey()
    if (key) {
      const preset = getPresetByKey(key)
      if (preset?.css) {
        injectGeminiThemeOverride(preset.css)
      }
    }
  } catch (error) {
    console.warn('[Theme] Failed to initialize theme:', error)
  }
}

/**
 * Clear the active theme, restoring Gemini's default styling.
 */
export async function clearTheme(): Promise<void> {
  removeGeminiThemeOverride()
  await setThemeKey('')
}