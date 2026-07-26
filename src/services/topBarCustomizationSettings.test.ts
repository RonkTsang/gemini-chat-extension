import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetValue, mockSetValue } = vi.hoisted(() => ({
  mockGetValue: vi.fn(),
  mockSetValue: vi.fn(),
}))

vi.mock('#imports', () => ({
  storage: {
    defineItem: () => ({
      getValue: mockGetValue,
      setValue: mockSetValue,
      watch: vi.fn(),
    }),
  },
}))

import {
  DEFAULT_TOP_BAR_SETTINGS,
  getTopBarSettings,
  normalizeTopBarSettings,
  updateTopBarSettings,
} from './topBarCustomizationSettings'

describe('topBarCustomizationSettings', () => {
  beforeEach(() => {
    mockGetValue.mockReset()
    mockSetValue.mockReset()
  })

  it('falls back to defaults for invalid input and preserves explicit false', () => {
    expect(normalizeTopBarSettings(null)).toEqual(DEFAULT_TOP_BAR_SETTINGS)
    expect(
      normalizeTopBarSettings({
        showChatSettingsShortcut: false,
        showThemeShortcut: false,
        hideUpgradeReminder: false,
      }),
    ).toEqual({
      showChatSettingsShortcut: false,
      showThemeShortcut: false,
      hideUpgradeReminder: false,
    })
    expect(
      normalizeTopBarSettings({
        showThemeShortcut: 'false',
        hideUpgradeReminder: 1,
      }),
    ).toEqual(DEFAULT_TOP_BAR_SETTINGS)
  })

  it('reads and normalizes stored settings', async () => {
    mockGetValue.mockResolvedValue({
      showThemeShortcut: false,
      hideUpgradeReminder: 'yes',
    })

    await expect(getTopBarSettings()).resolves.toEqual({
      showChatSettingsShortcut: true,
      showThemeShortcut: false,
      hideUpgradeReminder: true,
    })
  })

  it('merges patches against the current settings before saving', async () => {
    mockGetValue.mockResolvedValue({
      showThemeShortcut: false,
      hideUpgradeReminder: true,
    })

    await expect(
      updateTopBarSettings({ hideUpgradeReminder: false }),
    ).resolves.toEqual({
      showChatSettingsShortcut: true,
      showThemeShortcut: false,
      hideUpgradeReminder: false,
    })

    expect(mockSetValue).toHaveBeenCalledWith({
      showChatSettingsShortcut: true,
      showThemeShortcut: false,
      hideUpgradeReminder: false,
    })
  })
})
