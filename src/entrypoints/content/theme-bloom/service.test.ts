import { describe, expect, it, vi } from 'vitest'
import { createThemeBloomService } from './service'

const palette = {
  sampledColors: [],
  accentColor: '#16a34a',
  presetKey: 'green',
  presetDistance: 0.1,
}

function createDependencies(overrides = {}) {
  const transition = {
    finished: Promise.resolve(),
    cancel: vi.fn(),
    usesViewTransition: false,
    reducedMotion: false,
  }
  return {
    validateFile: vi.fn().mockResolvedValue({
      dimensions: { width: 1920, height: 1080 },
    }),
    calculatePalette: vi.fn().mockResolvedValue(palette),
    getThemeKey: vi.fn().mockResolvedValue('purple'),
    getBackgroundSettings: vi.fn().mockResolvedValue({
      version: 5,
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
      chatTextLightColor: null,
      chatTextDarkColor: null,
      welcomeGreetingReadabilityMode: 'auto',
      welcomeGreetingResolved: 'default',
      welcomeGreetingResolvedAssetId: null,
      imageRef: { kind: 'none' },
      updatedAt: '',
    }),
    applyTheme: vi.fn().mockResolvedValue(undefined),
    uploadBackground: vi.fn().mockResolvedValue({}),
    restoreBackground: vi.fn().mockResolvedValue(undefined),
    applyBackgroundPreview: vi.fn(),
    applyPresetPreview: vi.fn(),
    preloadPreviewBackground: vi.fn().mockResolvedValue(undefined),
    startTransition: vi.fn().mockImplementation(({ apply }) => {
      apply()
      return transition
    }),
    createObjectUrl: vi.fn().mockReturnValue('blob:theme-bloom'),
    revokeObjectUrl: vi.fn(),
    transition,
    ...overrides,
  }
}

describe('Theme Bloom service', () => {
  it('previews then persists wallpaper and preset exactly once', async () => {
    const dependencies = createDependencies()
    const service = createThemeBloomService(dependencies)
    const result = await service.apply({
      file: new File(['theme'], 'theme.png', { type: 'image/png' }),
      origin: { clientX: 10, clientY: 20 },
    })

    expect(result).toEqual(palette)
    expect(dependencies.preloadPreviewBackground).toHaveBeenCalledWith('blob:theme-bloom')
    expect(
      dependencies.preloadPreviewBackground.mock.invocationCallOrder[0],
    ).toBeLessThan(dependencies.startTransition.mock.invocationCallOrder[0])
    expect(dependencies.applyPresetPreview).toHaveBeenCalledWith('green')
    expect(dependencies.applyTheme).toHaveBeenCalledTimes(1)
    expect(dependencies.applyTheme).toHaveBeenCalledWith('green')
    expect(dependencies.uploadBackground).toHaveBeenCalledTimes(1)
    expect(dependencies.uploadBackground).toHaveBeenCalledWith(
      expect.any(File),
      { dimensions: { width: 1920, height: 1080 } },
    )
    expect(dependencies.revokeObjectUrl).toHaveBeenCalledWith('blob:theme-bloom')
  })

  it('stops before palette sampling when image validation fails', async () => {
    const dependencies = createDependencies({
      validateFile: vi.fn().mockRejectedValue(new Error('too many pixels')),
    })
    const service = createThemeBloomService(dependencies)

    await expect(service.apply({
      file: new File(['theme'], 'large.avif', { type: 'image/avif' }),
      origin: { clientX: 10, clientY: 20 },
    })).rejects.toThrow('too many pixels')

    expect(dependencies.calculatePalette).not.toHaveBeenCalled()
    expect(dependencies.startTransition).not.toHaveBeenCalled()
    expect(dependencies.uploadBackground).not.toHaveBeenCalled()
  })

  it('defers persistence until the visual transition has settled', async () => {
    let resolveTransition: () => void = () => undefined
    const transition = {
      finished: new Promise<void>((resolve) => {
        resolveTransition = resolve
      }),
      cancel: vi.fn(),
      usesViewTransition: true,
      reducedMotion: false,
    }
    const dependencies = createDependencies({
      startTransition: vi.fn().mockImplementation(({ apply }) => {
        apply()
        return transition
      }),
    })
    const service = createThemeBloomService(dependencies)
    const pending = service.apply({
      file: new File(['theme'], 'theme.png', { type: 'image/png' }),
      origin: { clientX: 10, clientY: 20 },
    })

    await vi.waitFor(() => {
      expect(dependencies.startTransition).toHaveBeenCalledOnce()
    })
    expect(dependencies.applyTheme).not.toHaveBeenCalled()
    expect(dependencies.uploadBackground).not.toHaveBeenCalled()

    resolveTransition()
    await pending
    expect(dependencies.applyTheme).toHaveBeenCalledWith('green')
    expect(dependencies.uploadBackground).toHaveBeenCalledOnce()
  })

  it('restores the persisted theme and background when persistence fails', async () => {
    const dependencies = createDependencies({
      uploadBackground: vi.fn().mockRejectedValue(new Error('storage failed')),
    })
    const service = createThemeBloomService(dependencies)

    await expect(service.apply({
      file: new File(['theme'], 'theme.png', { type: 'image/png' }),
      origin: { clientX: 10, clientY: 20 },
    })).rejects.toThrow('storage failed')

    expect(dependencies.applyTheme).toHaveBeenNthCalledWith(1, 'green')
    expect(dependencies.applyTheme).toHaveBeenNthCalledWith(2, 'purple')
    expect(dependencies.restoreBackground).toHaveBeenCalledOnce()
    expect(dependencies.transition.cancel).toHaveBeenCalledOnce()
    expect(dependencies.revokeObjectUrl).toHaveBeenCalledWith('blob:theme-bloom')
  })
})
