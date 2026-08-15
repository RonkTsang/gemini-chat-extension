import { useEffect, useState } from 'react'
import {
  Box,
  Heading,
  HStack,
  IconButton,
  Separator,
  Switch,
  Text,
} from '@chakra-ui/react'
import { LuInfo } from 'react-icons/lu'
import { toaster } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'
import {
  DEFAULT_THEME_BLOOM_ENABLED,
  enableThemeBloom,
} from '@/entrypoints/popup/storage'
import { tt } from '@/utils/i18n'

interface ThemeBloomControlProps {
  variant?: 'default' | 'compact'
}

export function ThemeBloomControl({
  variant = 'default',
}: ThemeBloomControlProps) {
  const [enabled, setEnabled] = useState(DEFAULT_THEME_BLOOM_ENABLED)
  const [isLoading, setIsLoading] = useState(true)
  const isCompact = variant === 'compact'
  const title = tt(
    'settingPanel.theme.themeBloom.title',
    'Theme Bloom',
  )
  const description = tt(
    'settingPanel.theme.themeBloom.description',
    'Drop an image outside the prompt box to apply a matching theme. Drop it inside the prompt box to upload to Gemini.',
  )

  useEffect(() => {
    let isMounted = true

    void enableThemeBloom.getValue()
      .then((storedEnabled) => {
        if (isMounted) {
          setEnabled(storedEnabled)
        }
      })
      .catch((error) => {
        const message = error instanceof Error
          ? error.message
          : 'Failed to load setting'
        toaster.create({ type: 'error', title: message })
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    const unwatch = enableThemeBloom.watch((storedEnabled) => {
      if (isMounted) {
        setEnabled(storedEnabled)
      }
    })

    return () => {
      isMounted = false
      unwatch()
    }
  }, [])

  const handleCheckedChange = async (checked: boolean) => {
    try {
      await enableThemeBloom.setValue(checked)
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to update setting'
      toaster.create({ type: 'error', title: message })
    }
  }

  return (
    <Box mb={5} data-control="theme-bloom">
      <Heading size="sm" mb={isCompact ? 2 : 3}>
        {tt('settingPanel.theme.interactions', 'Interactions')}
      </Heading>

      <HStack justify="space-between" gap={3}>
        <HStack gap={1} minW={0}>
          <Text fontSize="sm" color="gemOnSurface">
            {title}
          </Text>
          <Tooltip
            content={description}
            openDelay={250}
            closeDelay={80}
            showArrow
            contentProps={{ maxWidth: '280px' }}
          >
            <IconButton
              aria-label={description}
              variant="ghost"
              size="2xs"
              color="fg.muted"
              flexShrink={0}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'gemPrimary',
                outlineOffset: '1px',
              }}
            >
              <LuInfo />
            </IconButton>
          </Tooltip>
        </HStack>
        <Switch.Root
          checked={enabled}
          disabled={isLoading}
          onCheckedChange={(details) => {
            void handleCheckedChange(details.checked)
          }}
          flexShrink={0}
        >
          <Switch.HiddenInput aria-label={title} />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </HStack>
      <Separator
        mt={isCompact ? 3 : 4}
        borderColor="border.muted"
        data-separator="interactions"
      />
    </Box>
  )
}
