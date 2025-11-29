import { useEffect, useState } from 'react'
import { Box, Container, Stack, Switch, Text } from '@chakra-ui/react'
import { enableChatOutline } from '@/entrypoints/popup/storage'
import { t } from '@/utils/i18n'
import { toaster } from '@/components/ui/toaster'

export function ChatOutlineSettingsView() {
  const [enabled, setEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const value = await enableChatOutline.getValue()
        setEnabled(value)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load setting'
        toaster.create({ type: 'error', title: message })
      } finally {
        setIsLoading(false)
      }
    }
    void loadSetting()
  }, [])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await enableChatOutline.setValue(checked)
      setEnabled(checked)
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
      data-view="chat-outline-settings"
    >
      <Box 
        flex="1" 
        overflow="auto"
      >
        <Container display={'flex'} justifyContent={'center'}>
          <Stack direction="column" maxWidth={'740px'} width={'100%'} align="stretch" gap={6}>
            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
              <Stack direction="row" align="center" justify="space-between" gap={3}>
                <Text>{t('settings.chatOutline.enable')}</Text>
                <Switch.Root
                  checked={enabled}
                  onCheckedChange={(details) => void handleToggleEnabled(details.checked)}
                  disabled={isLoading}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Stack>
            </Container>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}

ChatOutlineSettingsView.displayName = 'ChatOutlineSettingsView'

