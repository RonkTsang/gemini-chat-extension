import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Heading, IconButton } from '@chakra-ui/react'
import { HiOutlineArrowLeft, HiOutlineX } from 'react-icons/hi'
import { Tooltip } from '@/components/ui/tooltip'
import { useEvent, useEventEmitter } from '@/hooks/useEventBus'
import { tt } from '@/utils/i18n'
import { ThemeSettingsControls } from '@/components/setting-panel/views/theme/ThemeSettingsControls'
import { useThemeSettingsController } from '@/components/setting-panel/views/theme/useThemeSettingsController'

export function ThemeFloatingPanel() {
  const [open, setOpen] = useState(false)
  const [returnToSettings, setReturnToSettings] = useState(false)
  const { emitSync } = useEventEmitter()

  useEvent('theme-floating-panel:open', (data) => {
    emitSync('settings:close', {
      from: 'theme-floating-panel',
      reason: 'open-theme-studio',
    })
    setReturnToSettings(data.returnToSettings ?? false)
    setOpen(true)
  })

  useEvent('theme-floating-panel:close', (data) => {
    setOpen(false)
    if (data.reopenSettings) {
      emitSync('settings:open', {
        from: 'theme-floating-panel',
        open: true,
        module: 'theme',
      })
    }
  })

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      emitSync('theme-floating-panel:close', { source: 'escape' })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [emitSync, open])

  const handlePrimaryAction = useCallback(() => {
    emitSync('theme-floating-panel:close', {
      source: returnToSettings ? 'back-to-settings' : 'manual',
      reopenSettings: returnToSettings,
    })
  }, [emitSync, returnToSettings])

  if (!open) return null

  return (
    <ThemeFloatingPanelContent
      returnToSettings={returnToSettings}
      onPrimaryAction={handlePrimaryAction}
    />
  )
}

function ThemeFloatingPanelContent({
  returnToSettings,
  onPrimaryAction,
}: {
  returnToSettings: boolean
  onPrimaryAction: () => void
}) {
  const { emitSync } = useEventEmitter()
  const controller = useThemeSettingsController({
    settingsPanelStateSyncEnabled: false,
  })
  const actionLabel = returnToSettings
    ? tt('settingPanel.theme.backToSettings', 'Back to settings')
    : tt('settingPanel.theme.closeThemePanel', 'Close theme panel')
  const closeLabel = tt('settingPanel.theme.closeThemePanel', 'Close theme panel')
  const handleClose = useCallback(() => {
    emitSync('theme-floating-panel:close', { source: 'manual' })
  }, [emitSync])

  return (
    <Box
      position="fixed"
      inset={0}
      pointerEvents="none"
      zIndex={1}
      data-theme-floating-panel-root
    >
      <Box
        position="fixed"
        top="auto"
        right={{ base: 0, md: 4 }}
        bottom={{ base: 0, md: 4 }}
        width={{ base: '100%', md: '300px' }}
        maxWidth={{ base: '100%', md: 'calc(100vw - 32px)' }}
        height="min(500px, 50dvh)"
        maxHeight="50dvh"
        display="flex"
        flexDirection="column"
        pointerEvents="auto"
        bg="gemSurface"
        borderWidth="1px"
        borderColor="border.muted"
        borderRadius={{ base: '16px 16px 0 0', md: 'lg' }}
        shadow="lg"
        overflow="hidden"
        data-theme-floating-panel
      >
        <Flex
          as="header"
          align="center"
          justify="space-between"
          px={3}
          py={2.5}
          borderBottomWidth="1px"
          borderBottomColor="border.muted"
          flexShrink={0}
        >
          <Flex align="center" gap={1.5} minW={0}>
            <Tooltip content={actionLabel}>
              <IconButton
                aria-label={actionLabel}
                size="xs"
                variant="ghost"
                onClick={onPrimaryAction}
              >
                <HiOutlineArrowLeft />
              </IconButton>
            </Tooltip>
            <Heading size="sm" truncate>
              {tt('settingPanel.config.theme.title', 'Theme')}
            </Heading>
          </Flex>
          <Tooltip content={closeLabel}>
            <IconButton
              aria-label={closeLabel}
              size="xs"
              variant="ghost"
              onClick={handleClose}
            >
              <HiOutlineX />
            </IconButton>
          </Tooltip>
        </Flex>

        <Box
          flex="1"
          minH="0"
          overflowY="auto"
          px={3}
          py={3}
        >
          <ThemeSettingsControls controller={controller} variant="compact" />
        </Box>
      </Box>
    </Box>
  )
}
