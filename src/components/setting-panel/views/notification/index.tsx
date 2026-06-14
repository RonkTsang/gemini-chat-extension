import { Box, Button, Container, Stack, Switch, Text } from '@chakra-ui/react'
import { useResponseCompleteNotificationSettings } from '@/hooks/useResponseCompleteNotificationSettings'
import { t } from '@/utils/i18n'

export function NotificationSettingsView() {
  const notificationSettings = useResponseCompleteNotificationSettings()

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="notification-settings"
    >
      <Box flex="1" overflow="auto">
        <Container display="flex" justifyContent="center">
          <Stack direction="column" maxWidth="740px" width="100%" align="stretch" gap={4}>
            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
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
              <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
                <Stack direction="row" align="center" justify="space-between" gap={4}>
                  <Stack gap={1}>
                    <Text>{t('responseNotificationAudioLabel')}</Text>
                    <Text fontSize="sm" color="fg.muted">
                      {t('responseNotificationAudioDescription')}
                    </Text>
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
              </Container>
            ) : null}

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
                <Button
                  variant="outline"
                  disabled={!notificationSettings.canSendTest || notificationSettings.isPending}
                  onClick={() => void notificationSettings.sendTestNotification()}
                >
                  {t('responseNotificationTest')}
                </Button>
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

NotificationSettingsView.displayName = 'NotificationSettingsView'
