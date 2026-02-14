/**
 * Persistent storage for the user's selected theme key.
 * Uses WXT storage API with sync storage for cross-device persistence.
 */

import { storage } from '#imports'

/** The persisted theme key. Empty string = default (blue, no override). */
export const themeKeyStorage = storage.defineItem<string>(
  'sync:themeKey',
  { fallback: '' }
)

export const getThemeKey = () => themeKeyStorage.getValue()
export const setThemeKey = (key: string) => themeKeyStorage.setValue(key)
