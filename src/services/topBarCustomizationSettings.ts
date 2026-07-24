import { storage } from '#imports'

export interface TopBarSettings {
  showThemeShortcut: boolean
  hideUpgradeReminder: boolean
}

export type TopBarSettingsPatch = Partial<TopBarSettings>

export const DEFAULT_TOP_BAR_SETTINGS: TopBarSettings = {
  showThemeShortcut: true,
  hideUpgradeReminder: true,
}

export function normalizeTopBarSettings(raw: unknown): TopBarSettings {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<TopBarSettings>
    : {}

  return {
    showThemeShortcut: typeof source.showThemeShortcut === 'boolean'
      ? source.showThemeShortcut
      : DEFAULT_TOP_BAR_SETTINGS.showThemeShortcut,
    hideUpgradeReminder: typeof source.hideUpgradeReminder === 'boolean'
      ? source.hideUpgradeReminder
      : DEFAULT_TOP_BAR_SETTINGS.hideUpgradeReminder,
  }
}

export const topBarSettingsStorage = storage.defineItem<TopBarSettings>(
  'sync:topBarSettings',
  {
    fallback: DEFAULT_TOP_BAR_SETTINGS,
  },
)

export async function getTopBarSettings(): Promise<TopBarSettings> {
  return normalizeTopBarSettings(await topBarSettingsStorage.getValue())
}

export async function updateTopBarSettings(
  patch: TopBarSettingsPatch,
): Promise<TopBarSettings> {
  const current = await getTopBarSettings()
  const next = normalizeTopBarSettings({
    ...current,
    ...patch,
  })
  await topBarSettingsStorage.setValue(next)
  return next
}
