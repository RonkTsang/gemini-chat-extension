import { useEffect, useState } from 'react'
import { Box, Container, Stack, Switch, Text } from '@chakra-ui/react'
import {
  enableBulkDelete,
  enableChatOutline,
  enableGemAvatar,
} from '@/entrypoints/popup/storage'
import { toaster } from '@/components/ui/toaster'
import { t } from '@/utils/i18n'

interface FeatureToggleCardProps {
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}

function FeatureToggleCard({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: FeatureToggleCardProps) {
  return (
    <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
      <Stack direction="row" align="center" justify="space-between" gap={4}>
        <Stack gap={1}>
          <Text>{title}</Text>
          <Text fontSize="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
        <Switch.Root
          checked={checked}
          disabled={disabled}
          onCheckedChange={(details) => onCheckedChange(details.checked)}
          flexShrink={0}
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </Stack>
    </Container>
  )
}

export function EnhancementsSettingsView() {
  const [chatOutlineEnabled, setChatOutlineEnabled] = useState(true)
  const [bulkDeleteEnabled, setBulkDeleteEnabled] = useState(true)
  const [gemAvatarEnabled, setGemAvatarEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const [chatOutline, bulkDelete, gemAvatar] = await Promise.all([
          enableChatOutline.getValue(),
          enableBulkDelete.getValue(),
          enableGemAvatar.getValue(),
        ])
        if (!isMounted) {
          return
        }

        setChatOutlineEnabled(chatOutline)
        setBulkDeleteEnabled(bulkDelete)
        setGemAvatarEnabled(gemAvatar)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load settings'
        toaster.create({ type: 'error', title: message })
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSettings()
    const unwatchChatOutline = enableChatOutline.watch((enabled) => {
      if (isMounted) {
        setChatOutlineEnabled(enabled)
      }
    })
    const unwatchBulkDelete = enableBulkDelete.watch((enabled) => {
      if (isMounted) {
        setBulkDeleteEnabled(enabled)
      }
    })
    const unwatchGemAvatar = enableGemAvatar.watch((enabled) => {
      if (isMounted) {
        setGemAvatarEnabled(enabled)
      }
    })

    return () => {
      isMounted = false
      unwatchChatOutline()
      unwatchBulkDelete()
      unwatchGemAvatar()
    }
  }, [])

  const updateChatOutlineEnabled = async (enabled: boolean) => {
    try {
      await enableChatOutline.setValue(enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update setting'
      toaster.create({ type: 'error', title: message })
    }
  }

  const updateBulkDeleteEnabled = async (enabled: boolean) => {
    try {
      await enableBulkDelete.setValue(enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update setting'
      toaster.create({ type: 'error', title: message })
    }
  }

  const updateGemAvatarEnabled = async (enabled: boolean) => {
    try {
      await enableGemAvatar.setValue(enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update setting'
      toaster.create({ type: 'error', title: message })
    }
  }

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="enhancements-settings"
    >
      <Box flex="1" overflow="auto">
        <Container display="flex" justifyContent="center">
          <Stack direction="column" maxWidth="740px" width="100%" align="stretch" gap={4}>
            <FeatureToggleCard
              title={t('settings.enhancements.chatOutline.title')}
              description={t('settings.enhancements.chatOutline.description')}
              checked={chatOutlineEnabled}
              disabled={isLoading}
              onCheckedChange={(enabled) => void updateChatOutlineEnabled(enabled)}
            />
            <FeatureToggleCard
              title={t('settings.enhancements.bulkDelete.title')}
              description={t('settings.enhancements.bulkDelete.description')}
              checked={bulkDeleteEnabled}
              disabled={isLoading}
              onCheckedChange={(enabled) => void updateBulkDeleteEnabled(enabled)}
            />
            <FeatureToggleCard
              title={t('settings.enhancements.gemAvatar.title')}
              description={t('settings.enhancements.gemAvatar.description')}
              checked={gemAvatarEnabled}
              disabled={isLoading}
              onCheckedChange={(enabled) => void updateGemAvatarEnabled(enabled)}
            />
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}

EnhancementsSettingsView.displayName = 'EnhancementsSettingsView'
