import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  normalizeThemeBackgroundSettings,
} from './types'

describe('theme background settings normalize', () => {
  it('falls back to defaults when input is invalid', () => {
    const result = normalizeThemeBackgroundSettings(null)

    expect(result.backgroundImageEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundImageEnabled)
    expect(result.backgroundBlurPx).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundBlurPx)
    expect(result.messageGlassEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassEnabled)
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

  it('normalizes invalid imageRef to none', () => {
    const result = normalizeThemeBackgroundSettings({
      imageRef: { kind: 'asset', assetId: '' },
    })
    expect(result.imageRef).toEqual({ kind: 'none' })
  })
})
