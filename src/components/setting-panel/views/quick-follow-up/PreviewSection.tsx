import type { CSSProperties } from 'react'
import { Box, Container, Stack, Text } from '@chakra-ui/react'

import QuoteIcon from '~/assets/quote.svg?react'

import type { QuickFollowPrompt, QuickFollowSettings } from '@/domain/quick-follow/types'
import { CapsuleBar } from '@/components/quick-follow/capsule-bar'
import { t } from '@/utils/i18n'
import { useColorModeValue } from '@/components/ui/color-mode'

export interface PreviewSectionProps {
  prompts: QuickFollowPrompt[]
  settings: QuickFollowSettings
}

const noop = () => {}

export function PreviewSection({ prompts, settings }: PreviewSectionProps) {
  const selectionBg = useColorModeValue('blue.300', 'blue.600')
  // const selectionColor = useColorModeValue('blue.900', 'blue.100')

  return (
    <Container 
      style={{
        '--left-color': 'light-dark(#aecbfa, #533148)',
        '--right-color': 'light-dark(#fff0df, #223f61)',
        'backgroundImage': 'linear-gradient(to right, var(--left-color), var(--right-color))',
      } as CSSProperties}
      p={6} 
      borderRadius="2xl"
      width="100%"
    >
      <Stack direction="column" gap={2} align="center">
        {/* CapsuleBar preview */}
        <CapsuleBar
          askLabel={t('askGemini')}
          askIcon={<QuoteIcon />}
          onAsk={noop}
          prompts={prompts}
          orderedIds={settings.orderedIds}
          onRunPrompt={noop}
          tooltipPlacement="bottom"
        />

        {/* Simulated selected text */}
        <Box userSelect="none">
          <Text fontSize="md" color="fg">
            hello
            <Text
              as="span"
              bg={selectionBg}
              color="fg"
              px={1}
              mx={1}
            >
              gemini
            </Text>
          </Text>
        </Box>
      </Stack>
    </Container>
  )
}

