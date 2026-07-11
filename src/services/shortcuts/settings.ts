import { storage } from '#imports'
import {
  defaultShortcutBindings,
  shortcutActions,
  type ShortcutAction,
} from './definitions'

export interface ShortcutSettings {
  enabled: boolean
  bindings: Record<ShortcutAction, string | null>
}

export const defaultShortcutSettings: ShortcutSettings = {
  enabled: true,
  bindings: {
    ...defaultShortcutBindings,
  },
}

export const shortcutSettingsStorage = storage.defineItem<ShortcutSettings>(
  'sync:shortcutSettings',
  {
    fallback: defaultShortcutSettings,
  },
)

export function normalizeShortcutSettings(settings?: Partial<ShortcutSettings> | null): ShortcutSettings {
  const bindings = shortcutActions.reduce(
    (normalized, action) => {
      const value = settings?.bindings?.[action]
      normalized[action] = typeof value === 'string' && value.trim() ? value : null
      return normalized
    },
    {} as Record<ShortcutAction, string | null>,
  )

  for (const action of shortcutActions) {
    if (settings?.bindings && Object.prototype.hasOwnProperty.call(settings.bindings, action)) {
      continue
    }
    bindings[action] = defaultShortcutSettings.bindings[action]
  }

  return {
    enabled: settings?.enabled ?? defaultShortcutSettings.enabled,
    bindings,
  }
}

export async function getShortcutSettings(): Promise<ShortcutSettings> {
  const settings = await shortcutSettingsStorage.getValue()
  return normalizeShortcutSettings(settings)
}

export async function setShortcutSettings(settings: ShortcutSettings): Promise<void> {
  await shortcutSettingsStorage.setValue(normalizeShortcutSettings(settings))
}

export async function setShortcutBinding(action: ShortcutAction, shortcut: string | null): Promise<void> {
  const settings = await getShortcutSettings()
  await setShortcutSettings({
    ...settings,
    bindings: {
      ...settings.bindings,
      [action]: shortcut,
    },
  })
}
