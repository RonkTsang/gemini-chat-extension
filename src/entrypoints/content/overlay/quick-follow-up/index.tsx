import { Presence, useDisclosure } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EVENTS, type AppEvents } from '@/common/event'
import { useEvent } from '@/hooks/useEventBus'
import { eventBus } from '@/utils/eventbus'
import { i18nCache } from '@/utils/i18nCache'
import QuoteIcon from '~/assets/quote.svg?react'
import { CAPSULE_BAR_ACTION_BUTTON_WIDTH, CapsuleBar, PROMPT_CONTAINER_MAX_WIDTH } from '@/components/quick-follow/capsule-bar'
import { useQuickFollowStore } from '@/stores/quickFollowStore'
import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { insertTextToEditor, sendMessage } from '@/utils/editorUtils'
import { useMemoizedFn } from 'ahooks'
import { sleep } from '@/utils/async'

/**
 * i18n keys used by quick-follow-up overlay
 * These keys are cached on component initialization to ensure availability after extension context invalidation
 */
const QUICK_FOLLOW_I18N_KEYS = {
  ASK_GEMINI: 'askGemini'
} as const

function QuickFollowUp() {
  const { open, onOpen, onClose } = useDisclosure()
  const [positionData, setPositionData] = useState<AppEvents['quick-follow-up:show']['event'] | null>(null)
  const [selectedText, setSelectedText] = useState('')

  const {
    prompts,
    settings,
  } = useQuickFollowStore()

  // Pre-cache i18n strings on component mount
  // This ensures strings are available even if extension context becomes invalid
  useEffect(() => {
    const idleCallbackId = requestIdleCallback(() => {
      i18nCache.preCache([
        { key: QUICK_FOLLOW_I18N_KEYS.ASK_GEMINI }
      ])
    })

    return () => {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleCallbackId)
      }
    }
  }, [])

  const displayPosition = useMemo(() => {
    if (!positionData) return null

    const { innerWidth } = window
    const { clientX, clientY } = positionData

    // Estimate dimensions for boundary checks
    const WIDTH = CAPSULE_BAR_ACTION_BUTTON_WIDTH + PROMPT_CONTAINER_MAX_WIDTH;
    const HEIGHT = 60
    const MARGIN = 10

    let left = clientX
    let top = clientY - 15
    let transform = 'translate(-50%, -100%)'

    // Horizontal alignment
    const halfWidth = WIDTH / 2
    if (left - halfWidth < MARGIN) {
      left = halfWidth + MARGIN
    } else if (left + halfWidth > innerWidth - MARGIN) {
      left = innerWidth - halfWidth - MARGIN
    }

    // Vertical alignment (flip if too close to top)
    if (top - HEIGHT < MARGIN) {
      top = clientY + 25
      transform = 'translate(-50%, 0)'
    }

    return {
      top,
      left,
      transform
    }
  }, [positionData])

  const closeOverlay = useCallback(() => {
    onClose()
    setSelectedText('')
  }, [onClose])

  useEvent(EVENTS.QUICK_FOLLOW_UP_SHOW, data => {
    void (async () => {
      setPositionData(data.event)
      setSelectedText(data.text)
      onOpen()
    })()
  })

  useEvent(EVENTS.QUICK_FOLLOW_UP_HIDE, () => {
    closeOverlay()
  })

  useEffect(() => {
    if (!settings.enabled && open) {
      closeOverlay()
    }
  }, [settings.enabled, open, closeOverlay])

  function handleMouseDown(event: MouseEvent) {
    // Fix: EventTarget may not have 'closest'; cast to Element if possible
    const path = event.composedPath();
    const target = path[0] as Element | null;
    console.log('handleMouseDown', path);
    if (!target?.closest('#gemini-quote-button')) {
      closeOverlay();
    }
  }

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open])

  const handleAddQuote = useMemoizedFn(() => {
    if (!selectedText) {
      return
    }
    eventBus.emit(EVENTS.QUICK_FOLLOW_UP_ADD_QUOTE, { text: selectedText })
    closeOverlay()
  })

  const runPrompt = useMemoizedFn(
    async (prompt: QuickFollowPrompt) => {
      if (!selectedText) {
        return
      }
      closeOverlay()

      const message = prompt.template
        .split(QUICK_FOLLOW_PLACEHOLDER)
        .join(selectedText)
      const inserted = insertTextToEditor(message)
      if (!inserted) {
        return
      }

      await sleep(500)
      
      const result = sendMessage()
      if (!result.success) {
        console.warn('Failed to send quick follow-up prompt:', result.reason)
      }
      // eventBus.emit(EVENTS.QUICK_FOLLOW_UP_HIDE, undefined)
    })

  return (
    <Presence
      present={open}
      lazyMount
      animationName={{
        _open: 'slide-from-bottom, fade-in',
        _closed: 'slide-to-bottom, fade-out'
      }}
      animationDuration="250ms"
    >
      <div
        style={{
          position: 'absolute',
          ...displayPosition
        }}
        id="gemini-quote-button"
      >
        <CapsuleBar
          askLabel={i18nCache.get(QUICK_FOLLOW_I18N_KEYS.ASK_GEMINI)}
          askIcon={<QuoteIcon />}
          onAsk={handleAddQuote}
          prompts={prompts}
          orderedIds={settings.orderedIds}
          onRunPrompt={runPrompt}
          tooltipPlacement="top"
        />
      </div>
    </Presence>
  )
}

export default QuickFollowUp