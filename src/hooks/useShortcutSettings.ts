import { useCallback, useEffect, useState } from 'react'
import {
  getShortcutSettings,
  normalizeShortcutSettings,
  setShortcutSettings,
  shortcutSettingsStorage,
  type ShortcutSettings,
} from '@/services/shortcuts/settings'
import type { ShortcutAction } from '@/services/shortcuts/definitions'

export function useShortcutSettings() {
  const [settings, setSettings] = useState<ShortcutSettings>(() => normalizeShortcutSettings())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const nextSettings = await getShortcutSettings()
        if (active) {
          setSettings(nextSettings)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()
    const unwatch = shortcutSettingsStorage.watch((storedSettings) => {
      setSettings(normalizeShortcutSettings(storedSettings))
    })

    return () => {
      active = false
      unwatch()
    }
  }, [])

  const updateBinding = useCallback(async (action: ShortcutAction, shortcut: string | null) => {
    const nextSettings = {
      ...settings,
      bindings: {
        ...settings.bindings,
        [action]: shortcut,
      },
    }
    setSettings(nextSettings)
    await setShortcutSettings(nextSettings)
  }, [settings])

  return {
    settings,
    isLoading,
    updateBinding,
  }
}
