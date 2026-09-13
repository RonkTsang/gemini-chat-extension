import { Box, Button, type BoxProps, type ButtonProps } from '@chakra-ui/react'
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { isEventInsideElement } from './pointer-boundary'

const VIEWPORT_GUTTER = 8
const ANCHOR_GAP = 4
const MENU_MIN_WIDTH = 150
const MENU_MAX_WIDTH = 280
const MENU_BACKGROUND = 'var(--lumi-sys-color--surface-bright, #fff)'
const MENU_COLOR = 'var(--lumi-sys-color--on-surface, #1f1f1f)'
const MENU_HOVER_BACKGROUND = 'var(--lumi-sys-color-states--hover-on-surface, rgba(31, 31, 31, 0.08))'
const MENU_PRESSED_BACKGROUND = 'var(--lumi-sys-color-states--pressed-on-surface, rgba(31, 31, 31, 0.12))'
const MENU_SHADOW = '0 0 20px rgba(0, 0, 0, 0.04)'
const MENU_FONT_FAMILY = 'Google Sans Flex, Google Sans, Helvetica Neue, sans-serif'

export interface AnchoredRect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface AnchoredMenuPosition {
  left: number
  top: number
}

export type AnchoredGeminiMenuPlacement = 'bottom-start' | 'side'

export function calculateAnchoredMenuPosition(
  anchorRect: AnchoredRect,
  menuSize: { width: number, height: number },
  viewportSize: { width: number, height: number },
  placement: AnchoredGeminiMenuPlacement = 'side',
): AnchoredMenuPosition {
  const availableWidth = Math.max(0, viewportSize.width - VIEWPORT_GUTTER * 2)
  const width = Math.min(menuSize.width, availableWidth)
  const preferredLeft = placement === 'bottom-start'
    ? anchorRect.left
    : anchorRect.right + ANCHOR_GAP + width <= viewportSize.width - VIEWPORT_GUTTER
      ? anchorRect.right + ANCHOR_GAP
      : anchorRect.left - ANCHOR_GAP - width
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(preferredLeft, viewportSize.width - width - VIEWPORT_GUTTER),
  )
  const maxTop = Math.max(VIEWPORT_GUTTER, viewportSize.height - menuSize.height - VIEWPORT_GUTTER)
  const preferredTop = placement === 'bottom-start'
    ? anchorRect.bottom + menuSize.height <= viewportSize.height - VIEWPORT_GUTTER
      ? anchorRect.bottom
      : anchorRect.top - menuSize.height
    : anchorRect.top
  const top = Math.max(VIEWPORT_GUTTER, Math.min(preferredTop, maxTop))

  return { left, top }
}

export interface AnchoredGeminiMenuProps extends Omit<BoxProps, 'children' | 'onKeyDown' | 'onPointerDown' | 'position' | 'role'> {
  anchorElement?: Element
  anchorRect: AnchoredRect
  ariaLabel: string
  children: ReactNode
  initialFocus?: boolean
  maxHeight?: number
  onClose: () => void
  placement?: AnchoredGeminiMenuPlacement
  role?: 'dialog' | 'menu'
  width?: number
}

export function AnchoredGeminiMenu({
  anchorElement,
  anchorRect,
  ariaLabel,
  children,
  initialFocus = false,
  maxHeight,
  onClose,
  placement = 'side',
  role = 'menu',
  width,
  ...boxProps
}: AnchoredGeminiMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuSize, setMenuSize] = useState<{ width: number, height: number }>()

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const updateSize = () => {
      const rect = menu.getBoundingClientRect()
      setMenuSize((current) => (
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      ))
    }
    updateSize()
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(menu)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        !isEventInsideElement(event, menuRef.current)
        && !isEventInsideElement(event, anchorElement ?? null)
      ) {
        onClose()
      }
    }
    const closeOnViewportChange = () => onClose()
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePress, true)
    window.addEventListener('scroll', closeOnViewportChange, true)
    window.addEventListener('resize', closeOnViewportChange)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePress, true)
      window.removeEventListener('scroll', closeOnViewportChange, true)
      window.removeEventListener('resize', closeOnViewportChange)
    }
  }, [anchorElement, onClose])

  useEffect(() => {
    if (!initialFocus || !menuSize) return
    menuRef.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
      ?.focus()
  }, [initialFocus, menuSize])

  const position = useMemo(() => (
    menuSize
      ? calculateAnchoredMenuPosition(
          anchorRect,
          menuSize,
          { width: window.innerWidth, height: window.innerHeight },
          placement,
        )
      : { left: VIEWPORT_GUTTER, top: VIEWPORT_GUTTER }
  ), [anchorRect, menuSize, placement])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [],
    )
    if (!items.length) return
    event.preventDefault()
    const root = menuRef.current?.getRootNode()
    const activeElement = root && 'activeElement' in root
      ? root.activeElement
      : document.activeElement
    const currentIndex = items.indexOf(activeElement as HTMLElement)
    if (event.key === 'Home') return items[0].focus()
    if (event.key === 'End') return items.at(-1)?.focus()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : items.length - 1)
      : (currentIndex + direction + items.length) % items.length
    items[nextIndex].focus()
  }

  return (
    <Box
      ref={menuRef}
      data-gpk-anchored-gemini-menu
      role={role}
      aria-label={ariaLabel}
      position="fixed"
      left={`${position.left}px`}
      top={`${position.top}px`}
      visibility={menuSize ? 'visible' : 'hidden'}
      width={width ? `${width}px` : 'max-content'}
      minW={`${MENU_MIN_WIDTH}px`}
      maxW={`min(${MENU_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_GUTTER * 2}px))`}
      maxH={maxHeight ? `${maxHeight}px` : `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`}
      overflowY="auto"
      boxSizing="border-box"
      bg={MENU_BACKGROUND}
      color={MENU_COLOR}
      borderRadius="20px"
      boxShadow={MENU_SHADOW}
      p="8px"
      fontFamily={MENU_FONT_FAMILY}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      {...boxProps}
    >
      {children}
    </Box>
  )
}

export interface AnchoredGeminiMenuItemProps extends Omit<ButtonProps, 'children'> {
  children: ReactNode
  destructive?: boolean
  icon?: ReactNode
}

export function AnchoredGeminiMenuItem({
  children,
  destructive = false,
  icon,
  ...buttonProps
}: AnchoredGeminiMenuItemProps) {
  return (
    <Button
      role="menuitem"
      variant="ghost"
      minH="36px"
      h="36px"
      w="100%"
      px="8px"
      gap="8px"
      justifyContent="flex-start"
      borderRadius="12px"
      bg="transparent"
      color={destructive ? 'fg.error' : MENU_COLOR}
      fontFamily={MENU_FONT_FAMILY}
      fontSize="13px"
      fontWeight="400"
      lineHeight="17px"
      _hover={{ bg: MENU_HOVER_BACKGROUND }}
      _active={{ bg: MENU_PRESSED_BACKGROUND }}
      _focusVisible={{
        outline: `3px solid ${MENU_COLOR}`,
        outlineOffset: '2px',
      }}
      {...buttonProps}
    >
      {icon ? (
        <Box
          display="inline-flex"
          boxSize="24px"
          flexShrink={0}
          alignItems="center"
          justifyContent="center"
          css={{ '& svg': { width: '20px', height: '20px', strokeWidth: 1.5 } }}
          aria-hidden
        >
          {icon}
        </Box>
      ) : null}
      {children}
    </Button>
  )
}
