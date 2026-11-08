import { Box, Button, Flex, IconButton, Popover, Text, chakra } from '@chakra-ui/react'
import { createRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { FiEdit2, FiMessageSquare, FiTrash2 } from 'react-icons/fi'

import { Provider } from '@/components/ui/provider-shadow-dom'
import { t } from '@/utils/i18n'
import type { CardCallbacks } from './cards'
import { effectiveComment, type SelectionItem } from './protocol'

const I18N = 'quickFollow.multiSelection'

type CompactHandle = { closePopover(): void }
type CompactProps = {
  items: readonly SelectionItem[]
  disabled: boolean
  callbacks: CardCallbacks
  onOpen: () => void
  ref?: Ref<CompactHandle>
}

function CompactDraftCards({ items, disabled, callbacks, onOpen, ref }: CompactProps) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const pendingFocusId = useRef<string | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const closePopover = useCallback(() => {
    clearTimer()
    const root = content.current?.getRootNode()
    const activeElement = root instanceof ShadowRoot ? root.activeElement : document.activeElement
    if (activeElement && content.current?.contains(activeElement)) trigger.current?.focus({ preventScroll: true })
    setOpen(false)
  }, [clearTimer])

  const openPopover = () => {
    clearTimer()
    if (disabled || !items.length) return
    onOpen()
    setOpen(true)
  }

  const enter = () => {
    clearTimer()
    if (!open) timer.current = setTimeout(openPopover, 100)
  }

  const leave = () => {
    clearTimer()
    const root = content.current?.getRootNode()
    const activeElement = root instanceof ShadowRoot ? root.activeElement : document.activeElement
    if (activeElement && content.current?.contains(activeElement)) return
    timer.current = setTimeout(closePopover, 150)
  }

  useImperativeHandle(ref, () => ({ closePopover }), [closePopover])
  useEffect(() => clearTimer, [clearTimer])
  useEffect(() => {
    if (disabled || !items.length) closePopover()
  }, [disabled, items.length, closePopover])

  useLayoutEffect(() => {
    if (!pendingFocusId.current) return
    const next = [...content.current?.querySelectorAll<HTMLButtonElement>('[data-selection-remove]') ?? []]
      .find(button => button.dataset.selectionRemove === pendingFocusId.current)
    next?.focus({ preventScroll: true })
    pendingFocusId.current = null
  }, [items])

  if (!items.length) return null

  return (
    <Popover.Root
      open={open && !disabled}
      onOpenChange={details => details.open ? openPopover() : closePopover()}
      autoFocus={false}
      restoreFocus={false}
      lazyMount
      unmountOnExit
      positioning={{ placement: 'top-start', strategy: 'fixed', gutter: 8, hideWhenDetached: true }}
    >
      <Popover.Trigger asChild>
        <Button
          ref={trigger}
          data-quick-follow-popover=""
          data-selection-count=""
          size="sm"
          variant="outline"
          borderRadius="xl"
          color="var(--gpk-follow-card-fg)"
          borderColor="var(--gpk-follow-card-border)"
          bg="var(--gpk-follow-card-bg)"
          _hover={{
            bg: 'var(--gpk-follow-card-hover)',
            borderColor: 'var(--gpk-follow-card-border-hover)',
          }}
          disabled={disabled}
          // React can skip pointerenter when the pointer arrives from a separate React root.
          onPointerOver={event => {
            const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
            if (event.pointerType !== 'touch' && !event.currentTarget.contains(related)) enter()
          }}
          onPointerOut={event => {
            const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
            if (!event.currentTarget.contains(related)) leave()
          }}
          onKeyDown={event => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            openPopover()
          }}
        >
          <FiMessageSquare />
          {t(`${I18N}.${items.length === 1 ? 'selectionCountOne' : 'selectionCountMany'}`, String(items.length))}
        </Button>
      </Popover.Trigger>
      <Popover.Positioner zIndex={2147483000}>
        <Popover.Content
          ref={content}
          data-quick-follow-popover=""
          data-selection-list=""
          aria-label={t(`${I18N}.selectedText`)}
          width="min(460px, calc(100vw - 24px))"
          maxHeight="min(400px, 50vh, var(--available-height, 50vh))"
          overflowY="auto"
          overscrollBehavior="contain"
          borderRadius="2xl"
          colorPalette="gray"
          bg="var(--gpk-follow-card-bg)"
          color="fg"
          borderColor="border.muted"
          boxShadow="lg"
          p={2}
          onPointerOver={clearTimer}
          onPointerOut={event => {
            const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
            if (!event.currentTarget.contains(related)) leave()
          }}
          css={{ scrollbarWidth: 'thin' }}
        >
          <Box as="ol" listStyleType="none" m={0} p={0}>
            {items.map((item, index) => {
              const comment = effectiveComment(item)
              return (
                <Flex
                  as="li"
                  key={item.id}
                  data-selection-id={item.id}
                  align="start"
                  gap={1.5}
                  p={2}
                  borderRadius="lg"
                  position="relative"
                  _notLast={{
                    _after: {
                      content: '""',
                      position: 'absolute',
                      insetInline: 2,
                      bottom: 0,
                      borderBottomWidth: '1px',
                      borderColor: 'var(--gpk-follow-card-border)',
                      pointerEvents: 'none',
                    },
                  }}
                  _hover={{ bg: 'var(--gpk-follow-card-hover)' }}
                >
                  <Text color="fg.muted" fontSize="xs">{index + 1}.</Text>
                  <chakra.button
                    type="button"
                    flex={1}
                    minWidth={0}
                    textAlign="left"
                    lineHeight="short"
                    borderRadius="sm"
                    cursor={item.anchor ? 'pointer' : 'default'}
                    disabled={disabled || !item.anchor}
                    onClick={() => {
                      closePopover()
                      callbacks.onJumpToSource(item.id)
                    }}
                    _focusVisible={{ outline: '2px solid', outlineColor: 'colorPalette.focusRing', outlineOffset: '2px' }}
                  >
                    <Text color="fg.muted" fontSize="xs">{t(`${I18N}.selectedText`)}</Text>
                    <Text color="fg" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">{item.selectedText}</Text>
                    {comment.trim() && (
                      <>
                        <Text color="fg.muted" fontSize="xs" mt={3}>{t(`${I18N}.userComment`)}</Text>
                        <Text color="fg" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">{comment}</Text>
                      </>
                    )}
                  </chakra.button>
                  <Flex gap={0} flexShrink={0}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      color="fg.muted"
                      _icon={{ boxSize: '3.5' }}
                      aria-label={t(`${I18N}.editComment`)}
                      disabled={disabled}
                      onClick={() => {
                        closePopover()
                        callbacks.onComment(item.id)
                      }}
                    ><FiEdit2 /></IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      color="fg.muted"
                      _icon={{ boxSize: '3.5' }}
                      aria-label={t(`${I18N}.removeSelection`)}
                      data-selection-remove={item.id}
                      disabled={disabled}
                      onClick={() => {
                        pendingFocusId.current = items[index + 1]?.id ?? items[index - 1]?.id ?? null
                        if (callbacks.onRemove(item.id) === false) pendingFocusId.current = null
                      }}
                    ><FiTrash2 /></IconButton>
                  </Flex>
                </Flex>
              )
            })}
          </Box>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

export function mountCompactDraftCards(
  inputEditor: HTMLElement,
  callbacks: CardCallbacks,
  onOpen: () => void,
): CompactHandle & { element: HTMLElement; render(items: readonly SelectionItem[]): void; setDisabled(disabled: boolean): void; destroy(): void } {
  const host = document.createElement('div')
  host.className = 'gpk-follow-draft-cards gpk-follow-compact-host'
  host.hidden = true
  inputEditor.insertAdjacentElement('beforebegin', host)
  const root = createRoot(host)
  const ref = createRef<CompactHandle>()
  let items: readonly SelectionItem[] = []
  let disabled = false

  const renderView = () => {
    host.hidden = !items.length
    root.render(
      <Provider host={{ style: { display: 'contents' } }}>
        <CompactDraftCards ref={ref} items={items} disabled={disabled} callbacks={callbacks} onOpen={onOpen} />
      </Provider>
    )
  }

  return {
    element: host,
    render(next) {
      items = next
      renderView()
    },
    setDisabled(next) {
      if (disabled === next) return
      disabled = next
      renderView()
    },
    closePopover() {
      ref.current?.closePopover()
    },
    destroy() {
      root.unmount()
      host.remove()
    },
  }
}
