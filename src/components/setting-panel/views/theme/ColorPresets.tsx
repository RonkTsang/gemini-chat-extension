import { Box, Heading, SimpleGrid } from '@chakra-ui/react'
import { HiCheck } from 'react-icons/hi'
import { themePresets } from '@/entrypoints/content/gemini-theme'
import { t } from '@/utils/i18n'

interface ColorPresetsProps {
  activeKey: string
  onSelect: (key: string) => void
  isLoading?: boolean
}

export function ColorPresets({ activeKey, onSelect, isLoading }: ColorPresetsProps) {
  const title = t('settingPanel.theme.colorPresets')

  return (
    <Box mb={5} overflow="visible">
      <Heading size="sm" mb={3}>
        {title === 'settingPanel.theme.colorPresets' ? 'Colors' : title}
      </Heading>

      <Box
        width="fit-content"
        maxWidth="100%"
        p={3}
        borderRadius="xl"
        bg="color-mix(in srgb, var(--gem-sys-color--surface-container) 72%, transparent)"
        border="1px solid"
        borderColor="border.muted"
      >
        <SimpleGrid
          templateColumns="repeat(5, 44px)"
          gap={3}
          overflow="visible"
        >
          {themePresets.map((preset) => {
            const isActive = activeKey === preset.key
            return (
              <Box
                key={preset.key}
                as="button"
                onClick={() => !isLoading && onSelect(preset.key)}
                position="relative"
                width="44px"
                height="44px"
                borderRadius="lg"
                bg={preset.primary}
                cursor={isLoading ? 'not-allowed' : 'pointer'}
                opacity={isLoading ? 0.5 : 1}
                pointerEvents={isLoading ? 'none' : 'auto'}
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                border="1px solid"
                borderColor={isActive ? 'whiteAlpha.800' : 'transparent'}
                boxShadow={isActive ? `0 0 0 2px ${preset.primary}66` : 'none'}
                _hover={{
                  transform: isLoading ? 'none' : 'scale(1.05)',
                  shadow: 'md',
                  zIndex: 1,
                }}
                _active={{
                  transform: 'scale(0.96)',
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
                    <HiCheck size={14} />
                  </Box>
                )}
              </Box>
            )
          })}
        </SimpleGrid>
      </Box>
    </Box>
  )
}
