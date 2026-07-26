import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Box } from '@chakra-ui/react'
import { ChatLayoutSettings } from '@/components/chat-layout-settings'
import { useEvent, useEventEmitter } from '@/hooks/useEventBus'
import { CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR } from '@/entrypoints/content/top-bar-action'
import { tt } from '@/utils/i18n'

const VIEWPORT_GAP = 8

interface PanelPosition {
  top: number
}

export function ChatSettingsPanel() {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { emitSync } = useEventEmitter()

  const focusShortcut = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(
        CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR,
      )?.focus()
    })
  }, [])

  const closePanel = useCallback((restoreFocus = true) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) focusShortcut()
  }, [focusShortcut])

  const updatePosition = useCallback(() => {
    const anchor = document.querySelector<HTMLElement>(
      CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR,
    )
    if (!anchor) {
      closePanel(false)
      return
    }

    const anchorRect = anchor.getBoundingClientRect()
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    const preferredTop = anchorRect.bottom + VIEWPORT_GAP
    const maxTop = panelHeight > 0
      ? Math.max(VIEWPORT_GAP, window.innerHeight - panelHeight - VIEWPORT_GAP)
      : preferredTop

    setPosition({
      top: Math.min(preferredTop, maxTop),
    })
  }, [closePanel])

  useEvent('chat-settings-panel:toggle', () => {
    if (open) {
      closePanel()
      return
    }

    emitSync('theme-floating-panel:close', { source: 'manual' })
    emitSync('settings:close', {
      from: 'chat-settings-panel',
      reason: 'open-chat-settings',
    })
    setOpen(true)
  })

  useEvent('chat-settings-panel:close', () => {
    if (open) closePanel()
  })

  useEvent('chat-settings-panel:anchor-changed', () => {
    if (open) updatePosition()
  })

  useEvent('theme-floating-panel:open', () => {
    if (open) closePanel(false)
  })

  useEvent('settings:open', () => {
    if (open) closePanel(false)
  })

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.requestAnimationFrame(() => {
      updatePosition()
      panelRef.current?.focus()
    })
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        panelRef.current &&
        event.composedPath().includes(panelRef.current)
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) return
      if (
        target instanceof Element &&
        target.closest(CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR)
      ) {
        return
      }
      closePanel()
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [closePanel, open, updatePosition])

  if (!open) return null

  return (
    <Box
      ref={panelRef}
      role="dialog"
      aria-label={tt('chatSettings.title', 'Chat layout')}
      tabIndex={-1}
      position="fixed"
      right={{ base: 0, md: 4 }}
      top={position ? `${position.top}px` : '0'}
      width="320px"
      maxWidth={`calc(100vw - ${VIEWPORT_GAP * 2}px)`}
      visibility={position ? 'visible' : 'hidden'}
      pointerEvents="auto"
      zIndex={2}
      bg="gemSurface"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="lg"
      shadow="lg"
      px={3}
      py={3}
      outline="none"
      data-chat-settings-panel
    >
      <ChatLayoutSettings variant="compact" showHeading={false} />
    </Box>
  )
}
