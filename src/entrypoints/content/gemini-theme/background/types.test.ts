import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  SIDEBAR_SCRIM_INTENSITY_MAX,
  SIDEBAR_SCRIM_INTENSITY_MIN,
  normalizeThemeBackgroundSettings,
} from './types'

describe('theme background settings normalize', () => {
  it('falls back to defaults when input is invalid', () => {
    const result = normalizeThemeBackgroundSettings(null)

    expect(result.backgroundImageEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundImageEnabled)
    expect(result.backgroundBlurPx).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundBlurPx)
    expect(result.messageGlassEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassEnabled)
    expect(result.sidebarScrimEnabled).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimEnabled,
    )
    expect(result.sidebarScrimIntensity).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity,
    )
    expect(result.welcomeGreetingReadabilityMode).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.welcomeGreetingReadabilityMode,
    )
    expect(result.welcomeGreetingResolved).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.welcomeGreetingResolved,
    )
    expect(result.welcomeGreetingResolvedAssetId).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.welcomeGreetingResolvedAssetId,
    )
    expect(result.imageRef).toEqual(DEFAULT_THEME_BACKGROUND_SETTINGS.imageRef)
    expect(result.version).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.version)
    expect(typeof result.updatedAt).toBe('string')
    expect(result.updatedAt.length).toBeGreaterThan(0)
  })

  it('clamps blur value to valid range', () => {
    const low = normalizeThemeBackgroundSettings({ backgroundBlurPx: -100 })
    const high = normalizeThemeBackgroundSettings({ backgroundBlurPx: 999 })

    expect(low.backgroundBlurPx).toBe(BACKGROUND_BLUR_MIN)
    expect(high.backgroundBlurPx).toBe(BACKGROUND_BLUR_MAX)
  })

  it('clamps sidebar scrim intensity to valid range', () => {
    const low = normalizeThemeBackgroundSettings({ sidebarScrimIntensity: -100 })
    const high = normalizeThemeBackgroundSettings({ sidebarScrimIntensity: 999 })
    const invalid = normalizeThemeBackgroundSettings({ sidebarScrimIntensity: Number.NaN })

    expect(low.sidebarScrimIntensity).toBe(SIDEBAR_SCRIM_INTENSITY_MIN)
    expect(high.sidebarScrimIntensity).toBe(SIDEBAR_SCRIM_INTENSITY_MAX)
    expect(invalid.sidebarScrimIntensity).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity,
    )
  })

  it('normalizes invalid imageRef to none', () => {
    const result = normalizeThemeBackgroundSettings({
      imageRef: { kind: 'asset', assetId: '' },
    })
    expect(result.imageRef).toEqual({ kind: 'none' })
  })

  it('resets welcome greeting cache when background is disabled', () => {
    const result = normalizeThemeBackgroundSettings({
      backgroundImageEnabled: false,
      imageRef: { kind: 'asset', assetId: 'asset-1' },
      welcomeGreetingReadabilityMode: 'auto',
      welcomeGreetingResolved: 'force-light',
      welcomeGreetingResolvedAssetId: 'asset-1',
    })
    expect(result.welcomeGreetingResolved).toBe('default')
    expect(result.welcomeGreetingResolvedAssetId).toBeNull()
  })
})
