import {
  Box,
  CloseButton,
  HStack,
  Popover,
  Portal,
  Text,
} from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { markFeatureHintSeen, shouldShowFeatureHint } from './storage'

interface FeatureHintRenderProps {
  markSeen: () => void
}

interface FeatureHintBubbleProps {
  id: string
  version: string
  description: ReactNode
  children: (props: FeatureHintRenderProps) => ReactNode
  emoji?: ReactNode
  showArrow?: boolean
  delayMs?: number
  autoDismissMs?: number
  positioning?: Popover.RootProps['positioning']
}

const DEFAULT_POSITIONING: Popover.RootProps['positioning'] = {
  placement: 'bottom',
  gutter: 8,
}

const HINT_BUBBLE_BG = '#ffffff'
const HINT_BUBBLE_TEXT = '#111111'
const HINT_BUBBLE_BORDER = 'rgba(17, 17, 17, 0.14)'

export function FeatureHintBubble({
  id,
  version,
  description,
  children,
  emoji = '✨',
  showArrow = true,
  delayMs = 800,
  autoDismissMs = 6000,
  positioning = DEFAULT_POSITIONING,
}: FeatureHintBubbleProps) {
  const [open, setOpen] = useState(false)
  const showTimerRef = useRef<number | null>(null)
  const autoDismissTimerRef = useRef<number | null>(null)
  const hasMarkedSeenRef = useRef(false)

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current === null) return
    window.clearTimeout(showTimerRef.current)
    showTimerRef.current = null
  }, [])

  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current === null) return
    window.clearTimeout(autoDismissTimerRef.current)
    autoDismissTimerRef.current = null
  }, [])

  const markSeen = useCallback(() => {
    if (hasMarkedSeenRef.current) return

    hasMarkedSeenRef.current = true
    clearShowTimer()
    clearAutoDismissTimer()
    setOpen(false)
    void markFeatureHintSeen(id, version)
  }, [clearAutoDismissTimer, clearShowTimer, id, version])

  useEffect(() => {
    let cancelled = false

    hasMarkedSeenRef.current = false
    clearShowTimer()
    clearAutoDismissTimer()
    setOpen(false)

    void shouldShowFeatureHint(id, version).then((shouldShow) => {
      if (cancelled || !shouldShow) return

      showTimerRef.current = window.setTimeout(() => {
        if (!cancelled) {
          setOpen(true)
        }
      }, delayMs)
    })

    return () => {
      cancelled = true
      clearShowTimer()
      clearAutoDismissTimer()
    }
  }, [clearAutoDismissTimer, clearShowTimer, delayMs, id, version])

  useEffect(() => {
    if (!open || autoDismissMs <= 0) return

    autoDismissTimerRef.current = window.setTimeout(markSeen, autoDismissMs)

    return clearAutoDismissTimer
  }, [autoDismissMs, clearAutoDismissTimer, markSeen, open])

  return (
    <Popover.Root
      open={open}
      positioning={positioning}
      onOpenChange={(details) => {
        if (!details.open && open) {
          markSeen()
        }
      }}
    >
      <Popover.Trigger asChild>{children({ markSeen })}</Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            width="280px"
            maxW="calc(100vw - 32px)"
            borderRadius="xl"
            border="1px solid"
            borderColor={HINT_BUBBLE_BORDER}
            bg="var(--popover-bg)"
            color={HINT_BUBBLE_TEXT}
            boxShadow="0 18px 44px -28px rgba(0, 0, 0, 0.62), 0 8px 20px -18px rgba(0, 0, 0, 0.5)"
            p={0}
            style={{ '--popover-bg': HINT_BUBBLE_BG } as CSSProperties}
          >
            {showArrow && (
              <Popover.Arrow>
                <Popover.ArrowTip
                  borderColor={HINT_BUBBLE_BORDER}
                  bg="var(--popover-bg)"
                />
              </Popover.Arrow>
            )}
            <HStack align="flex-start" gap={2.5} px={3} py={2.5}>
              <Box
                as="span"
                aria-hidden="true"
                flexShrink={0}
                fontSize="lg"
                lineHeight="1.2"
                mt="1px"
              >
                {emoji}
              </Box>
              <Text
                flex="1"
                color={HINT_BUBBLE_TEXT}
                fontSize="sm"
                lineHeight="1.45"
              >
                {description}
              </Text>
              <CloseButton
                aria-label="Dismiss hint"
                size="xs"
                flexShrink={0}
                mt="-2px"
                color="rgba(17, 17, 17, 0.58)"
                onClick={markSeen}
              />
            </HStack>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
