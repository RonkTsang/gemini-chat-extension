import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  ColorPicker,
  HStack,
  Stack,
  Text,
  parseColor,
} from '@chakra-ui/react'
import type { GeminiTheme } from '@/entrypoints/content/gemini-theme'
import { t, tt } from '@/utils/i18n'

interface ChatTextColorControlProps {
  variant?: 'default' | 'compact'
  mode: GeminiTheme
  value: string | null
  defaultValue: string
  disabled?: boolean
  onChange: (color: string) => Promise<void>
  onReset: () => Promise<void>
}

function getPickerColor(value: string) {
  try {
    return parseColor(value)
  } catch {
    return parseColor('#1f1f1f')
  }
}

export function ChatTextColorControl({
  variant = 'default',
  mode,
  value,
  defaultValue,
  disabled,
  onChange,
  onReset,
}: ChatTextColorControlProps) {
  const isCompact = variant === 'compact'
  const displayColor = value ?? defaultValue
  const [pickerValue, setPickerValue] = useState(() => getPickerColor(displayColor))
  const modeLabel = mode === 'dark'
    ? tt('settingPanel.theme.appearanceDark', 'Dark')
    : tt('settingPanel.theme.appearanceLight', 'Light')
  const resetLabel = tt('settingPanel.theme.resetChatTextColor', 'Reset')

  useEffect(() => {
    setPickerValue(getPickerColor(displayColor))
  }, [displayColor])

  const modeDescription = useMemo(
    () => {
      const key = 'settingPanel.theme.chatTextColorModeDescription'
      const value = t(key, modeLabel)
      return value === key ? `Mode: ${modeLabel}` : value
    },
    [modeLabel],
  )

  return (
    <Stack
      direction="row"
      justify="space-between"
      align="center"
      mb={0}
      gap={isCompact ? 2 : 4}
    >
      <Box minW={0} flex="1">
        <Text fontSize="sm" color="gemOnSurface" minW={0}>
          {tt('settingPanel.theme.chatTextColor', 'Message text color')}
        </Text>
        <Text fontSize="xs" color="gemOnSurfaceVariant" mt={0.5}>
          {modeDescription}
        </Text>
      </Box>

      <HStack gap={2} flexShrink={0} justify="flex-end">
        <ColorPicker.Root
          value={pickerValue}
          onValueChange={(details) => setPickerValue(details.value)}
          onValueChangeEnd={(details) => {
            void onChange(details.value.toString('hexa'))
          }}
          disabled={disabled}
          positioning={{
            placement: 'bottom-end',
            gutter: 8,
            strategy: 'fixed',
          }}
          size="sm"
        >
          <ColorPicker.HiddenInput />
          <ColorPicker.Control>
            <ColorPicker.Trigger
              aria-label={tt('settingPanel.theme.chatTextColor', 'Message text color')}
              p={0}
              borderWidth={0}
              bg="transparent"
              minW="auto"
              _hover={{ bg: 'transparent' }}
            >
              <ColorPicker.ValueSwatch
                boxSize={isCompact ? 5 : 6}
                borderWidth="2px"
                borderColor="border.muted"
                boxShadow="inset 0 0 0 1px var(--chakra-colors-border-muted)"
              />
            </ColorPicker.Trigger>
          </ColorPicker.Control>
          <ColorPicker.Positioner zIndex={20}>
            <ColorPicker.Content
              width="260px"
              p={3}
              bg="gemSurface"
              borderColor="border.muted"
              shadow="lg"
            >
              <Stack gap={3}>
                <ColorPicker.Area />
                <HStack gap={3} align="center">
                  <ColorPicker.EyeDropper size="sm" variant="outline" />
                  <ColorPicker.Sliders flex="1" />
                </HStack>
                <Button
                  size="xs"
                  variant="ghost"
                  alignSelf="flex-end"
                  onClick={() => {
                    setPickerValue(getPickerColor(defaultValue))
                    void onReset()
                  }}
                >
                  {resetLabel}
                </Button>
              </Stack>
            </ColorPicker.Content>
          </ColorPicker.Positioner>
        </ColorPicker.Root>
      </HStack>
    </Stack>
  )
}
