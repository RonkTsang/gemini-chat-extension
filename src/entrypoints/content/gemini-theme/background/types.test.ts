import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_IMAGE_POSITION_CSS_VALUES,
  BACKGROUND_IMAGE_POSITIONS,
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  INPUT_AREA_TRANSPARENCY_DEFAULT,
  INPUT_AREA_TRANSPARENCY_MAX,
  INPUT_AREA_TRANSPARENCY_MIN,
  MESSAGE_GLASS_BLUR_MAX,
  MESSAGE_GLASS_BLUR_MIN,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN,
  MESSAGE_GLASS_TRANSPARENCY_MAX,
  MESSAGE_GLASS_TRANSPARENCY_MIN,
  SIDEBAR_SCRIM_INTENSITY_MAX,
  SIDEBAR_SCRIM_INTENSITY_MIN,
  getBackgroundImagePositionCssValue,
  normalizeThemeBackgroundSettings,
} from './types'

describe('theme background settings normalize', () => {
  it('falls back to defaults when input is invalid', () => {
    const result = normalizeThemeBackgroundSettings(null)

    expect(result.backgroundImageEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundImageEnabled)
    expect(result.backgroundBlurPx).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundBlurPx)
    expect(result.backgroundImagePosition).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundImagePosition,
    )
    expect(result.messageGlassEnabled).toBe(DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassEnabled)
    expect(result.messageGlassTransparency).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassTransparency,
    )
    expect(result.messageGlassBackgroundVisibility).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBackgroundVisibility,
    )
    expect(result.messageGlassBlurPx).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBlurPx,
    )
    expect(result.inputAreaTransparency).toBe(INPUT_AREA_TRANSPARENCY_DEFAULT)
    expect(result.messageGlassTransparencyCustomized).toBe(false)
    expect(result.messageGlassBackgroundVisibilityCustomized).toBe(false)
    expect(result.messageGlassBlurCustomized).toBe(false)
    expect(result.sidebarScrimEnabled).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimEnabled,
    )
    expect(result.sidebarScrimIntensity).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity,
    )
    expect(result.chatTextLightColor).toBeNull()
    expect(result.chatTextDarkColor).toBeNull()
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

  it('normalizes background image position', () => {
    for (const position of BACKGROUND_IMAGE_POSITIONS) {
      expect(
        normalizeThemeBackgroundSettings({
          backgroundImagePosition: position,
        }).backgroundImagePosition,
      ).toBe(position)
    }

    expect(
      normalizeThemeBackgroundSettings({
        backgroundImagePosition: 'invalid',
      }).backgroundImagePosition,
    ).toBe('center')
    expect(
      normalizeThemeBackgroundSettings({
        backgroundImagePosition: undefined,
      }).backgroundImagePosition,
    ).toBe('center')
  })

  it('maps background image positions to css values', () => {
    for (const position of BACKGROUND_IMAGE_POSITIONS) {
      expect(getBackgroundImagePositionCssValue(position)).toBe(
        BACKGROUND_IMAGE_POSITION_CSS_VALUES[position],
      )
    }
    expect(getBackgroundImagePositionCssValue('top-left')).toBe('left top')
    expect(getBackgroundImagePositionCssValue('center')).toBe('center center')
    expect(getBackgroundImagePositionCssValue('bottom-right')).toBe('right bottom')
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

  it('clamps message glass controls to valid ranges', () => {
    const low = normalizeThemeBackgroundSettings({
      messageGlassTransparency: -100,
      messageGlassBackgroundVisibility: -100,
      messageGlassBlurPx: -100,
    })
    const high = normalizeThemeBackgroundSettings({
      messageGlassTransparency: 999,
      messageGlassBackgroundVisibility: 999,
      messageGlassBlurPx: 999,
    })
    const invalid = normalizeThemeBackgroundSettings({
      messageGlassTransparency: Number.NaN,
      messageGlassBackgroundVisibility: Number.NaN,
      messageGlassBlurPx: Number.NaN,
    })

    expect(low.messageGlassTransparency).toBe(MESSAGE_GLASS_TRANSPARENCY_MIN)
    expect(low.messageGlassBackgroundVisibility).toBe(
      MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN,
    )
    expect(low.messageGlassBlurPx).toBe(MESSAGE_GLASS_BLUR_MIN)
    expect(high.messageGlassTransparency).toBe(MESSAGE_GLASS_TRANSPARENCY_MAX)
    expect(high.messageGlassBackgroundVisibility).toBe(
      MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX,
    )
    expect(high.messageGlassBlurPx).toBe(MESSAGE_GLASS_BLUR_MAX)
    expect(invalid.messageGlassTransparency).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassTransparency,
    )
    expect(invalid.messageGlassBackgroundVisibility).toBe(
      MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
    )
    expect(invalid.messageGlassBlurPx).toBe(
      DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBlurPx,
    )
  })

  it('clamps input area transparency to valid range', () => {
    const low = normalizeThemeBackgroundSettings({ inputAreaTransparency: -100 })
    const high = normalizeThemeBackgroundSettings({ inputAreaTransparency: 999 })
    const invalid = normalizeThemeBackgroundSettings({
      inputAreaTransparency: Number.NaN,
    })

    expect(low.inputAreaTransparency).toBe(INPUT_AREA_TRANSPARENCY_MIN)
    expect(high.inputAreaTransparency).toBe(INPUT_AREA_TRANSPARENCY_MAX)
    expect(invalid.inputAreaTransparency).toBe(INPUT_AREA_TRANSPARENCY_DEFAULT)
  })

  it('normalizes message glass customization flags', () => {
    const result = normalizeThemeBackgroundSettings({
      messageGlassTransparencyCustomized: true,
      messageGlassBackgroundVisibilityCustomized: true,
      messageGlassBlurCustomized: true,
    })
    const invalid = normalizeThemeBackgroundSettings({
      messageGlassTransparencyCustomized: 'false',
      messageGlassBackgroundVisibilityCustomized: 1,
      messageGlassBlurCustomized: 1,
    })

    expect(result.messageGlassTransparencyCustomized).toBe(true)
    expect(result.messageGlassBackgroundVisibilityCustomized).toBe(true)
    expect(result.messageGlassBlurCustomized).toBe(true)
    expect(invalid.messageGlassTransparencyCustomized).toBe(false)
    expect(invalid.messageGlassBackgroundVisibilityCustomized).toBe(false)
    expect(invalid.messageGlassBlurCustomized).toBe(false)
  })

  it('normalizes invalid imageRef to none', () => {
    const result = normalizeThemeBackgroundSettings({
      imageRef: { kind: 'asset', assetId: '' },
    })
    expect(result.imageRef).toEqual({ kind: 'none' })
  })

  it('normalizes chat text colors', () => {
    const result = normalizeThemeBackgroundSettings({
      chatTextLightColor: ' #AABBCC ',
      chatTextDarkColor: '#112233AA',
    })
    const invalid = normalizeThemeBackgroundSettings({
      chatTextLightColor: 'rgb(1, 2, 3)',
      chatTextDarkColor: '#12345',
    })

    expect(result.chatTextLightColor).toBe('#aabbcc')
    expect(result.chatTextDarkColor).toBe('#112233aa')
    expect(invalid.chatTextLightColor).toBeNull()
    expect(invalid.chatTextDarkColor).toBeNull()
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
