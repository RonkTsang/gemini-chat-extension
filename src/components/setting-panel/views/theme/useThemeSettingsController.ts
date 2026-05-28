import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyTheme,
  getAppearanceState,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  getThemeBackgroundSettings,
  normalizeThemeBackgroundSettings,
  removeThemeBackground,
  resolveThemeBackgroundPreviewUrlForPanel,
  setAppearanceMode,
  subscribeSystemThemeChange,
  themeBackgroundSettingsStorage,
  ThemeBackgroundError,
  updateThemeBackgroundSettings,
  uploadThemeBackground,
  type AppearanceMode,
  type AppearanceState,
  type ThemeBackgroundResolvedState,
  type ThemeBackgroundSettings,
  type WelcomeGreetingReadabilityMode,
} from '@/entrypoints/content/gemini-theme'
import { toaster } from '@/components/ui/toaster'
import { useEvent } from '@/hooks/useEventBus'
import { useColorPalette } from '@/hooks/useThemeColorPalette'
import { tt } from '@/utils/i18n'

export interface ThemeSettingsController {
  appearanceState: AppearanceState
  backgroundState: ThemeBackgroundResolvedState | null
  isBackgroundLoading: boolean
  activeKey: string
  previewState: ThemeBackgroundResolvedState
  handleSelect: (key: string) => Promise<void>
  handleAppearanceChange: (mode: AppearanceMode) => void
  handleToggleBackground: (enabled: boolean) => Promise<void>
  handleBlurChange: (value: number) => Promise<void>
  handleToggleSidebarScrim: (enabled: boolean) => Promise<void>
  handleSidebarScrimIntensityChange: (value: number) => Promise<void>
  handleToggleMessageGlass: (enabled: boolean) => Promise<void>
  handleMessageGlassBackgroundVisibilityChange: (value: number) => Promise<void>
  handleMessageGlassBlurChange: (value: number) => Promise<void>
  handleResetGlassSettings: () => Promise<void>
  handleWelcomeGreetingReadabilityModeChange: (
    mode: WelcomeGreetingReadabilityMode,
  ) => Promise<void>
  handleUploadFile: (file: File) => Promise<void>
  handleRemoveImage: () => Promise<void>
}

interface UseThemeSettingsControllerOptions {
  systemThemeWatchEnabled?: boolean
  settingsPanelStateSyncEnabled?: boolean
}

function toResolvedState(
  settings: ThemeBackgroundSettings,
  previewUrl: string | null,
): ThemeBackgroundResolvedState {
  return {
    settings,
    resolvedBackgroundUrl: previewUrl,
    isBackgroundRenderable: settings.backgroundImageEnabled && Boolean(previewUrl),
  }
}

function getBackgroundErrorMessage(error: unknown): string {
  if (error instanceof ThemeBackgroundError) {
    if (error.code === 'invalid-file-type') {
      return tt('settingPanel.theme.invalidFileType', 'Only PNG/JPG/WebP is supported')
    }
    if (error.code === 'file-too-large') {
      return tt('settingPanel.theme.fileTooLarge', 'Image size must be 5MB or less')
    }
    if (error.code === 'image-load-failed') {
      return tt('settingPanel.theme.imageLoadFailed', 'Image loading failed, please try again')
    }
  }

  if (error instanceof Error && error.message) return error.message
  return tt('settingPanel.theme.imageLoadFailed', 'Image loading failed, please try again')
}

export function useThemeSettingsController(
  options: UseThemeSettingsControllerOptions = {},
): ThemeSettingsController {
  const {
    systemThemeWatchEnabled = true,
    settingsPanelStateSyncEnabled = true,
  } = options
  const { palette, setPalette } = useColorPalette()
  const [appearanceState, setAppearanceState] = useState<AppearanceState>(() => getAppearanceState())
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [backgroundState, setBackgroundState] = useState<ThemeBackgroundResolvedState | null>(null)
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(true)

  useEvent('settings:state-changed', (data) => {
    if (!settingsPanelStateSyncEnabled) return
    setIsPanelOpen(data.open)
  })

  const loadBackgroundState = useCallback(async () => {
    setIsBackgroundLoading(true)
    try {
      const settings = await getThemeBackgroundSettings()
      const previewUrl = await resolveThemeBackgroundPreviewUrlForPanel(settings)
      setBackgroundState(toResolvedState(settings, previewUrl))
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    } finally {
      setIsBackgroundLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBackgroundState()
  }, [loadBackgroundState])

  useEffect(() => {
    const unwatch = themeBackgroundSettingsStorage.watch(async (newSettings) => {
      if (!newSettings) return
      try {
        const normalizedSettings = normalizeThemeBackgroundSettings(newSettings)
        const previewUrl = await resolveThemeBackgroundPreviewUrlForPanel(normalizedSettings)
        setBackgroundState(toResolvedState(normalizedSettings, previewUrl))
      } catch {
        // Initial load already handles user-facing error state.
      }
    })
    return unwatch
  }, [])

  useEffect(() => {
    if (!systemThemeWatchEnabled || !isPanelOpen || appearanceState.mode !== 'system') {
      return
    }

    const unsubscribe = subscribeSystemThemeChange(() => {
      setAppearanceState(setAppearanceMode('system'))
    })

    return unsubscribe
  }, [appearanceState.mode, isPanelOpen, systemThemeWatchEnabled])

  const handleSelect = useCallback(async (key: string) => {
    await applyTheme(key)
    setPalette(key || 'blue')
  }, [setPalette])

  const handleAppearanceChange = useCallback((mode: AppearanceMode) => {
    const state = setAppearanceMode(mode)
    setAppearanceState(state)
  }, [])

  const handleToggleBackground = useCallback(async (enabled: boolean) => {
    try {
      const state = await updateThemeBackgroundSettings({
        backgroundImageEnabled: enabled,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleBlurChange = useCallback(async (value: number) => {
    try {
      const state = await updateThemeBackgroundSettings({ backgroundBlurPx: value })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleToggleSidebarScrim = useCallback(async (enabled: boolean) => {
    try {
      const state = await updateThemeBackgroundSettings({
        sidebarScrimEnabled: enabled,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleSidebarScrimIntensityChange = useCallback(async (value: number) => {
    try {
      const state = await updateThemeBackgroundSettings({
        sidebarScrimIntensity: value,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleToggleMessageGlass = useCallback(async (enabled: boolean) => {
    try {
      const state = await updateThemeBackgroundSettings({
        messageGlassEnabled: enabled,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleMessageGlassBackgroundVisibilityChange = useCallback(async (value: number) => {
    try {
      const state = await updateThemeBackgroundSettings({
        messageGlassBackgroundVisibility: value,
        messageGlassBackgroundVisibilityCustomized: true,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleMessageGlassBlurChange = useCallback(async (value: number) => {
    try {
      const state = await updateThemeBackgroundSettings({
        messageGlassBlurPx: value,
        messageGlassBlurCustomized: true,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleResetGlassSettings = useCallback(async () => {
    try {
      const state = await updateThemeBackgroundSettings({
        messageGlassBackgroundVisibility:
          DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBackgroundVisibility,
        messageGlassTransparency:
          DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassTransparency,
        messageGlassBlurPx: DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBlurPx,
        messageGlassBackgroundVisibilityCustomized: false,
        messageGlassTransparencyCustomized: false,
        messageGlassLightTransparencyCustomized: false,
        messageGlassDarkTransparencyCustomized: false,
        messageGlassBlurCustomized: false,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleWelcomeGreetingReadabilityModeChange = useCallback(
    async (mode: WelcomeGreetingReadabilityMode) => {
      try {
        const state = await updateThemeBackgroundSettings({
          welcomeGreetingReadabilityMode: mode,
        })
        setBackgroundState(state)
      } catch (error) {
        toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
      }
    },
    [],
  )

  const handleUploadFile = useCallback(async (file: File) => {
    try {
      const state = await uploadThemeBackground(file)
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
      throw error
    }
  }, [])

  const handleRemoveImage = useCallback(async () => {
    try {
      const state = await removeThemeBackground()
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
      throw error
    }
  }, [])

  const activeKey = palette || 'blue'
  const previewState = useMemo(
    () => backgroundState ?? {
      settings: DEFAULT_THEME_BACKGROUND_SETTINGS,
      resolvedBackgroundUrl: null,
      isBackgroundRenderable: false,
    },
    [backgroundState],
  )

  return {
    appearanceState,
    backgroundState,
    isBackgroundLoading,
    activeKey,
    previewState,
    handleSelect,
    handleAppearanceChange,
    handleToggleBackground,
    handleBlurChange,
    handleToggleSidebarScrim,
    handleSidebarScrimIntensityChange,
    handleToggleMessageGlass,
    handleMessageGlassBackgroundVisibilityChange,
    handleMessageGlassBlurChange,
    handleResetGlassSettings,
    handleWelcomeGreetingReadabilityModeChange,
    handleUploadFile,
    handleRemoveImage,
  }
}
