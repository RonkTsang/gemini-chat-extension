import {
  Box,
  Button,
  ColorPicker,
  HStack,
  IconButton,
  Popover,
  Portal,
  SimpleGrid,
  Stack,
  Text,
  parseColor,
} from '@chakra-ui/react'
import { useEffect, useMemo, useState } from 'react'
import { LuChevronDown } from 'react-icons/lu'

import {
  FOLDER_ICON_CATALOG,
  FOLDER_PRESET_COLORS,
  getFolderColor,
  getFolderIcon,
} from './folderAppearance'
import {
  type FolderColorValue,
  type FolderCustomColor,
  type FolderIconKey,
  isFolderCustomColor,
} from '@/domain/folder/appearance'
import { useColorMode } from '@/components/ui/color-mode'
import { tt } from '@/utils/i18n'

const PANEL_FOREGROUND = 'var(--lumi-sys-color--on-surface, var(--chakra-colors-fg, #1f1f1f))'

export interface FolderAppearanceValue {
  iconKey: FolderIconKey
  colorValue: FolderColorValue
}

export interface FolderAppearancePickerProps {
  value: FolderAppearanceValue
  onChange: (value: FolderAppearanceValue) => void
}

function toHexColor(value: string): FolderCustomColor {
  return value.slice(0, 7).toLowerCase() as FolderCustomColor
}

function channelLuminance(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function contrastRatio(foreground: FolderCustomColor, background: string): number {
  const values = [foreground, background].map((color) => {
    const red = Number.parseInt(color.slice(1, 3), 16)
    const green = Number.parseInt(color.slice(3, 5), 16)
    const blue = Number.parseInt(color.slice(5, 7), 16)
    return 0.2126 * channelLuminance(red)
      + 0.7152 * channelLuminance(green)
      + 0.0722 * channelLuminance(blue)
  })
  const lighter = Math.max(...values)
  const darker = Math.min(...values)
  return (lighter + 0.05) / (darker + 0.05)
}

export function FolderAppearancePicker({ value, onChange }: FolderAppearancePickerProps) {
  const { colorMode } = useColorMode()
  const [open, setOpen] = useState(false)
  const [customExpanded, setCustomExpanded] = useState(isFolderCustomColor(value.colorValue))
  const [lastCustomColor, setLastCustomColor] = useState<FolderCustomColor>(() => (
    isFolderCustomColor(value.colorValue) ? value.colorValue : '#3A83F7'
  ))
  const [pickerValue, setPickerValue] = useState(() => parseColor(lastCustomColor))

  const CurrentIcon = useMemo(() => getFolderIcon(value.iconKey), [value.iconKey])
  const lowContrast = isFolderCustomColor(value.colorValue)
    && contrastRatio(value.colorValue, colorMode === 'dark' ? '#1f1f1f' : '#ffffff') < 2

  useEffect(() => {
    if (open && !isFolderCustomColor(value.colorValue)) return
    setCustomExpanded(isFolderCustomColor(value.colorValue))
    if (isFolderCustomColor(value.colorValue)) {
      setLastCustomColor(value.colorValue)
      setPickerValue(parseColor(value.colorValue))
    }
  }, [open, value.colorValue])

  const syncPickerState = () => {
    const customColor = isFolderCustomColor(value.colorValue)
      ? value.colorValue
      : lastCustomColor
    setCustomExpanded(isFolderCustomColor(value.colorValue))
    setPickerValue(parseColor(customColor))
  }

  const handleOpenChange = (details: { open: boolean }) => {
    if (details.open) syncPickerState()
    setOpen(details.open)
  }

  const selectCustomColor = () => {
    const nextExpanded = !customExpanded
    setCustomExpanded(nextExpanded)
    if (nextExpanded) {
      onChange({ ...value, colorValue: lastCustomColor })
      setPickerValue(parseColor(lastCustomColor))
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={handleOpenChange}
      positioning={{ placement: 'bottom-start', gutter: 4, strategy: 'fixed' }}
      closeOnEscape
      closeOnInteractOutside
    >
      <Popover.Trigger asChild>
        <IconButton
          aria-label={tt('folders_icon_and_color', 'Icon and color')}
          variant="ghost"
          boxSize="34px"
          minW="34px"
          p={0}
          flexShrink={0}
          borderRadius="14px"
          bg="transparent"
          _hover={{ bg: 'transparent' }}
          _active={{ bg: 'transparent' }}
          css={{ '&[data-state=open]': { background: 'transparent' } }}
        >
          <Box as={CurrentIcon} color={getFolderColor(value.colorValue)} boxSize="20px" strokeWidth={1.8} />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner zIndex={1600}>
          <Popover.Content
            width="260px"
            maxWidth="calc(100vw - 16px)"
            maxHeight="calc(100dvh - 16px)"
            overflowY="auto"
            bg="bg.panel"
            color={PANEL_FOREGROUND}
            borderColor="border.muted"
            borderRadius="16px"
            shadow="lg"
          >
            <Popover.Body p="10px">
              <Stack gap="10px">
                <Box>
                  <Text id="folder-color-presets-label" srOnly>
                    {tt('folders_color_presets', 'Folder colors')}
                  </Text>
                  <SimpleGrid columns={6} gap="4px" aria-labelledby="folder-color-presets-label">
                    {FOLDER_PRESET_COLORS.map((color) => {
                      const selected = value.colorValue === color.key
                      return (
                        <IconButton
                          key={color.key}
                          aria-label={tt(color.labelKey, color.fallbackLabel)}
                          aria-pressed={selected}
                          variant="ghost"
                          boxSize="36px"
                          minW="36px"
                          p={0}
                          borderRadius="full"
                          onClick={() => {
                            onChange({ ...value, colorValue: color.key })
                            setCustomExpanded(false)
                          }}
                        >
                          <Box
                            boxSize="24px"
                            borderRadius="full"
                            bg={color.hex}
                            borderWidth={selected ? '2px' : '1px'}
                            borderColor={selected ? 'bg.panel' : 'border.muted'}
                            boxShadow={selected ? `0 0 0 2px ${color.hex}` : undefined}
                          />
                        </IconButton>
                      )
                    })}
                  </SimpleGrid>
                </Box>

                <Box>
                  <Button
                    width="100%"
                    height="40px"
                    px="6px"
                    variant="ghost"
                    color={PANEL_FOREGROUND}
                    justifyContent="flex-start"
                    onClick={selectCustomColor}
                    aria-expanded={customExpanded}
                  >
                    <Box
                      boxSize="24px"
                      borderRadius="full"
                      bg={lastCustomColor}
                      borderWidth="2px"
                      borderColor="border.muted"
                      boxShadow={isFolderCustomColor(value.colorValue)
                        ? `0 0 0 2px ${value.colorValue}`
                        : undefined}
                    />
                    <Text flex="1" textAlign="start">
                      {tt('folders_custom_color', 'Custom color')}
                    </Text>
                    <LuChevronDown
                      aria-hidden
                      style={{ transform: customExpanded ? 'rotate(180deg)' : undefined }}
                    />
                  </Button>

                  {customExpanded ? (
                    <ColorPicker.Root
                      value={pickerValue}
                      onValueChange={(details) => {
                        const hex = toHexColor(details.value.toString('hexa'))
                        setPickerValue(details.value)
                        setLastCustomColor(hex)
                        onChange({ ...value, colorValue: hex })
                      }}
                      mt="6px"
                    >
                      <ColorPicker.HiddenInput />
                      <Stack gap="8px">
                        <ColorPicker.Area height="112px" />
                        <HStack gap="8px">
                          <ColorPicker.EyeDropper size="sm" variant="outline" />
                          <ColorPicker.ChannelSlider channel="hue" flex="1">
                            <ColorPicker.ChannelSliderTrack />
                            <ColorPicker.ChannelSliderThumb />
                          </ColorPicker.ChannelSlider>
                        </HStack>
                        <ColorPicker.Input
                          aria-label={tt('folders_color_hex', 'Hex color')}
                          height="30px"
                        />
                        {lowContrast ? (
                          <Text fontSize="xs" color="fg.warning">
                            {tt(
                              'folders_color_contrast_warning',
                              'This color may be hard to see in the current theme.',
                            )}
                          </Text>
                        ) : null}
                      </Stack>
                    </ColorPicker.Root>
                  ) : null}
                </Box>

                <Box borderTopWidth="1px" borderColor="border.muted" pt="10px">
                  <Text id="folder-icon-presets-label" srOnly>
                    {tt('folders_icon_presets', 'Folder icons')}
                  </Text>
                  <SimpleGrid columns={6} gap="4px" aria-labelledby="folder-icon-presets-label">
                    {FOLDER_ICON_CATALOG.map((definition) => {
                      const selected = value.iconKey === definition.key
                      return (
                        <IconButton
                          key={definition.key}
                          aria-label={tt(definition.labelKey, definition.fallbackLabel)}
                          aria-pressed={selected}
                          variant="ghost"
                          boxSize="36px"
                          minW="36px"
                          p={0}
                          borderRadius="full"
                          bg={selected ? 'bg.muted' : 'transparent'}
                          color={PANEL_FOREGROUND}
                          onClick={() => onChange({ ...value, iconKey: definition.key })}
                        >
                          <definition.Icon size="20px" strokeWidth={1.8} />
                        </IconButton>
                      )
                    })}
                  </SimpleGrid>
                </Box>
              </Stack>
            </Popover.Body>
            <Popover.Footer borderTopWidth="1px" borderColor="border.muted" p="6px" justifyContent="flex-start">
              <Button
                variant="ghost"
                size="sm"
                color={PANEL_FOREGROUND}
                onClick={() => setOpen(false)}
              >
                {tt('folders_done', 'Done')}
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
