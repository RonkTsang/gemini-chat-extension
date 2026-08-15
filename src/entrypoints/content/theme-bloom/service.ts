import {
  applyTheme,
  getThemeBackgroundSettings,
  getThemeKey,
  resolveThemeBackgroundPreviewUrl,
  uploadThemeBackground,
  validateThemeBackgroundImage,
} from '@/entrypoints/content/gemini-theme'
import { buildThemeBackgroundResolvedState, normalizeThemeBackgroundSettings } from '@/entrypoints/content/gemini-theme/background/types'
import { applyThemeBackgroundStyle } from '@/entrypoints/content/gemini-theme/background/styleController'
import { getPresetByKey } from '@/entrypoints/content/gemini-theme/preset/presets'
import {
  injectGeminiThemeOverride,
  removeGeminiThemeOverride,
} from '@/entrypoints/content/gemini-theme/inject'
import {
  calculateThemeBloomPalette,
  type ThemeBloomPaletteResult,
} from './palette'
import {
  startThemeBloomTransition,
  type ThemeBloomOrigin,
  type ThemeBloomTransition,
} from './transition'

export interface ThemeBloomApplyRequest {
  file: File
  origin: ThemeBloomOrigin
  signal?: AbortSignal
  onPaletteResolved?: (palette: ThemeBloomPaletteResult) => void
  onTransitionStart?: (palette: ThemeBloomPaletteResult) => void
}

export interface ThemeBloomService {
  apply: (request: ThemeBloomApplyRequest) => Promise<ThemeBloomPaletteResult>
}

interface ThemeBloomServiceDependencies {
  validateFile: typeof validateThemeBackgroundImage
  calculatePalette: typeof calculateThemeBloomPalette
  getThemeKey: typeof getThemeKey
  getBackgroundSettings: typeof getThemeBackgroundSettings
  applyTheme: typeof applyTheme
  uploadBackground: typeof uploadThemeBackground
  restoreBackground: () => Promise<void>
  applyBackgroundPreview: typeof applyThemeBackgroundStyle
  applyPresetPreview: (key: string) => void
  preloadPreviewBackground: (url: string) => Promise<void>
  startTransition: typeof startThemeBloomTransition
  createObjectUrl: (file: File) => string
  revokeObjectUrl: (url: string) => void
}

function applyPresetPreview(key: string): void {
  const preset = getPresetByKey(key)
  if (!preset?.css) {
    removeGeminiThemeOverride()
    return
  }
  injectGeminiThemeOverride(preset.css)
}

async function restoreThemeBloomBackground(): Promise<void> {
  const settings = await getThemeBackgroundSettings()
  const resolvedBackgroundUrl = await resolveThemeBackgroundPreviewUrl(settings)
  applyThemeBackgroundStyle(
    buildThemeBackgroundResolvedState(settings, resolvedBackgroundUrl),
  )
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw new DOMException('Theme Bloom was cancelled', 'AbortError')
}

async function preloadThemeBloomPreviewBackground(url: string): Promise<void> {
  if (typeof Image === 'undefined') return

  const image = new Image()
  image.decoding = 'async'

  if (typeof image.decode === 'function') {
    image.src = url
    try {
      await image.decode()
      return
    } catch {
      // Preview decoding is optional; the persisted image remains independently validated.
      return
    }
  }

  await new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
    image.src = url
  })
}

function defaultDependencies(): ThemeBloomServiceDependencies {
  return {
    validateFile: validateThemeBackgroundImage,
    calculatePalette: calculateThemeBloomPalette,
    getThemeKey,
    getBackgroundSettings: getThemeBackgroundSettings,
    applyTheme,
    uploadBackground: uploadThemeBackground,
    restoreBackground: restoreThemeBloomBackground,
    applyBackgroundPreview: applyThemeBackgroundStyle,
    applyPresetPreview,
    preloadPreviewBackground: preloadThemeBloomPreviewBackground,
    startTransition: startThemeBloomTransition,
    createObjectUrl: (file) => URL.createObjectURL(file),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  }
}

async function restorePreviousTheme(
  dependencies: ThemeBloomServiceDependencies,
  previousThemeKey: string,
): Promise<void> {
  try {
    await dependencies.applyTheme(previousThemeKey)
  } catch {
    // Preserve the user-facing apply failure while attempting the remaining rollback.
  }

  try {
    await dependencies.restoreBackground()
  } catch {
    // Preserve the user-facing apply failure after the best-effort rollback.
  }
}

export function createThemeBloomService(
  overrides: Partial<ThemeBloomServiceDependencies> = {},
): ThemeBloomService {
  const dependencies = { ...defaultDependencies(), ...overrides }

  return {
    async apply(request) {
      const validation = await dependencies.validateFile(request.file)
      throwIfAborted(request.signal)

      const [palette, previousThemeKey, previousBackgroundSettings] = await Promise.all([
        dependencies.calculatePalette(request.file),
        dependencies.getThemeKey(),
        dependencies.getBackgroundSettings(),
      ])
      throwIfAborted(request.signal)
      request.onPaletteResolved?.(palette)

      const previewUrl = dependencies.createObjectUrl(request.file)
      let transition: ThemeBloomTransition | null = null
      const cancelTransition = () => transition?.cancel()
      request.signal?.addEventListener('abort', cancelTransition, { once: true })

      try {
        // The View Transition releases its snapshot back to this live CSS
        // background layer. Decode the exact preview URL first so that handoff
        // cannot expose a white frame while the browser starts an image decode.
        await dependencies.preloadPreviewBackground(previewUrl)
        throwIfAborted(request.signal)
        const previewSettings = normalizeThemeBackgroundSettings({
          ...previousBackgroundSettings,
          backgroundImageEnabled: true,
        })
        const previewState = buildThemeBackgroundResolvedState(previewSettings, previewUrl)

        transition = dependencies.startTransition({
          origin: request.origin,
          apply: () => {
            dependencies.applyPresetPreview(palette.presetKey)
            dependencies.applyBackgroundPreview(previewState)
          },
        })
        request.onTransitionStart?.(palette)
        throwIfAborted(request.signal)

        // The preview already shows the final state. Wait until the compositor
        // work has settled before the image decode and IndexedDB write compete
        // with the reveal for main-thread time.
        await transition.finished
        throwIfAborted(request.signal)
        // Persist through the existing services after the visual swap has settled.
        // Applying the preset first allows a failed asset write to roll back to the
        // persisted background without losing the old theme asset.
        await dependencies.applyTheme(palette.presetKey)
        throwIfAborted(request.signal)
        await dependencies.uploadBackground(request.file, validation)
        return palette
      } catch (error) {
        transition?.cancel()
        await restorePreviousTheme(dependencies, previousThemeKey)
        throw error
      } finally {
        request.signal?.removeEventListener('abort', cancelTransition)
        dependencies.revokeObjectUrl(previewUrl)
      }
    },
  }
}

export const themeBloomService = createThemeBloomService()
