import {
  Box,
  Container,
  Stack
} from '@chakra-ui/react'
import { useMemo, useRef, useEffect } from 'react'

import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { getIconDefinition } from './icons'
import { ActionButton } from './action-button'
import { MAX_QUICK_FOLLOW_UP_SHOW_ITEMS } from '@/common/config'

export interface CapsuleBarProps {
  askLabel: React.ReactNode
  askIcon: React.ReactNode
  onAsk: () => void
  prompts: QuickFollowPrompt[]
  orderedIds: string[]
  onRunPrompt: (prompt: QuickFollowPrompt) => void
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right'
}

function sortPrompts(prompts: QuickFollowPrompt[], orderedIds: string[]) {
  const order = new Map(orderedIds.map((id, index) => [id, index]))
  return prompts
    .filter(prompt => prompt.enabled !== false)
    .slice()
    .sort((a, b) => {
      const orderA = order.get(a.id)
      const orderB = order.get(b.id)

      if (orderA === undefined && orderB === undefined) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
      if (orderA === undefined) return 1
      if (orderB === undefined) return -1
      return orderA - orderB
    })
}

export const PROMPT_ITEM_WIDTH = 40 // 16px icon + 24px padding
export const VISIBLE_ITEMS = MAX_QUICK_FOLLOW_UP_SHOW_ITEMS + 0.5
export const PROMPT_CONTAINER_MAX_WIDTH = PROMPT_ITEM_WIDTH * VISIBLE_ITEMS
export const CAPSULE_BAR_ACTION_BUTTON_WIDTH = 130 ;

export function CapsuleBar({
  askLabel,
  askIcon,
  onAsk,
  prompts,
  orderedIds,
  onRunPrompt,
  tooltipPlacement = 'top'
}: CapsuleBarProps) {
  const orderedPrompts = useMemo(() => sortPrompts(prompts, orderedIds), [prompts, orderedIds])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const shouldShowDivider = orderedPrompts.length > 0

  // Enable horizontal scrolling with mouse wheel while preserving trackpad horizontal swipe
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Skip if no horizontal overflow
      if (container.scrollWidth <= container.clientWidth) return

      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)

      // If horizontal scroll dominates, let browser handle it natively (trackpad horizontal swipe)
      if (absX > absY) return

      // Only intercept vertical scrolling and convert to horizontal
      if (absY > 0) {
        e.preventDefault()
        container.scrollLeft += e.deltaY
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [orderedPrompts.length])

  return (
    <Container
      borderRadius="lg"
      border="1px solid"
      borderColor="tocHoverBg"
      bg="tocBg"
      boxShadow="tocShadow"
      _hover={{ boxShadow: '0 6px 16px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.1)' }}
      p={0}
      transition="box-shadow 0.2s"
      overflow="hidden"
      height="38px"
      width="fit-content"
      data-quick-follow="capsule"
    >
      <Stack direction="row" height="100%" alignItems="center" gap={0}>
        <ActionButton
          icon={askIcon}
          label={askLabel}
          tooltip={askLabel}
          tooltipPositioning={{ placement: tooltipPlacement }}
          onClick={onAsk}
        />

        {shouldShowDivider && <Box height="60%" width="1px" bg="separatorColor" flexShrink={0} />}

        <Box
          ref={scrollContainerRef}
          display="flex"
          alignItems="center"
          height="100%"
          overflowX="auto"
          maxWidth={`${PROMPT_CONTAINER_MAX_WIDTH}px`}
          css={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            maskImage: orderedPrompts.length > VISIBLE_ITEMS 
              ? 'linear-gradient(to right, black 85%, transparent 100%)' 
              : 'none'
          }}
        >
          {orderedPrompts.map(prompt => {
            const { Icon: PromptIcon } = getIconDefinition(prompt.iconKey)
            const tooltip = prompt.name || prompt.template
            return (
              <ActionButton
                key={prompt.id}
                icon={<PromptIcon />}
                tooltip={tooltip}
                tooltipPositioning={{ placement: tooltipPlacement }}
                onClick={() => onRunPrompt(prompt)}
                boxProps={{ flexShrink: 0 }}
              />
            )
          })}
        </Box>
      </Stack>
    </Container>
  )
}

