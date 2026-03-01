import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import {
  applyTheme,
  getAppearanceState,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  getThemeBackgroundSettings,
  normalizeThemeBackgroundSettings,
  removeThemeBackground,
  resolveThemeBackgroundPreviewUrl,
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
} from '@/entrypoints/content/gemini-theme'
import { useEvent } from '@/hooks/useEventBus'
import { AppearanceSelector } from './AppearanceSelector'
import { ColorPresets } from './ColorPresets'
import { CustomBackground } from './CustomBackground'
import { LivePreview } from './LivePreview'
import { t, tt } from '@/utils/i18n'
import { useColorPalette } from '@/hooks/useThemeColorPalette'
import { toaster } from '@/components/ui/toaster'

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

export function ThemeSettingsView() {
  const { palette, setPalette } = useColorPalette()
  const [appearanceState, setAppearanceState] = useState<AppearanceState>(() => getAppearanceState())
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [backgroundState, setBackgroundState] = useState<ThemeBackgroundResolvedState | null>(null)
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(true)

  useEvent('settings:state-changed', (data) => {
    setIsPanelOpen(data.open)
  })

  const loadBackgroundState = useCallback(async () => {
    setIsBackgroundLoading(true)
    try {
      const settings = await getThemeBackgroundSettings()
      const previewUrl = await resolveThemeBackgroundPreviewUrl(settings)
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
        const previewUrl = await resolveThemeBackgroundPreviewUrl(normalizedSettings)
        setBackgroundState(toResolvedState(normalizedSettings, previewUrl))
      } catch {
        // silently ignore watcher-triggered errors; initial load already handles error state
      }
    })
    return unwatch
  }, [])

  useEffect(() => {
    if (!isPanelOpen || appearanceState.mode !== 'system') {
      return
    }

    const unsubscribe = subscribeSystemThemeChange(() => {
      setAppearanceState(setAppearanceMode('system'))
    })

    return unsubscribe
  }, [appearanceState.mode, isPanelOpen])

  const handleSelect = async (key: string) => {
    await applyTheme(key)
    setPalette(key || 'blue')
  }

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
  const footerNote = t('settingPanel.theme.footerNote')

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      data-view="theme-settings"
    >
      <Box flex="1" minH="0">
        <Flex
          gap={{ base: 0, lg: 8 }}
          height="100%"
          align="stretch"
        >
          <Box
            flex="1"
            minWidth="0"
            minH="0"
            overflowY="auto"
            pr={{ base: 0, lg: 2 }}
          >
            <AppearanceSelector
              value={appearanceState.mode}
              onChange={handleAppearanceChange}
              isLoading={false}
            />
            <ColorPresets
              activeKey={activeKey}
              onSelect={handleSelect}
              isLoading={false}
            />
            <CustomBackground
              state={backgroundState}
              isLoading={isBackgroundLoading}
              onToggleBackground={handleToggleBackground}
              onBlurChange={handleBlurChange}
              onToggleSidebarScrim={handleToggleSidebarScrim}
              onSidebarScrimIntensityChange={handleSidebarScrimIntensityChange}
              onToggleMessageGlass={handleToggleMessageGlass}
              onUploadFile={handleUploadFile}
              onRemoveImage={handleRemoveImage}
            />
          </Box>

          <Box
            width="340px"
            flexShrink={0}
            display={{ base: 'none', lg: 'block' }}
            position="sticky"
            top={0}
            alignSelf="flex-start"
            pt={1}
          >
            <LivePreview
              backgroundEnabled={previewState.settings.backgroundImageEnabled}
              backgroundUrl={previewState.resolvedBackgroundUrl}
              blurPx={previewState.settings.backgroundBlurPx}
              sidebarScrimEnabled={previewState.settings.sidebarScrimEnabled}
              sidebarScrimIntensity={previewState.settings.sidebarScrimIntensity}
              messageGlassEnabled={previewState.settings.messageGlassEnabled}
            />
          </Box>
        </Flex>
      </Box>

      <Box pt={4} pb={2}>
        <Text
          fontSize="sm"
          color="gray.400"
          textAlign="center"
        >
          {footerNote === 'settingPanel.theme.footerNote'
            ? 'Changes are reflected immediately. Your settings are saved automatically.'
            : footerNote}
        </Text>
      </Box>
    </Box>
  )
}

ThemeSettingsView.displayName = 'ThemeSettingsView'
