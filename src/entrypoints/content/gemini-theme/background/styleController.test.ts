import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyThemeBackgroundStyle,
  clearThemeBackgroundStyle,
} from './styleController'
import {
  THEME_BACKGROUND_VERSION,
  type ThemeBackgroundResolvedState,
} from './types'

function createState(
  overrides: Partial<ThemeBackgroundResolvedState> = {},
): ThemeBackgroundResolvedState {
  const base: ThemeBackgroundResolvedState = {
    settings: {
      version: THEME_BACKGROUND_VERSION,
      backgroundImageEnabled: false,
      backgroundBlurPx: 5,
      backgroundImagePosition: 'center',
      messageGlassEnabled: false,
      messageGlassTransparency: 40,
      messageGlassLightTransparency: 40,
      messageGlassDarkTransparency: 90,
      messageGlassBackgroundVisibility: 5,
      messageGlassBlurPx: 20,
      inputAreaTransparency: 40,
      messageGlassTransparencyCustomized: false,
      messageGlassLightTransparencyCustomized: false,
      messageGlassDarkTransparencyCustomized: false,
      messageGlassBackgroundVisibilityCustomized: false,
      messageGlassBlurCustomized: false,
      sidebarScrimEnabled: true,
      sidebarScrimIntensity: 20,
      hideUpgradeReminder: false,
      chatTextLightColor: null,
      chatTextDarkColor: null,
      welcomeGreetingReadabilityMode: 'auto',
      welcomeGreetingResolved: 'default',
      welcomeGreetingResolvedAssetId: null,
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
          backgroundImagePosition: 'bottom-right',
          messageGlassEnabled: true,
          messageGlassTransparency: 72,
          messageGlassBackgroundVisibility: 4,
          messageGlassBlurPx: 8,
          inputAreaTransparency: 65,
          messageGlassTransparencyCustomized: true,
          messageGlassBackgroundVisibilityCustomized: true,
          messageGlassBlurCustomized: true,
          sidebarScrimEnabled: true,
          sidebarScrimIntensity: 50,
          imageRef: { kind: 'asset', assetId: 'asset-1' },
        } as ThemeBackgroundResolvedState['settings'],
        resolvedBackgroundUrl: 'blob:preview',
        isBackgroundRenderable: true,
      }),
    )

    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBe('true')
    expect(document.documentElement.getAttribute('data-gpk-msg-glass')).toBe('true')
    expect(
      document.documentElement.getAttribute(
        'data-gpk-msg-glass-transparency-customized',
      ),
    ).toBeNull()
    expect(
      document.documentElement.getAttribute('data-gpk-msg-glass-blur-customized'),
    ).toBe('true')
    expect(document.documentElement.getAttribute('data-gpk-sidebar-scrim-enabled')).toBe(
      'true',
    )
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(
      false,
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-blur')).toBe('12px')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-position')).toBe(
      'right bottom',
    )
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-dark-surface-legacy-mix',
      ),
    ).toBe('64%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-light-transparency',
      ),
    ).toBe('32%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-dark-transparency',
      ),
    ).toBe('32%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-dark-surface-legacy-mix',
      ),
    ).toBe('64%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-light-transparency',
      ),
    ).toBe('32%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-dark-transparency',
      ),
    ).toBe('72%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-dark-surface-legacy-mix',
      ),
    ).toBe('64%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-light-transparency',
      ),
    ).toBe('32%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-dark-transparency',
      ),
    ).toBe('48%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-transparency',
      ),
    ).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-msg-glass-blur')).toBe(
      '8px',
    )
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-input-area-transparency',
      ),
    ).toBe('65%')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-transparency-customized',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-blur-customized',
      ),
    ).toBe('1')
    expect(document.documentElement.style.getPropertyValue('--gpk-sidebar-scrim-alpha')).toBe(
      '0.50',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-light-color')).toBe(
      '',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-dark-color')).toBe(
      '',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toContain(
      'blob:preview',
    )
    const styleEl = document.getElementById('gemini-extension-theme-background-override')
    expect(styleEl).toBeTruthy()

    const bgLayer = document.getElementById('gpk-theme-bg-layer')
    expect(bgLayer).toBeTruthy()
    expect(bgLayer?.style.display).toBe('block')
    expect(bgLayer?.style.backgroundImage).toContain('blob:preview')
  })

  it('toggles the upgrade reminder root attribute and includes its selector', () => {
    applyThemeBackgroundStyle(
      createState({
        settings: {
          hideUpgradeReminder: true,
        } as ThemeBackgroundResolvedState['settings'],
      }),
    )

    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(
      true,
    )

    const css = readFileSync(
      join(
        process.cwd(),
        'src/entrypoints/content/gemini-theme/background/style.css',
      ),
      'utf8',
    )
    expect(css).toContain(
      ':root[data-gpk-hide-upgrade-reminder] top-bar-actions div.right-section div.adv-upsell',
    )

    applyThemeBackgroundStyle(createState())
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(
      false,
    )
  })

  it('applies non-renderable state when image is missing', () => {
    applyThemeBackgroundStyle(
      createState({
        settings: {
          backgroundImageEnabled: true,
          backgroundBlurPx: 5,
          messageGlassEnabled: false,
          messageGlassTransparency: 40,
          messageGlassBackgroundVisibility: 5,
          messageGlassBlurPx: 20,
          messageGlassTransparencyCustomized: false,
          messageGlassBackgroundVisibilityCustomized: false,
          messageGlassBlurCustomized: false,
          sidebarScrimEnabled: false,
          sidebarScrimIntensity: 0,
          imageRef: { kind: 'none' },
        } as ThemeBackgroundResolvedState['settings'],
        resolvedBackgroundUrl: null,
        isBackgroundRenderable: false,
      }),
    )

    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBe('false')
    expect(document.documentElement.getAttribute('data-gpk-sidebar-scrim-enabled')).toBe(
      'false',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toBe('none')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-position')).toBe(
      'center center',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-sidebar-scrim-alpha')).toBe(
      '0.00',
    )

    const bgLayer = document.getElementById('gpk-theme-bg-layer')
    expect(bgLayer).toBeTruthy()
    expect(bgLayer?.style.display).toBe('none')
    expect(bgLayer?.style.backgroundImage).toBe('none')
  })

  it('syncs chat text color variables', () => {
    applyThemeBackgroundStyle(
      createState({
        settings: {
          chatTextLightColor: '#112233',
          chatTextDarkColor: '#ddeeffcc',
        } as ThemeBackgroundResolvedState['settings'],
      }),
    )

    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-light-color')).toBe(
      '#112233',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-dark-color')).toBe(
      '#ddeeffcc',
    )

    applyThemeBackgroundStyle(createState())

    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-light-color')).toBe(
      '',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-dark-color')).toBe(
      '',
    )
  })

  it('scopes chat text color CSS to chat-window', () => {
    const css = readFileSync(
      join(
        process.cwd(),
        'src/entrypoints/content/gemini-theme/background/style.css',
      ),
      'utf8',
    )

    expect(css).toContain('body.light-theme chat-window')
    expect(css).toContain('body.dark-theme chat-window')
    expect(css).toContain('--gem-sys-color--on-surface: var(--gpk-chat-text-light-color)')
    expect(css).toContain('--gem-sys-color--on-surface: var(--gpk-chat-text-dark-color)')
  })

  it('scopes input transparency to renderable message glass', () => {
    const css = readFileSync(
      join(
        process.cwd(),
        'src/entrypoints/content/gemini-theme/background/style.css',
      ),
      'utf8',
    )

    expect(css).toContain(
      ':root[data-gpk-bg-enabled="true"][data-gpk-msg-glass="true"] input-container input-area-v2',
    )
    expect(css).toContain(
      'transparent var(--gpk-input-area-transparency, 40%)',
    )
    expect(css).toContain('!important')
  })

  it('keeps the luminous mode sidenav transparent when a background is enabled', () => {
    const css = readFileSync(
      join(
        process.cwd(),
        'src/entrypoints/content/gemini-theme/background/style.css',
      ),
      'utf8',
    )

    expect(css).toMatch(
      /:root\[data-gpk-bg-enabled="true"\] :where\(\.lm-component-theme\) mat-sidenav-container \{\s*background-color: transparent !important;/,
    )
  })

  it('clears style tag, root attributes and background layer', () => {
    applyThemeBackgroundStyle(createState())
    clearThemeBackgroundStyle()

    expect(document.getElementById('gemini-extension-theme-background-override')).toBeNull()
    expect(document.getElementById('gpk-theme-bg-layer')).toBeNull()
    expect(document.documentElement.getAttribute('data-gpk-bg-enabled')).toBeNull()
    expect(document.documentElement.getAttribute('data-gpk-msg-glass')).toBeNull()
    expect(
      document.documentElement.getAttribute(
        'data-gpk-msg-glass-transparency-customized',
      ),
    ).toBeNull()
    expect(
      document.documentElement.getAttribute('data-gpk-msg-glass-blur-customized'),
    ).toBeNull()
    expect(document.documentElement.getAttribute('data-gpk-sidebar-scrim-enabled')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-image')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-blur')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-bg-position')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-msg-glass-transparency')).toBe(
      '',
    )
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-dark-surface-legacy-mix',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-light-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-user-dark-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-dark-surface-legacy-mix',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-light-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-model-dark-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-dark-surface-legacy-mix',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-light-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-dual-dark-transparency',
      ),
    ).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-msg-glass-blur')).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-input-area-transparency',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-transparency-customized',
      ),
    ).toBe('')
    expect(
      document.documentElement.style.getPropertyValue(
        '--gpk-msg-glass-blur-customized',
      ),
    ).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-sidebar-scrim-alpha')).toBe(
      '',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-light-color')).toBe(
      '',
    )
    expect(document.documentElement.style.getPropertyValue('--gpk-chat-text-dark-color')).toBe(
      '',
    )
  })
})
