import { Box, Flex, VStack } from '@chakra-ui/react'
import { useEventEmitter } from '@/hooks/useEventBus'
import { LivePreview } from './LivePreview'
import { OpenThemeStudioButton } from './OpenThemeStudioButton'
import { ThemeSettingsControls } from './ThemeSettingsControls'
import { useThemeSettingsController } from './useThemeSettingsController'

export function ThemeSettingsView() {
  const controller = useThemeSettingsController()
  const { emitSync } = useEventEmitter()
  const previewState = controller.previewState

  const handleOpenThemeStudio = () => {
    emitSync('settings:close', {
      from: 'theme-floating-panel',
      reason: 'open-theme-studio',
    })
    emitSync('theme-floating-panel:open', {
      source: 'setting-panel',
      returnToSettings: true,
    })
  }

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
            <ThemeSettingsControls controller={controller} />
          </Box>

          <VStack
            width="340px"
            flexShrink={0}
            display={{ base: 'none', lg: 'flex' }}
            position="sticky"
            top={0}
            alignSelf="flex-start"
            align="stretch"
            gap={4}
            pt={1}
          >
            <LivePreview
              backgroundEnabled={previewState.settings.backgroundImageEnabled}
              backgroundUrl={previewState.resolvedBackgroundUrl}
              blurPx={previewState.settings.backgroundBlurPx}
              sidebarScrimEnabled={previewState.settings.sidebarScrimEnabled}
              sidebarScrimIntensity={previewState.settings.sidebarScrimIntensity}
              messageGlassEnabled={previewState.settings.messageGlassEnabled}
              messageGlassTransparency={
                previewState.settings.messageGlassTransparency
              }
              messageGlassBlurPx={previewState.settings.messageGlassBlurPx}
              messageGlassTransparencyCustomized={
                previewState.settings.messageGlassTransparencyCustomized
              }
              messageGlassBlurCustomized={
                previewState.settings.messageGlassBlurCustomized
              }
            />
            <OpenThemeStudioButton onClick={handleOpenThemeStudio} />
          </VStack>
        </Flex>
      </Box>
    </Box>
  )
}

ThemeSettingsView.displayName = 'ThemeSettingsView'
