import { Box, SimpleGrid, Text } from '@chakra-ui/react'
import { HiCheck } from 'react-icons/hi'
import { themePresets } from '@/entrypoints/content/gemini-theme'
import { t } from '@/utils/i18n'

interface ColorPresetsProps {
  activeKey: string
  onSelect: (key: string) => void
  isLoading?: boolean
}

export function ColorPresets({ activeKey, onSelect, isLoading }: ColorPresetsProps) {
  return (
    <Box mb={8} overflow="visible">
      <Text
        fontSize="xs"
        fontWeight="bold"
        color="gemOnSurfaceVariant"
        textTransform="uppercase"
        letterSpacing="wider"
        mb={4}
      >
        {t('settingPanel.theme.colorPresets')}
      </Text>

      <SimpleGrid columns={5} gap={5} p={4} overflow="visible">
        {themePresets.map((preset) => {
          const isActive = activeKey === preset.key
          return (
            <Box
              key={preset.key}
              as="button"
              onClick={() => !isLoading && onSelect(preset.key)}
              position="relative"
              width="100%"
              aspectRatio="1"
              borderRadius="lg"
              bg={preset.primary}
              cursor={isLoading ? 'not-allowed' : 'pointer'}
              opacity={isLoading ? 0.5 : 1}
              pointerEvents={isLoading ? 'none' : 'auto'}
              transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
              border="2px solid"
              borderColor={isActive ? preset.primary : 'transparent'}
              outline={isActive ? '2px solid' : 'none'}
              outlineColor={isActive ? `${preset.primary}40` : 'transparent'}
              outlineOffset="2px"
              _hover={{
                transform: isLoading ? 'none' : 'scale(1.1)',
                shadow: 'lg',
                zIndex: 1,
              }}
              _active={{
                transform: 'scale(0.95)',
              }}
              aria-label={preset.key}
              aria-pressed={isActive}
            >
              {isActive && (
                <Box
                  position="absolute"
                  inset="0"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  color="white"
                >
                  <HiCheck size={18} />
                </Box>
              )}
            </Box>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}
