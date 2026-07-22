import { Box, Heading, HStack, Switch, Text } from '@chakra-ui/react'
import { tt } from '@/utils/i18n'

interface UpgradeReminderControlProps {
  enabled: boolean
  isLoading: boolean
  onEnabledChange: (enabled: boolean) => void
  variant?: 'default' | 'compact'
}

export function UpgradeReminderControl({
  enabled,
  isLoading,
  onEnabledChange,
  variant = 'default',
}: UpgradeReminderControlProps) {
  const isCompact = variant === 'compact'

  return (
    <Box mb={isCompact ? 3 : 5}>
      <Heading size="sm" mb={isCompact ? 2 : 3}>
        {tt('settingPanel.theme.upgradeReminders', 'Upgrade reminders')}
      </Heading>
      <HStack justify="space-between" gap={3}>
        <Text fontSize="sm" color="gemOnSurface" minW={0}>
          {tt(
            'settingPanel.theme.hideUpgradeReminder',
            'Hide Gemini upgrade reminder',
          )}
        </Text>
        <Switch.Root
          checked={enabled}
          disabled={isLoading}
          onCheckedChange={(details) => onEnabledChange(details.checked)}
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </HStack>
    </Box>
  )
}
