import { Box, Heading, HStack, Icon, SegmentGroup, Text } from '@chakra-ui/react'
import { MdOutlineBrightness4, MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md'
import type { AppearanceMode } from '@/entrypoints/content/gemini-theme'
import { t, tt } from '@/utils/i18n'

interface AppearanceSelectorProps {
  value: AppearanceMode
  onChange: (mode: AppearanceMode) => void
  isLoading?: boolean
}

const APPEARANCE_ITEMS: { value: AppearanceMode; icon: React.ElementType; labelKey: string; labelFallback: string }[] = [
  { value: 'system', icon: MdOutlineBrightness4, labelKey: 'settingPanel.theme.appearanceSystem', labelFallback: 'System' },
  { value: 'light', icon: MdOutlineLightMode, labelKey: 'settingPanel.theme.appearanceLight', labelFallback: 'Light' },
  { value: 'dark', icon: MdOutlineDarkMode, labelKey: 'settingPanel.theme.appearanceDark', labelFallback: 'Dark' },
]

export function AppearanceSelector({
  value,
  onChange,
  isLoading,
}: AppearanceSelectorProps) {
  return (
    <Box mb={5} overflow="visible">
      <Heading size="sm" mb={3}>
        {tt('settingPanel.theme.appearance', 'Appearance')}
      </Heading>

      <Box
        width="fit-content"
        maxWidth="100%"
        // p={1.5}
        // borderRadius="xl"
        // bg="color-mix(in srgb, var(--gem-sys-color--surface-container) 72%, transparent)"
        // border="1px solid"
        // borderColor="border.muted"
      >
        <SegmentGroup.Root
          value={value}
          onValueChange={(details) => {
            if (!details.value) return
            onChange(details.value as AppearanceMode)
          }}
          disabled={isLoading}
          size="sm"
          bg="bg"
        >
          <SegmentGroup.Indicator
            borderRadius="lg"
            bg="colorPalette.solid"
            shadow="sm"
          />

          {APPEARANCE_ITEMS.map(({ value: itemValue, icon, labelKey, labelFallback }) => (
            <SegmentGroup.Item
              key={itemValue}
              value={itemValue}
              borderRadius="lg"
              px={3}
              py={1.5}
              color="gemOnSurfaceVariant"
              fontWeight="medium"
              transition="color 0.15s ease"
              _checked={{
                color: 'colorPalette.contrast',
              }}
              _hover={{
                color: 'gemOnSurface',
                _checked: { color: 'colorPalette.contrast' },
              }}
              cursor={isLoading ? 'not-allowed' : 'pointer'}
              opacity={isLoading ? 0.5 : 1}
            >
              <SegmentGroup.ItemText asChild>
                <HStack gap={1.5}>
                  <Icon as={icon} boxSize={4} />
                  <Text fontSize="sm">{tt(labelKey, labelFallback)}</Text>
                </HStack>
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Box>
    </Box>
  )
}

