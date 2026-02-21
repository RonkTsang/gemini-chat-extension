import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyThemeBackgroundStyle,
  clearThemeBackgroundStyle,
} from './styleController'
import type { ThemeBackgroundResolvedState } from './types'

function createState(
  overrides: Partial<ThemeBackgroundResolvedState> = {},
): ThemeBackgroundResolvedState {
  const base: ThemeBackgroundResolvedState = {
    settings: {
      version: 1,
      backgroundImageEnabled: false,
      backgroundBlurPx: 5,
      messageGlassEnabled: false,
      imageRef: { kind: 'none' },
      updatedAt: new Date().toISOString(),
    },
    resolvedBackgroundUrl: null,
    isBackgroundRenderable: false,
  }

  return {
    ...base,
    ...overrides,
    settings: {
      ...base.settings,
      ...(overrides.settings ?? {}),
    },
  }
}

describe('styleController', () => {
  beforeEach(() => {
    clearThemeBackgroundStyle()
  })

  it('applies renderable background + message glass state', () => {
    applyThemeBackgroundStyle(
      createState({
        settings: {
          backgroundImageEnabled: true,
          backgroundBlurPx: 12,
          messageGlassEnabled: true,
          imageRef: { kind: 'asset', assetId: 'asset-1' },
        } as ThemeBackgroundResolvedState['settings'],
        resolvedBackgroundUrl: 'blob:preview',
        isBackgroundRenderable: true,
      }),
    )

    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBe('true')
    expect(document.documentElement.getAttribute('data-gpk-msg-glass')).toBe('true')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-blur')).toBe('12px')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toContain(
      'blob:preview',
    )
    expect(document.getElementById('gemini-extension-theme-background-override')).toBeTruthy()

    const bgLayer = document.getElementById('gpk-theme-bg-layer')
    expect(bgLayer).toBeTruthy()
    expect(bgLayer?.style.display).toBe('block')
    expect(bgLayer?.style.backgroundImage).toContain('blob:preview')
  })

  it('applies non-renderable state when image is missing', () => {
    applyThemeBackgroundStyle(
      createState({
        settings: {
          backgroundImageEnabled: true,
          backgroundBlurPx: 5,
          messageGlassEnabled: false,
          imageRef: { kind: 'none' },
        } as ThemeBackgroundResolvedState['settings'],
        resolvedBackgroundUrl: null,
        isBackgroundRenderable: false,
      }),
    )

    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBe('false')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toBe('none')

    const bgLayer = document.getElementById('gpk-theme-bg-layer')
    expect(bgLayer).toBeTruthy()
    expect(bgLayer?.style.display).toBe('none')
    expect(bgLayer?.style.backgroundImage).toBe('none')
  })

  it('clears style tag, root attributes and background layer', () => {
    applyThemeBackgroundStyle(createState())
    clearThemeBackgroundStyle()

    expect(document.getElementById('gemini-extension-theme-background-override')).toBeNull()
    expect(document.getElementById('gpk-theme-bg-layer')).toBeNull()
    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBeNull()
    expect(document.documentElement.getAttribute('data-gpk-msg-glass')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-blur')).toBe('')
  })
})
