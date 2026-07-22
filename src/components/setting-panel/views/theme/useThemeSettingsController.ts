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
  type BackgroundImagePosition,
  type GeminiTheme,
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
  effectiveTheme: GeminiTheme
  backgroundState: ThemeBackgroundResolvedState | null
  isBackgroundLoading: boolean
  activeKey: string
  previewState: ThemeBackgroundResolvedState
  chatTextColor: string | null
  defaultChatTextColor: string
  handleSelect: (key: string) => Promise<void>
  handleAppearanceChange: (mode: AppearanceMode) => void
  handleToggleBackground: (enabled: boolean) => Promise<void>
  handleBlurChange: (value: number) => Promise<void>
  handleBackgroundPositionChange: (
    position: BackgroundImagePosition,
  ) => Promise<void>
  handleToggleSidebarScrim: (enabled: boolean) => Promise<void>
  handleSidebarScrimIntensityChange: (value: number) => Promise<void>
  handleHideUpgradeReminderChange: (enabled: boolean) => Promise<void>
  handleToggleMessageGlass: (enabled: boolean) => Promise<void>
  handleMessageGlassBackgroundVisibilityChange: (value: number) => Promise<void>
  handleMessageGlassBlurChange: (value: number) => Promise<void>
  handleInputAreaTransparencyPreviewChange: (value: number) => void
  handleInputAreaTransparencyChange: (value: number) => Promise<void>
  handleResetGlassSettings: () => Promise<void>
  handleChatTextColorChange: (color: string) => Promise<void>
  handleResetChatTextColor: () => Promise<void>
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

const DEFAULT_CHAT_TEXT_COLORS: Record<GeminiTheme, string> = {
  light: '#1f1f1f',
  dark: '#e3e3e3',
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

function toTwoDigitHex(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
}

function normalizeCssColorToHex(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (!trimmed.startsWith('rgb')) return null

  const parts = trimmed.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return null

  const red = Number(parts[0])
  const green = Number(parts[1])
  const blue = Number(parts[2])
  if (![red, green, blue].every(Number.isFinite)) return null

  const alpha = parts[3] === undefined ? 1 : Number(parts[3])
  const alphaHex = Number.isFinite(alpha) && alpha < 1
    ? toTwoDigitHex(alpha * 255)
    : ''

  return `#${toTwoDigitHex(red)}${toTwoDigitHex(green)}${toTwoDigitHex(blue)}${alphaHex}`
}

function readDefaultChatTextColor(theme: GeminiTheme): string {
  if (typeof document === 'undefined' || !document.body) {
    return DEFAULT_CHAT_TEXT_COLORS[theme]
  }

  const probe = document.createElement('span')
  probe.style.color = 'var(--gem-sys-color--on-surface)'
  probe.style.display = 'none'
  document.body.appendChild(probe)

  const computedColor = getComputedStyle(probe).color
  probe.remove()

  return normalizeCssColorToHex(computedColor) ?? DEFAULT_CHAT_TEXT_COLORS[theme]
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
  const [defaultChatTextColor, setDefaultChatTextColor] = useState(
    () => readDefaultChatTextColor(getAppearanceState().effectiveTheme),
  )

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

  useEffect(() => {
    setDefaultChatTextColor(readDefaultChatTextColor(appearanceState.effectiveTheme))
  }, [appearanceState.effectiveTheme, palette])

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

  const handleBackgroundPositionChange = useCallback(
    async (position: BackgroundImagePosition) => {
      try {
        const state = await updateThemeBackgroundSettings({
          backgroundImagePosition: position,
        })
        setBackgroundState(state)
      } catch (error) {
        toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
      }
    },
    [],
  )

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

  const handleHideUpgradeReminderChange = useCallback(async (enabled: boolean) => {
    try {
      const state = await updateThemeBackgroundSettings({
        hideUpgradeReminder: enabled,
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

  const handleInputAreaTransparencyChange = useCallback(async (value: number) => {
    try {
      const state = await updateThemeBackgroundSettings({
        inputAreaTransparency: value,
      })
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [])

  const handleInputAreaTransparencyPreviewChange = useCallback((value: number) => {
    setBackgroundState((current) => {
      if (!current) return current

      return {
        ...current,
        settings: {
          ...current.settings,
          inputAreaTransparency: value,
        },
      }
    })
  }, [])

  const handleResetGlassSettings = useCallback(async () => {
    try {
      const state = await updateThemeBackgroundSettings({
        messageGlassBackgroundVisibility:
          DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBackgroundVisibility,
        messageGlassTransparency:
          DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassTransparency,
        messageGlassBlurPx: DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBlurPx,
        inputAreaTransparency:
          DEFAULT_THEME_BACKGROUND_SETTINGS.inputAreaTransparency,
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

  const handleChatTextColorChange = useCallback(async (color: string) => {
    try {
      const state = await updateThemeBackgroundSettings(
        appearanceState.effectiveTheme === 'dark'
          ? { chatTextDarkColor: color }
          : { chatTextLightColor: color },
      )
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [appearanceState.effectiveTheme])

  const handleResetChatTextColor = useCallback(async () => {
    try {
      const state = await updateThemeBackgroundSettings(
        appearanceState.effectiveTheme === 'dark'
          ? { chatTextDarkColor: null }
          : { chatTextLightColor: null },
      )
      setBackgroundState(state)
    } catch (error) {
      toaster.create({ type: 'error', title: getBackgroundErrorMessage(error) })
    }
  }, [appearanceState.effectiveTheme])

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
  const chatTextColor = appearanceState.effectiveTheme === 'dark'
    ? previewState.settings.chatTextDarkColor
    : previewState.settings.chatTextLightColor

  return {
    appearanceState,
    effectiveTheme: appearanceState.effectiveTheme,
    backgroundState,
    isBackgroundLoading,
    activeKey,
    previewState,
    chatTextColor,
    defaultChatTextColor,
    handleSelect,
    handleAppearanceChange,
    handleToggleBackground,
    handleBlurChange,
    handleBackgroundPositionChange,
    handleToggleSidebarScrim,
    handleSidebarScrimIntensityChange,
    handleHideUpgradeReminderChange,
    handleToggleMessageGlass,
    handleMessageGlassBackgroundVisibilityChange,
    handleMessageGlassBlurChange,
    handleInputAreaTransparencyPreviewChange,
    handleInputAreaTransparencyChange,
    handleResetGlassSettings,
    handleChatTextColorChange,
    handleResetChatTextColor,
    handleWelcomeGreetingReadabilityModeChange,
    handleUploadFile,
    handleRemoveImage,
  }
}
