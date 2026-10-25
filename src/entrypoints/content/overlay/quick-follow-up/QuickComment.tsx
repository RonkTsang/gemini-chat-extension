import { Box, Button, Icon, Textarea } from '@chakra-ui/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FiTrash2 } from 'react-icons/fi'

import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/utils/i18n'
import { readQuoteAnchorPosition, type QuoteCommentPosition } from '../../quick-follow-up/dom'
import type { QuoteAnchor } from '../../quick-follow-up/protocol'

export interface QuickCommentProps {
  selectionText: string
  value: string
  position: { clientX: number; clientY: number }
  sourceAnchor?: QuoteAnchor
  onCancel: () => void
  onDelete: () => void
  onChange: (value: string) => void
  onAdd: () => void
  onSend: () => void
}

const I18N = 'quickFollow.multiSelection'
const WIDTH = 280
const MARGIN = 12
const PADDING_START = 16
const PADDING_END = 12
const SINGLE_LINE_PADDING_BLOCK = 8
const MULTILINE_PADDING_BLOCK = 12
const LINE_HEIGHT = 20
const BUTTON_SIZE = 28
const BUTTON_GAP = 10
const BUTTON_BACKGROUND = 'var(--theme-500, var(--mat-icon-button-icon-color, var(--chakra-colors-gray-800)))'
const RESIZE_TRANSITION = '180ms cubic-bezier(0.22, 1, 0.36, 1)'

export function QuickComment({ selectionText, value, position, sourceAnchor, onCancel, onDelete, onChange, onAdd, onSend }: QuickCommentProps) {
  const editing = Boolean(sourceAnchor)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [layout, setLayout] = useState({ multiline: false, textHeight: LINE_HEIGHT, capped: false })
  const [sendModifierPressed, setSendModifierPressed] = useState(false)
  const [anchorPosition, setAnchorPosition] = useState<QuoteCommentPosition>(position)
  const maxWidth = editing ? 360 : WIDTH
  const width = Math.min(maxWidth, viewport.width - MARGIN * 2)
  const anchorBottom = anchorPosition.bottom ?? anchorPosition.clientY
  const spaceAbove = anchorPosition.clientY - 14 - MARGIN
  const spaceBelow = viewport.height - anchorBottom - 18 - MARGIN
  // Choose an edge using the minimum editor size, then cap growth on that side.
  const preferredHeight = editing
    ? LINE_HEIGHT + BUTTON_GAP + BUTTON_SIZE + MULTILINE_PADDING_BLOCK * 2 + 2
    : BUTTON_SIZE + SINGLE_LINE_PADDING_BLOCK * 2 + 2
  const above = spaceAbove >= preferredHeight || spaceAbove >= spaceBelow
  const paddingBlock = layout.multiline ? MULTILINE_PADDING_BLOCK : SINGLE_LINE_PADDING_BLOCK
  const minHeight = BUTTON_SIZE + paddingBlock * 2 + 2
  const availableHeight = Math.max(minHeight, Math.min(viewport.height * 0.58, above ? spaceAbove : spaceBelow))
  const bodyHeight = layout.multiline ? layout.textHeight + BUTTON_GAP + BUTTON_SIZE : BUTTON_SIZE
  const placement = {
    left: Math.max(MARGIN, Math.min(anchorPosition.clientX - width / 2, viewport.width - width - MARGIN)),
    top: above ? Math.max(MARGIN + minHeight, anchorPosition.clientY - 14) : Math.max(MARGIN, anchorBottom + 18),
    width,
    transform: above ? 'translateY(-100%)' : undefined,
  }

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => setSendModifierPressed(isSendModifierActive(event, isMac()))
    const onWindowBlur = () => setSendModifierPressed(false)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [])

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!sourceAnchor) return
      const nextPosition = readQuoteAnchorPosition(sourceAnchor)
      if (!nextPosition) {
        onCancel()
        return
      }
      setAnchorPosition(previous => previous.clientX === nextPosition.clientX && previous.clientY === nextPosition.clientY
        && previous.bottom === nextPosition.bottom
        ? previous : nextPosition)
    }
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      updatePosition()
    }
    updatePosition()
    window.addEventListener('resize', onResize)
    if (sourceAnchor) document.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [sourceAnchor, onCancel])

  useLayoutEffect(() => {
    const measure = measureRef.current
    const textarea = textareaRef.current
    if (!measure || !textarea) return
    const contentWidth = width - PADDING_START - PADDING_END - 2
    measure.style.width = `${contentWidth - BUTTON_SIZE - BUTTON_GAP}px`
    const multiline = editing || measure.scrollHeight > LINE_HEIGHT
    if (multiline) measure.style.width = `${contentWidth}px`
    const naturalHeight = Math.max(LINE_HEIGHT, measure.scrollHeight)
    const maxTextHeight = Math.max(LINE_HEIGHT, availableHeight - paddingBlock * 2 - 2 - BUTTON_GAP - BUTTON_SIZE)
    const textHeight = Math.min(naturalHeight, maxTextHeight)
    const capped = naturalHeight > maxTextHeight
    setLayout(previous => previous.multiline === multiline && previous.textHeight === textHeight && previous.capped === capped
      ? previous : { multiline, textHeight, capped })
    // Measure offscreen, leaving the live textarea fully laid out inside the animated viewport.
    // Resetting its height to one line would scroll the caret first and make the text jump.
    if (!capped) textarea.scrollTop = 0
  }, [value, width, availableHeight, paddingBlock, editing])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(value.length, value.length)
  }, [sourceAnchor])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setSendModifierPressed(isSendModifierActive(event.nativeEvent, isMac()))
    const action = getQuickCommentKeyboardAction(event.nativeEvent, isMac())
    if (action === 'none') return
    event.preventDefault()
    if (action === 'send' && !editing) onSend()
    else onAdd()
  }

  return (
    <Box
      className="gpk-quick-follow-comment"
      data-quick-follow-comment=""
      role={editing ? 'dialog' : undefined}
      aria-label={editing ? t(`${I18N}.editComment`) : undefined}
      data-editing={editing ? '' : undefined}
      data-multiline={layout.multiline ? '' : undefined}
      position="fixed"
      zIndex={2147483001}
      style={placement}
      maxW={`${maxWidth}px`}
      bg="tocBg"
      color="tocText"
      border="1px solid"
      borderColor="tocHoverBg"
      borderRadius={layout.multiline ? "18px" : "24px"}
      boxShadow="0 6px 24px rgba(0,0,0,.16), 0 1px 4px rgba(0,0,0,.06)"
      overflow="hidden"
      paddingInlineStart={`${PADDING_START}px`}
      paddingInlineEnd={`${PADDING_END}px`}
      paddingBlock={`${paddingBlock}px`}
    >
      <Box id="quick-follow-comment-context" position="absolute" width="1px" height="1px" margin="-1px" padding={0} border={0} overflow="hidden" clip="rect(0, 0, 0, 0)" whiteSpace="nowrap">{selectionText}</Box>
      <Box
        ref={measureRef}
        aria-hidden="true"
        position="absolute"
        visibility="hidden"
        pointerEvents="none"
        height="auto"
        fontFamily="inherit"
        fontSize="14px"
        fontWeight="400"
        lineHeight={`${LINE_HEIGHT}px`}
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >{value + '\u200b'}</Box>
      <Box
        position="relative"
        height={`${bodyHeight}px`}
        transition={`height ${RESIZE_TRANSITION}`}
        _motionReduce={{ transition: 'none' }}
      >
        <Box
          overflow="hidden"
          height={`${layout.multiline ? layout.textHeight : BUTTON_SIZE}px`}
          width={layout.multiline ? '100%' : `calc(100% - ${BUTTON_SIZE + BUTTON_GAP}px)`}
          transition={`height ${RESIZE_TRANSITION}`}
          _motionReduce={{ transition: 'none' }}
        >
          <Textarea
            ref={textareaRef}
            aria-label={t(`${I18N}.commentPlaceholder`)}
            aria-describedby="quick-follow-comment-context"
            placeholder={t(`${I18N}.commentPlaceholder`)}
            value={value}
            onChange={event => onChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            display="block"
            width="100%"
            height={`${layout.textHeight}px`}
            minH="0"
            resize="none"
            overflowY={layout.capped ? 'auto' : 'hidden'}
            border="0"
            borderRadius="0"
            outline="0"
            boxShadow="none"
            _focus={{ boxShadow: 'none' }}
            fontFamily="inherit"
            fontSize="14px"
            fontWeight="400"
            lineHeight={`${LINE_HEIGHT}px`}
            overflowWrap="anywhere"
            p={0}
            transform={layout.multiline ? 'translateY(0)' : `translateY(${(BUTTON_SIZE - LINE_HEIGHT) / 2}px)`}
            transition={`transform ${RESIZE_TRANSITION}`}
            _motionReduce={{ transition: 'none' }}
          />
        </Box>
        <Box
          position="absolute"
          left={editing ? 0 : undefined}
          right={0}
          bottom={0}
          width={editing ? '100%' : undefined}
          height={`${BUTTON_SIZE}px`}
        >
          {editing ? (
            <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
              <Button
                type="button"
                unstyled
                aria-label={t(`${I18N}.removeSelection`)}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                width={`${BUTTON_SIZE}px`}
                height={`${BUTTON_SIZE}px`}
                borderRadius="full"
                bg="transparent"
                color="tocText"
                cursor="pointer"
                _hover={{ bg: 'tocHoverBg' }}
                focusVisibleRing="outside"
                onClick={onDelete}
              >
                <Icon as={FiTrash2} boxSize={4} aria-hidden="true" />
              </Button>
              <Box display="flex" gap="8px">
                <Button
                  type="button"
                  unstyled
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  height={`${BUTTON_SIZE}px`}
                  px="12px"
                  border="1px solid"
                  borderColor="tocHoverBg"
                  borderRadius="full"
                  bg="transparent"
                  color="inherit"
                  fontSize="14px"
                  cursor="pointer"
                  _hover={{ bg: 'tocHoverBg' }}
                  focusVisibleRing="outside"
                  onClick={onCancel}
                >{t('common.cancel')}</Button>
                <Button
                  type="button"
                  unstyled
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  height={`${BUTTON_SIZE}px`}
                  px="12px"
                  borderRadius="full"
                  bg="tocText"
                  color="tocBg"
                  fontSize="14px"
                  cursor="pointer"
                  _hover={{ filter: 'brightness(0.94)' }}
                  focusVisibleRing="outside"
                  onClick={onAdd}
                >{t('settings.quickFollow.editModal.save')}</Button>
              </Box>
            </Box>
          ) : (
            <Tooltip
              content={
                <Box
                  display="grid"
                  gap="2px"
                  minWidth="100px"
                  padding="4px 6px"
                  borderRadius="16px"
                  bg="#1b1d1f"
                  color="white"
                  boxShadow="0 4px 16px rgba(0,0,0,.28)"
                  fontSize="13px"
                  lineHeight="16px"
                  whiteSpace="nowrap"
                >
                  <KeyboardShortcut label={t(`${I18N}.add`)} keys="↵" />
                  <KeyboardShortcut label={t(`${I18N}.send`)} keys={`${isMac() ? '⌘' : 'Ctrl'}↵`} />
                </Box>
              }
              openDelay={100}
              positioning={{ placement: 'top', flip: ['bottom'] }}
              contentProps={{
                zIndex: 2147483002,
                padding: 0,
                borderRadius: '16px',
                bg: 'transparent',
                boxShadow: 'none',
              }}
            >
              <Button
                type="button"
                aria-label={t(`${I18N}.${sendModifierPressed ? 'send' : 'add'}`)}
                variant="solid"
                width={`${BUTTON_SIZE}px`}
                height={`${BUTTON_SIZE}px`}
                minWidth={`${BUTTON_SIZE}px`}
                padding={0}
                colorPalette="gray"
                bg={BUTTON_BACKGROUND}
                color="white"
                borderRadius="full"
                transition="background-color 150ms ease, transform 150ms ease"
                _hover={{ bg: BUTTON_BACKGROUND, filter: 'brightness(0.94)' }}
                _active={{ transform: 'scale(0.96)' }}
                _motionReduce={{ transition: 'none', transform: 'none' }}
                onClick={sendModifierPressed ? onSend : onAdd}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {sendModifierPressed
                    ? <path d="M12 19V5m-7 7 7-7 7 7" />
                    : <path d="m5 12 4 4L19 6" />}
                </svg>
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

function isSendModifierActive(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>, applePlatform: boolean): boolean {
  return applePlatform ? event.metaKey : event.ctrlKey
}

function KeyboardShortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" gap="12px" px="6px">
      <Box as="span">{label}</Box>
      <Box
        as="kbd"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        minWidth="32px"
        height="18px"
        paddingInline="6px"
        borderRadius="full"
        bg="rgba(255,255,255,.12)"
        color="white"
        fontFamily="inherit"
        fontSize="13px"
        fontWeight="500"
        lineHeight="1"
      >{keys}</Box>
    </Box>
  )
}

export function getQuickCommentKeyboardAction(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'isComposing' | 'keyCode'>,
  applePlatform: boolean
): 'add' | 'send' | 'none' {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter' || event.shiftKey) return 'none'
  if ((applePlatform && event.metaKey) || (!applePlatform && event.ctrlKey)) return 'send'
  return 'add'
}

