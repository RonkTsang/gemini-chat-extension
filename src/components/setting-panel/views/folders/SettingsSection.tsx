import { Box, Stack, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'

interface SettingsSectionProps {
  id: string
  title: string
  hideTitle?: boolean
  children: ReactNode
}

export function SettingsSection({ id, title, hideTitle = false, children }: SettingsSectionProps) {
  return (
    <Stack as="section" aria-labelledby={hideTitle ? undefined : id} aria-label={hideTitle ? title : undefined} gap={3}>
      {!hideTitle ? <Text as="h2" id={id} px={1} fontSize="sm" fontWeight="semibold">{title}</Text> : null}
      <Box
        bg="transparent"
        _dark={{ bg: 'gemSurfaceContainer' }}
        borderWidth="1px"
        borderColor="gemOnSurface/8"
        borderRadius="2xl"
        px={4}
      >
        {children}
      </Box>
    </Stack>
  )
}
