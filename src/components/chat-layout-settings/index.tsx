import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Box,
  Checkbox,
  Flex,
  Heading,
  HStack,
  SegmentGroup,
  Separator,
  Slider,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import leftAlignSvg from '@/assets/left-align.svg?raw'
import rightAlignSvg from '@/assets/right-align.svg?raw'
import { toaster } from '@/components/ui/toaster'
import {
  CHAT_WIDTH_PERCENT_MAX,
  CHAT_WIDTH_PERCENT_MIN,
  CHAT_WIDTH_PX_MAX,
  CHAT_WIDTH_PX_MIN,
  createSyncInputWidthPatch,
  createWidthModePatch,
  createWidthValuePatch,
  DEFAULT_CHAT_SETTINGS,
  chatSettingsStorage,
  getChatSettings,
  normalizeChatSettings,
  type ChatSettings,
  type ChatSettingsPatch,
  type ChatWidthMode,
} from '@/services/chatSettings'
import { applyChatSettingsStyles } from '@/entrypoints/content/chat-settings/styleController'
import { tt } from '@/utils/i18n'

interface WidthControlProps {
  label: string
  mode: ChatWidthMode
  percent: number
  px: number
  disabled?: boolean
  onModeChange: (mode: ChatWidthMode) => void
  onValueChange: (value: number) => void
  onValueChangeEnd: (value: number) => void
}

const WIDTH_MODES: Array<{
  value: ChatWidthMode
  label: string
  accessibleLabel: string
}> = [
  {
    value: 'default',
    label: 'Default',
    accessibleLabel: 'Default',
  },
  {
    value: 'percent',
    label: '%',
    accessibleLabel: 'Percent',
  },
  {
    value: 'px',
    label: 'px',
    accessibleLabel: 'Pixels',
  },
]

function WidthControl({
  label,
  mode,
  percent,
  px,
  disabled = false,
  onModeChange,
  onValueChange,
  onValueChangeEnd,
}: WidthControlProps) {
  const isPercent = mode === 'percent'
  const value = isPercent ? percent : px
  const min = isPercent ? CHAT_WIDTH_PERCENT_MIN : CHAT_WIDTH_PX_MIN
  const max = isPercent ? CHAT_WIDTH_PERCENT_MAX : CHAT_WIDTH_PX_MAX
  const step = isPercent ? 1 : 10
  const unit = isPercent ? '%' : 'px'

  return (
    <Stack gap={2}>
      <Flex align="center" justify="space-between" gap={3}>
        <Text
          id={`${label.replace(/\s+/g, '-').toLowerCase()}-label`}
          fontSize="sm"
          fontWeight="medium"
          color="gemOnSurface"
          whiteSpace="nowrap"
        >
          {label}
        </Text>
        <SegmentGroup.Root
          value={mode}
          onValueChange={(details) => {
            if (details.value) {
              onModeChange(details.value as ChatWidthMode)
            }
          }}
          disabled={disabled}
          size="sm"
          bg="bg"
          aria-labelledby={`${label.replace(/\s+/g, '-').toLowerCase()}-label`}
        >
          <SegmentGroup.Indicator
            borderRadius="md"
            bg="colorPalette.solid"
            shadow="sm"
          />
          {WIDTH_MODES.map((item) => {
            const localizedAccessibleLabel = item.value === 'default'
              ? tt('chatSettings.default', item.accessibleLabel)
              : item.value === 'percent'
                ? tt('chatSettings.percent', item.accessibleLabel)
                : tt('chatSettings.pixels', item.accessibleLabel)

            return (
              <SegmentGroup.Item
                key={item.value}
                value={item.value}
                aria-label={localizedAccessibleLabel}
                title={localizedAccessibleLabel}
                borderRadius="md"
                px={2}
                color="gemOnSurfaceVariant"
                fontSize="xs"
                fontWeight="medium"
                _checked={{ color: 'colorPalette.contrast' }}
                cursor={disabled ? 'not-allowed' : 'pointer'}
              >
                <SegmentGroup.ItemText>
                  {item.value === 'default'
                    ? tt('chatSettings.default', item.label)
                    : item.label}
                </SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )
          })}
        </SegmentGroup.Root>
      </Flex>

      {mode !== 'default' && (
        <HStack gap={3}>
          <Slider.Root
            aria-label={[`${label}: ${value}${unit}`]}
            min={min}
            max={max}
            step={step}
            value={[value]}
            onValueChange={(details) => {
              onValueChange(details.value[0] ?? value)
            }}
            onValueChangeEnd={(details) => {
              onValueChangeEnd(details.value[0] ?? value)
            }}
            disabled={disabled}
            flex="1"
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumb index={0} />
            </Slider.Control>
          </Slider.Root>
          <Text
            minW="48px"
            textAlign="end"
            fontSize="xs"
            color="gemOnSurfaceVariant"
            aria-live="polite"
          >
            {value}{unit}
          </Text>
        </HStack>
      )}
    </Stack>
  )
}

function SvgIcon({ svg }: { svg: string }) {
  return (
    <Box
      aria-hidden="true"
      boxSize={4}
      display="block"
      flexShrink={0}
      lineHeight="1"
      dangerouslySetInnerHTML={{ __html: svg }}
      css={{ '& svg': { display: 'block', width: '100%', height: '100%' } }}
    />
  )
}

function ChatLayoutControls({
  settings,
  isLoading,
  previewPatch,
  commitPatch,
}: {
  settings: ChatSettings
  isLoading: boolean
  previewPatch: (patch: ChatSettingsPatch) => void
  commitPatch: (patch: ChatSettingsPatch) => void
}) {
  const effectiveInputMode = settings.syncInputWidth
    ? settings.chatWidthMode
    : settings.inputWidthMode
  const effectiveInputPercent = settings.syncInputWidth
    ? settings.chatWidthPercent
    : settings.inputWidthPercent
  const effectiveInputPx = settings.syncInputWidth
    ? settings.chatWidthPx
    : settings.inputWidthPx

  return (
    <Stack gap={3}>
      <Stack gap={3}>
        <WidthControl
          label={tt('chatSettings.chatWidth', 'Chat Width')}
          mode={settings.chatWidthMode}
          percent={settings.chatWidthPercent}
          px={settings.chatWidthPx}
          disabled={isLoading}
          onModeChange={(chatWidthMode) => {
            commitPatch(createWidthModePatch(
              'chat',
              chatWidthMode,
              settings.syncInputWidth,
            ))
          }}
          onValueChange={(value) => {
            previewPatch(createWidthValuePatch(
              'chat',
              settings.chatWidthMode,
              value,
              settings.syncInputWidth,
            ))
          }}
          onValueChangeEnd={(value) => {
            commitPatch(createWidthValuePatch(
              'chat',
              settings.chatWidthMode,
              value,
              settings.syncInputWidth,
            ))
          }}
        />

        <WidthControl
          label={tt('chatSettings.inputWidth', 'Input Width')}
          mode={effectiveInputMode}
          percent={effectiveInputPercent}
          px={effectiveInputPx}
          disabled={isLoading}
          onModeChange={(inputWidthMode) => {
            commitPatch(createWidthModePatch(
              'input',
              inputWidthMode,
              settings.syncInputWidth,
            ))
          }}
          onValueChange={(value) => {
            previewPatch(createWidthValuePatch(
              'input',
              effectiveInputMode,
              value,
              settings.syncInputWidth,
            ))
          }}
          onValueChangeEnd={(value) => {
            commitPatch(createWidthValuePatch(
              'input',
              effectiveInputMode,
              value,
              settings.syncInputWidth,
            ))
          }}
        />

        <Checkbox.Root
          checked={settings.syncInputWidth}
          onCheckedChange={(details) => {
            commitPatch(createSyncInputWidthPatch(
              settings,
              Boolean(details.checked),
            ))
          }}
          disabled={isLoading}
          size="sm"
          alignItems="center"
          gap={2}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control flexShrink={0}>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label
            fontSize="xs"
            lineHeight="normal"
            color="gemOnSurfaceVariant"
            cursor={isLoading ? 'not-allowed' : 'pointer'}
          >
            {tt(
              'chatSettings.syncWidths',
              'Sync Chat Width and Input Width',
            )}
          </Checkbox.Label>
        </Checkbox.Root>
      </Stack>

      <Separator borderColor="border.muted" />

      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="semibold" color="gemOnSurface">
          {tt('chatSettings.userMessages', 'User messages')}
        </Text>

        <Flex align="center" justify="space-between" gap={3}>
          <Text
            id="user-message-alignment-label"
            fontSize="sm"
            color="gemOnSurface"
          >
            {tt('chatSettings.alignment', 'Alignment')}
          </Text>
          <SegmentGroup.Root
            value={settings.userMessageAlignment}
            onValueChange={(details) => {
              if (details.value === 'left' || details.value === 'right') {
                commitPatch({ userMessageAlignment: details.value })
              }
            }}
            disabled={isLoading}
            size="sm"
            bg="bg"
            aria-labelledby="user-message-alignment-label"
          >
            <SegmentGroup.Indicator
              borderRadius="md"
              bg="colorPalette.solid"
              shadow="sm"
            />
            <SegmentGroup.Item
              value="left"
              aria-label={tt('chatSettings.alignLeft', 'Align left')}
              title={tt('chatSettings.alignLeft', 'Align left')}
              borderRadius="md"
              px={3}
              color="gemOnSurfaceVariant"
              _checked={{ color: 'colorPalette.contrast' }}
            >
              <SegmentGroup.ItemText asChild>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  lineHeight="1"
                >
                  <SvgIcon svg={leftAlignSvg} />
                </Box>
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
            <SegmentGroup.Item
              value="right"
              aria-label={tt('chatSettings.alignRight', 'Align right')}
              title={tt('chatSettings.alignRight', 'Align right')}
              borderRadius="md"
              px={3}
              color="gemOnSurfaceVariant"
              _checked={{ color: 'colorPalette.contrast' }}
            >
              <SegmentGroup.ItemText asChild>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  lineHeight="1"
                >
                  <SvgIcon svg={rightAlignSvg} />
                </Box>
              </SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          </SegmentGroup.Root>
        </Flex>

        <Switch.Root
          checked={settings.userMessageFullWidth}
          onCheckedChange={(details) => {
            commitPatch({
              userMessageFullWidth: Boolean(details.checked),
            })
          }}
          disabled={isLoading}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
        >
          <Switch.Label
            fontSize="sm"
            color="gemOnSurface"
            cursor={isLoading ? 'not-allowed' : 'pointer'}
          >
            {tt(
              'chatSettings.allowFullWidthMessages',
              'Allow full-width messages',
            )}
          </Switch.Label>
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </Stack>
    </Stack>
  )
}

export interface ChatLayoutSettingsProps {
  variant?: 'default' | 'compact'
  showHeading?: boolean
}

export function ChatLayoutSettings({
  variant = 'default',
  showHeading = true,
}: ChatLayoutSettingsProps) {
  const [settings, setSettings] = useState(DEFAULT_CHAT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const settingsRef = useRef(DEFAULT_CHAT_SETTINGS)
  const isCompact = variant === 'compact'

  useEffect(() => {
    let isMounted = true

    void getChatSettings()
      .then((loadedSettings) => {
        if (isMounted) {
          settingsRef.current = loadedSettings
          setSettings(loadedSettings)
        }
      })
      .catch((error) => {
        toaster.create({
          type: 'error',
          title: error instanceof Error
            ? error.message
            : 'Failed to load Chat layout',
        })
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    const unwatch = chatSettingsStorage.watch((nextSettings) => {
      if (isMounted) {
        const normalized = normalizeChatSettings(nextSettings)
        settingsRef.current = normalized
        setSettings(normalized)
      }
    })

    return () => {
      isMounted = false
      unwatch()
    }
  }, [])

  const previewPatch = useCallback((patch: ChatSettingsPatch) => {
    const next = normalizeChatSettings({
      ...settingsRef.current,
      ...patch,
    })
    settingsRef.current = next
    setSettings(next)
    applyChatSettingsStyles(next)
    return next
  }, [])

  const commitPatch = useCallback((patch: ChatSettingsPatch) => {
    const next = previewPatch(patch)
    void chatSettingsStorage.setValue(next)
      .catch((error) => {
        toaster.create({
          type: 'error',
          title: error instanceof Error
            ? error.message
            : 'Failed to update Chat layout',
        })
        void getChatSettings().then((storedSettings) => {
          settingsRef.current = storedSettings
          setSettings(storedSettings)
          applyChatSettingsStyles(storedSettings)
        })
      })
  }, [previewPatch])

  return (
    <Box
      mt={showHeading ? 5 : 0}
      data-chat-layout-settings
      data-variant={variant}
    >
      {showHeading && (
        <>
          <Separator
            borderColor="border.muted"
            mb={isCompact ? 4 : 5}
            data-chat-layout-section-separator
          />
          <Heading size="sm" mb={isCompact ? 2 : 3}>
            {tt('chatSettings.title', 'Chat layout')}
          </Heading>
        </>
      )}
      <ChatLayoutControls
        settings={settings}
        isLoading={isLoading}
        previewPatch={previewPatch}
        commitPatch={commitPatch}
      />
    </Box>
  )
}
