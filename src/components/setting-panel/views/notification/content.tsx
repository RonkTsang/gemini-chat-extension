import { Box, Button, Container, Stack, Switch, Text } from '@chakra-ui/react'
import { NotificationTestButton } from '@/components/notification/NotificationTestButton'
import { useResponseCompleteNotificationSettings } from '@/hooks/useResponseCompleteNotificationSettings'
import { t } from '@/utils/i18n'
import { NotificationAudioAssetControl } from './NotificationAudioAssetControl'

interface NotificationSettingsContentProps {
  extensionPage?: boolean
}

export function NotificationSettingsContent({ extensionPage = false }: NotificationSettingsContentProps) {
  const notificationSettings = useResponseCompleteNotificationSettings()
  const containerBackground = extensionPage ? 'bg.subtle' : 'gemSurfaceContainer'

  return (
    <Box
      position="relative"
      height={extensionPage ? undefined : '100%'}
      minHeight={extensionPage ? '100vh' : undefined}
      display="flex"
      flexDirection="column"
    >
      <Box flex="1" overflow="auto">
        <Container display="flex" justifyContent="center">
          <Stack direction="column" maxWidth="740px" width="100%" align="stretch" gap={4}>
            <Container backgroundColor={containerBackground} p={4} borderRadius="2xl">
              <Stack direction="row" align="center" justify="space-between" gap={4}>
                <Stack gap={1}>
                  <Text>{t('responseNotificationLabel')}</Text>
                  <Text fontSize="sm" color="fg.muted">
                    {t('responseNotificationDescription')}
                  </Text>
                </Stack>
                <Switch.Root
                  checked={notificationSettings.enabled}
                  disabled={notificationSettings.isLoading || notificationSettings.isPending}
                  onCheckedChange={(details) => void notificationSettings.toggleEnabled(details.checked)}
                  flexShrink={0}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Stack>
            </Container>

            {notificationSettings.audioSupported ? (
              <Container backgroundColor={containerBackground} p={4} borderRadius="2xl">
                <Stack gap={3}>
                  <Stack direction="row" align="center" justify="space-between" gap={4}>
                    <Stack gap={1}>
                      <Text>{t('responseNotificationAudioLabel')}</Text>
                    </Stack>
                    <Switch.Root
                      checked={notificationSettings.audioEnabled}
                      disabled={
                        !notificationSettings.enabled
                        || notificationSettings.isLoading
                        || notificationSettings.isPending
                        || notificationSettings.isAudioPending
                      }
                      onCheckedChange={(details) => void notificationSettings.toggleAudioEnabled(details.checked)}
                      flexShrink={0}
                    >
                      <Switch.HiddenInput />
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Root>
                  </Stack>

                  {notificationSettings.audioEnabled ? (
                    <NotificationAudioAssetControl
                      disabled={
                        !notificationSettings.enabled
                        || notificationSettings.isLoading
                        || notificationSettings.isPending
                        || notificationSettings.isAudioPending
                      }
                    />
                  ) : null}
                </Stack>
              </Container>
            ) : null}

            <Container backgroundColor={containerBackground} p={4} borderRadius="2xl">
              <Stack direction="row" align="center" justify="space-between" gap={4}>
                <Stack gap={1}>
                  <Text>{t('responseNotificationForegroundOnlyLabel')}</Text>
                  <Text fontSize="sm" color="fg.muted">
                    {t('responseNotificationForegroundOnlyDescription')}
                  </Text>
                </Stack>
                <Switch.Root
                  checked={notificationSettings.foregroundOnly}
                  disabled={
                    !notificationSettings.enabled
                    || notificationSettings.isLoading
                    || notificationSettings.isPending
                  }
                  onCheckedChange={(details) => void notificationSettings.toggleForegroundOnly(details.checked)}
                  flexShrink={0}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Stack>
            </Container>

            {notificationSettings.notice || notificationSettings.statusText ? (
              <Text fontSize="sm" color="fg.muted">
                {notificationSettings.notice || notificationSettings.statusText}
              </Text>
            ) : null}

            {notificationSettings.audioNotice || notificationSettings.audioStatusText ? (
              <Text fontSize="sm" color="fg.muted">
                {notificationSettings.audioNotice || notificationSettings.audioStatusText}
              </Text>
            ) : null}

            {notificationSettings.enabled ? (
              <Stack direction={{ base: 'column', sm: 'row' }} gap={2}>
                <NotificationTestButton
                  variant="outline"
                  canSendTest={notificationSettings.canSendTest}
                  sendTestNotification={notificationSettings.sendTestNotification}
                >
                  {t('responseNotificationTest')}
                </NotificationTestButton>
                <Button variant="ghost" onClick={notificationSettings.openTroubleshooting}>
                  {t('responseNotificationTroubleshooting')}
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}

NotificationSettingsContent.displayName = 'NotificationSettingsContent'
