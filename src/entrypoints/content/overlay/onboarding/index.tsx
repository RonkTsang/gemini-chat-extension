import { Box, Button, HStack, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import { eventBus } from '@/utils/eventbus'
import { t } from '@/utils/i18n'
import { claimOnboarding, initializeOnboarding } from './storage'
import { ensureSidebarExpanded, isForegroundChat, resolveTarget, TOUR_TARGETS, waitForElement } from './dom'
import { FinishCard } from './FinishCard'
import { finishBackdrop, tourEnter } from './animations'

const COPY_KEYS = ['width', 'theme', 'bulkDelete', 'settings'] as const
interface Rect { left: number; top: number; width: number; height: number }

export function Onboarding({ onDismiss }: {
  onDismiss: () => void
}) {
  const [step, setStep] = useState(-1)
  const [foreground, setForeground] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [readyStep, setReadyStep] = useState(-1)
  const [cardTop, setCardTop] = useState(0)
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight })
  const cardRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const dismissed = useRef(false)
  const lastTarget = useRef<HTMLElement | null>(null)
  const finish = useCallback(() => {
    dismissed.current = true
    const target = lastTarget.current
    if (target?.isConnected) target.focus()
    onDismiss()
  }, [onDismiss])

  useEffect(() => {
    let disposed = false
    let checking = false
    let waiting = true
    let frame = 0
    let observer: MutationObserver | null = null
    const stopWaiting = () => {
      waiting = false
      observer?.disconnect()
      browser.storage.onChanged.removeListener(update)
    }
    const update = () => {
      if (!waiting && !started.current) return
      const active = isForegroundChat()
      setForeground(active)
      if (!active || checking || started.current) return
      checking = true
      void initializeOnboarding().then(async (state) => {
        if (disposed) return
        if (state !== 'pending') {
          stopWaiting()
          onDismiss()
          return
        }
        if (await claimOnboarding(() => !disposed && isForegroundChat())) {
          if (disposed) return
          started.current = true
          stopWaiting()
          setStep(0)
        }
      }).finally(() => { checking = false })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    browser.storage.onChanged.addListener(update)
    const unsubscribe = eventBus.on('urlchange', update)
    update()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      document.removeEventListener('visibilitychange', update)
      browser.storage.onChanged.removeListener(update)
      unsubscribe()
    }
  }, [onDismiss])

  useEffect(() => {
    if (step < 0 || !foreground) return
    if (step >= TOUR_TARGETS.length) {
      setRect(null)
      return
    }
    const controller = new AbortController()
    let frame = 0
    let observer: MutationObserver | null = null
    let resizeObserver: ResizeObserver | null = null
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setViewport(previous => previous.width === innerWidth && previous.height === innerHeight
          ? previous : { width: innerWidth, height: innerHeight })
        const target = resolveTarget(TOUR_TARGETS[step])
        if (!target) {
          setRect(null)
          setStep(step + 1)
          return
        }
        const bounds = target.getBoundingClientRect()
        lastTarget.current = target
        const next = { left: bounds.left - 6, top: bounds.top - 6, width: bounds.width + 12, height: bounds.height + 12 }
        setRect(previous => previous && previous.left === next.left && previous.top === next.top
          && previous.width === next.width && previous.height === next.height
          ? previous : next)
        setReadyStep(step)
      })
    }
    if (step >= 2) ensureSidebarExpanded()
    void waitForElement(() => resolveTarget(TOUR_TARGETS[step]), controller.signal).then(target => {
      if (controller.signal.aborted) return
      if (!target) {
        setRect(null)
        setStep(step + 1)
        return
      }
      refresh()
      observer = new MutationObserver(refresh)
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
      resizeObserver = new ResizeObserver(refresh)
      resizeObserver.observe(target)
      window.addEventListener('resize', refresh)
      window.addEventListener('scroll', refresh, true)
    })
    return () => {
      controller.abort()
      cancelAnimationFrame(frame)
      observer?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [step, foreground])

  useLayoutEffect(() => {
    if (!rect || !cardRef.current) return
    const height = cardRef.current.offsetHeight
    const below = rect.top + rect.height + 12
    const preferred = below + height <= viewport.height - 16 ? below : rect.top - height - 12
    setCardTop(Math.max(16, Math.min(preferred, viewport.height - height - 16)))
  }, [rect, readyStep, viewport])

  useEffect(() => {
    if (step < 0 || !foreground) return
    cardRef.current?.querySelector<HTMLButtonElement>('[data-tour-next]')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        finish()
      } else if (event.key === 'Tab' && layerRef.current) {
        const controls = Array.from(layerRef.current.querySelectorAll<HTMLElement>('button, a[href]'))
        const root = layerRef.current.getRootNode()
        const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement
        const index = controls.findIndex(control => control === active)
        if (controls.length && (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0))) {
          event.preventDefault()
          event.stopImmediatePropagation()
          controls[event.shiftKey ? controls.length - 1 : 0].focus()
        }
      }
    }
    const focusin = (event: FocusEvent) => {
      if (step < TOUR_TARGETS.length && !dismissed.current && layerRef.current
        && !event.composedPath().includes(layerRef.current)) {
        cardRef.current?.querySelector<HTMLButtonElement>('[data-tour-next]')?.focus()
      }
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('focusin', focusin, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('focusin', focusin, true)
    }
  }, [step, readyStep, foreground, finish])

  if (step < 0 || !foreground) return null
  if (step >= TOUR_TARGETS.length) {
    return (
      <Box ref={layerRef} position="fixed" inset={0}
        display="flex" alignItems="center" justifyContent="center" p={4}
        bg="blackAlpha.600" backdropFilter="blur(6px)" zIndex={10000} pointerEvents="auto"
        css={{
          animation: `${finishBackdrop} 160ms cubic-bezier(0.23, 1, 0.32, 1)`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}>
        <FinishCard onFinish={finish} />
      </Box>
    )
  }
  if (!rect || readyStep < 0) return null

  const key = COPY_KEYS[readyStep]
  const left = Math.max(16, Math.min(rect.left, viewport.width - 336))
  return (
    <Box ref={layerRef} position="fixed" inset={0} zIndex={10000} pointerEvents="auto">
      <Box aria-hidden="true" position="absolute" borderRadius="lg"
        left={`${rect.left}px`} top={`${rect.top}px`} width={`${rect.width}px`} height={`${rect.height}px`}
        boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.42)" border="2px solid" borderColor="gemPrimary"
        transition="left 200ms cubic-bezier(0.23, 1, 0.32, 1), top 200ms cubic-bezier(0.23, 1, 0.32, 1), width 200ms cubic-bezier(0.23, 1, 0.32, 1), height 200ms cubic-bezier(0.23, 1, 0.32, 1)"
        css={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      />
      <Box key={readyStep} ref={cardRef} role="dialog" aria-modal="true" aria-label={t(`onboarding.${key}.title`)}
        data-gpk-onboarding={key} position="absolute" left={`${left}px`} top={`${cardTop}px`}
        w="320px" maxW="calc(100vw - 32px)" maxH="calc(100dvh - 32px)" overflowY="auto"
        bg="gemSurface" color="gemOnSurface" borderWidth="1px" borderColor="border.muted" borderRadius="xl" shadow="lg" p={5}
        css={{
          animation: `${tourEnter} 180ms cubic-bezier(0.23, 1, 0.32, 1)`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Text fontSize="xs" color="gemOnSurfaceVariant" mb={2}>{t('onboarding.progress', [String(readyStep + 1), String(TOUR_TARGETS.length)])}</Text>
        <Text fontWeight="semibold" mb={2}>{t(`onboarding.${key}.title`)}</Text>
        <Text fontSize="sm" color="gemOnSurfaceVariant" lineHeight="1.6">{t(`onboarding.${key}.description`)}</Text>
        <HStack justify="space-between" mt={5}>
          <Button size="sm" variant="plain" color="gemOnSurfaceVariant" fontSize="xs" fontWeight="normal"
            _hover={{ color: 'gemOnSurface' }} onClick={finish}>{t('onboarding.skip')}</Button>
          <Button size="sm" data-tour-next disabled={readyStep !== step} onClick={() => setStep(step + 1)}>
            {t('onboarding.next')}
          </Button>
        </HStack>
      </Box>
    </Box>
  )
}
