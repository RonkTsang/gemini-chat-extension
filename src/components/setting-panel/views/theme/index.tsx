import { useState, useEffect } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { applyTheme, themePresets } from '@/entrypoints/content/gemini-theme'
import { ColorPresets } from './ColorPresets'
import { CustomBackground } from './CustomBackground'
import { LivePreview } from './LivePreview'
import { t } from '@/utils/i18n'
import { useColorPalette } from '@/hooks/useThemeColorPalette'

export function ThemeSettingsView() {
  // Use global palette state instead of local state + storage reading
  const { palette, setPalette } = useColorPalette()
  // We still need a loading state? Not really, palette is initialized by provider.
  // But provider initializes async. We might want to show loading if palette is default but storage has something else?
  // However, provider handles it fast enough for the panel which opens later.
  // If the panel is open during init, it might flash blue -> stored.

  const handleSelect = async (key: string) => {
    // 1. Apply to page (Gemini)
    await applyTheme(key)
    // 2. Apply to extension UI (Chakra) via context
    setPalette(key || 'blue')
  }

  // Fallback to blue if empty (though context handles defaults)
  const activeKey = palette || 'blue'
  const activePrimary = themePresets.find((p) => p.key === activeKey)?.primary ?? '#4285f4'

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="theme-settings"
    >
      <Box flex="1" overflow="auto">
        <Flex gap={8} height="100%">
          {/* Left side: Configuration */}
          <Box flex="1" minWidth="0">
            <ColorPresets
              activeKey={activeKey}
              onSelect={handleSelect}
              isLoading={false} // Removed loading state as it's handled by context availability
            />
            <CustomBackground />
          </Box>

          {/* Right side: Live Preview */}
          <Box
            width="340px"
            flexShrink={0}
            display={{ base: 'none', md: 'block' }}
          >
            <LivePreview primaryColor={activePrimary} />
          </Box>
        </Flex>
      </Box>

      {/* Footer note */}
      <Box pt={4} pb={2}>
        <Text
          fontSize="sm"
          color="gray.400"
          textAlign="center"
        >
          {t('settingPanel.theme.footerNote')}
        </Text>
      </Box>
    </Box>
  )
}

ThemeSettingsView.displayName = 'ThemeSettingsView'
