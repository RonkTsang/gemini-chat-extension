import { useState, useEffect } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { applyTheme, themePresets, getThemeKey } from '@/entrypoints/content/gemini-theme'
import { ColorPresets } from './ColorPresets'
import { CustomBackground } from './CustomBackground'
import { LivePreview } from './LivePreview'
import { t } from '@/utils/i18n'
import { updateChakraColorPalette } from '@/hooks/useThemeColorPalette'

export function ThemeSettingsView() {
  const [activeKey, setActiveKey] = useState('blue')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const key = await getThemeKey()
        setActiveKey(key || 'blue')
      } catch {
        // fallback to default
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  const handleSelect = async (key: string) => {
    setActiveKey(key)
    await applyTheme(key)
    // Sync Chakra UI color palette
    updateChakraColorPalette(key || 'blue')
  }

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
              isLoading={isLoading}
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
