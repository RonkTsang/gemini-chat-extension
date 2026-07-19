import { storage } from '#imports'
import {
  getDefaultShortcutBindings,
  shortcutActions,
  type ShortcutAction,
} from './definitions'
import { isMacPlatform } from './format'

export interface ShortcutSettings {
  enabled: boolean
  bindings: Record<ShortcutAction, string | null>
}

type ShortcutSettingsInput = {
  enabled?: boolean
  bindings?: Partial<Record<ShortcutAction, string | null>>
}

export function createDefaultShortcutSettings(isMac = isMacPlatform()): ShortcutSettings {
  return {
    enabled: true,
    bindings: getDefaultShortcutBindings(isMac),
  }
}

export const shortcutSettingsStorage = storage.defineItem<ShortcutSettings>(
  'local:shortcutSettings',
  {
    fallback: createDefaultShortcutSettings(),
  },
)

export function normalizeShortcutSettings(
  settings?: ShortcutSettingsInput | null,
  isMac = isMacPlatform(),
): ShortcutSettings {
  const defaultSettings = createDefaultShortcutSettings(isMac)
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
    bindings[action] = defaultSettings.bindings[action]
  }

  return {
    enabled: settings?.enabled ?? defaultSettings.enabled,
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
