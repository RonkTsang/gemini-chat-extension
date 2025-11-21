import { Box, Heading, Stack, Text } from '@chakra-ui/react'

import QuoteIcon from '~/assets/quote.svg?react'

import type { QuickFollowPrompt, QuickFollowSettings } from '@/domain/quick-follow/types'
import { CapsuleBar } from '@/components/quick-follow/capsule-bar'
import { t } from '@/utils/i18n'

export interface LivePreviewProps {
  prompts: QuickFollowPrompt[]
  settings: QuickFollowSettings
}

const noop = () => {}

export function LivePreview({ prompts, settings }: LivePreviewProps) {
  return (
    <Box width="fit-content">
      <CapsuleBar
        askLabel={t('askGemini')}
        askIcon={<QuoteIcon />}
        onAsk={noop}
        prompts={prompts}
        orderedIds={settings.orderedIds}
        onRunPrompt={noop}
        tooltipPlacement="top"
      />
    </Box>
  )
}

