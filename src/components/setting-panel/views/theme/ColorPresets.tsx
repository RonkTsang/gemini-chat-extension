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
    <Box mb={8}>
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

      <SimpleGrid columns={5} gap={3}>
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
              borderRadius="xl"
              bg={preset.primary}
              cursor={isLoading ? 'not-allowed' : 'pointer'}
              opacity={isLoading ? 0.5 : 1}
              pointerEvents={isLoading ? 'none' : 'auto'}
              transition="all 0.2s"
              border="3px solid"
              borderColor={isActive ? preset.primary : 'transparent'}
              outline={isActive ? '3px solid' : 'none'}
              outlineColor={isActive ? `${preset.primary}40` : 'transparent'}
              outlineOffset="1px"
              _hover={{
                transform: isLoading ? 'none' : 'scale(1.05)',
                shadow: 'md',
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
                  <HiCheck size={24} />
                </Box>
              )}
            </Box>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}
