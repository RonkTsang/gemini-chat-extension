import { Box, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { useColorModeValue } from '@/components/ui/color-mode'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/utils/i18n'

export interface PlaceholderChipEditorProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  error?: boolean
  /** Whether the chip can be deleted. Defaults to false. */
  chipDeletable?: boolean
}

const CHIP_DATA_ATTR = 'data-placeholder-chip'

/**
 * A contenteditable-based editor that renders {{SELECT_TEXT}} as a visual chip.
 * The chip is not editable and by default cannot be deleted (controlled via `chipDeletable` prop).
 */
export function PlaceholderChipEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  chipDeletable = false
}: PlaceholderChipEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const isInternalUpdate = useRef(false)

  const chipBg = useColorModeValue('blue.500', 'blue.400')
  const chipColor = useColorModeValue('white', 'white')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  const focusBorderColor = error ? 'red.500' : 'blue.500'
  const errorBorderColor = 'red.400'
  const placeholderColor = useColorModeValue('gray.400', 'gray.500')

  const chipLabel = t('settings.quickFollow.chip.label') ?? 'Selected Text'
  const chipTooltip =
    t('settings.quickFollow.chip.tooltip') ??
    'This is the text you selected in Gemini'

  // Convert template string to HTML with chip elements
  const templateToHtml = useCallback(
    (template: string): string => {
      const parts = template.split(QUICK_FOLLOW_PLACEHOLDER)
      const htmlParts = parts.map((part, index) => {
        // Escape HTML entities and convert newlines to <br>
        const escaped = part
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')

        if (index < parts.length - 1) {
          // Add chip after this part (except for the last part)
          return `${escaped}<span ${CHIP_DATA_ATTR}="true" contenteditable="false" style="display: inline-block; background: var(--chakra-colors-bg-emphasized); color: var(--chakra-colors-fg); padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; user-select: none; cursor: default; margin: 0 2px; vertical-align: baseline;">${chipLabel}</span>`
        }
        return escaped
      })
      return htmlParts.join('')
    },
    [chipLabel]
  )

  // Convert HTML content back to template string
  const htmlToTemplate = useCallback((container: HTMLElement): string => {
    let result = ''
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            // Ignore text inside chip elements to avoid adding the chip label (e.g. "Selected Text")
            const parentElement = (node.parentElement || undefined) as HTMLElement | undefined
            if (parentElement?.hasAttribute(CHIP_DATA_ATTR)) {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            // Accept chip elements and BR elements
            if (el.hasAttribute(CHIP_DATA_ATTR) || el.tagName === 'BR') {
              return NodeFilter.FILTER_ACCEPT
            }
            // Skip into other elements to process their children
            return NodeFilter.FILTER_SKIP
          }
          return NodeFilter.FILTER_SKIP
        }
      }
    )

    let currentNode = walker.nextNode()
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        result += currentNode.textContent || ''
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode as HTMLElement
        if (el.hasAttribute(CHIP_DATA_ATTR)) {
          result += QUICK_FOLLOW_PLACEHOLDER
        } else if (el.tagName === 'BR') {
          result += '\n'
        }
      }
      currentNode = walker.nextNode()
    }

    return result
  }, [])

  // Save and restore cursor position
  const saveCursorPosition = useCallback((): { node: Node | null; offset: number } | null => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    return {
      node: range.startContainer,
      offset: range.startOffset
    }
  }, [])

  const restoreCursorPosition = useCallback(
    (saved: { node: Node | null; offset: number } | null) => {
      if (!saved || !saved.node || !editorRef.current) return

      // Check if the saved node is still in the document
      if (!editorRef.current.contains(saved.node)) return

      try {
        const selection = window.getSelection()
        if (!selection) return

        const range = document.createRange()
        range.setStart(saved.node, Math.min(saved.offset, saved.node.textContent?.length || 0))
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } catch {
        // Ignore cursor restoration errors
      }
    },
    []
  )

  // Initialize editor content
  useEffect(() => {
    if (!editorRef.current || isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }

    // Only update if the parsed value differs from current value
    const currentTemplate = htmlToTemplate(editorRef.current)
    if (currentTemplate !== value) {
      const savedCursor = saveCursorPosition()
      editorRef.current.innerHTML = templateToHtml(value)
      // Only restore cursor if editor is focused
      if (isFocused) {
        restoreCursorPosition(savedCursor)
      }
    }
  }, [value, templateToHtml, htmlToTemplate, saveCursorPosition, restoreCursorPosition, isFocused])

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return

    const newTemplate = htmlToTemplate(editorRef.current)

    // If chip is not deletable, check if chip was accidentally removed
    if (!chipDeletable) {
      const originalChipCount = (value.match(new RegExp(QUICK_FOLLOW_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'g')) || []).length
      const newChipCount = (newTemplate.match(new RegExp(QUICK_FOLLOW_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'g')) || []).length

      if (newChipCount < originalChipCount) {
        // Chip was removed - restore previous content
        editorRef.current.innerHTML = templateToHtml(value)
        return
      }
    }

    isInternalUpdate.current = true
    onChange(newTemplate)
  }, [htmlToTemplate, onChange, chipDeletable, value, templateToHtml])

  // Get selection scoped to shadow root (if any) to avoid window-level selection pointing to host
  const getScopedSelection = useCallback((): Selection | null => {
    const rootNode = editorRef.current?.getRootNode?.()
    const shadowRoot = rootNode as ShadowRoot & { getSelection?: () => Selection | null }
    if (shadowRoot && typeof shadowRoot.getSelection === 'function') {
      const shadowSelection = shadowRoot.getSelection()
      if (shadowSelection) return shadowSelection
    }
    return window.getSelection()
  }, [])

  // Check if the current selection contains a chip
  const selectionContainsChip = useCallback((): boolean => {
    if (!editorRef.current) return false

    const selection = getScopedSelection()
    if (!selection || selection.rangeCount === 0) return false

    const range = selection.getRangeAt(0)

    // If selection is collapsed (just a cursor), check adjacent nodes
    if (range.collapsed) {
      return false
    }

    // Check if selection spans a chip
    const fragment = range.cloneContents()
    const chips = fragment.querySelectorAll(`[${CHIP_DATA_ATTR}]`)
    return chips.length > 0
  }, [getScopedSelection])

  const getSelectionRange = useCallback((): Range | null => {
    const selection = getScopedSelection()
    if (!selection || selection.rangeCount === 0) return null
    return selection.getRangeAt(0)
  }, [getScopedSelection])

  const getAdjacentChip = useCallback(
    (direction: 'before' | 'after'): HTMLElement | null => {
      if (!editorRef.current) return null
      const range = getSelectionRange()
      if (!range) return null

      const { startContainer, startOffset } = range

      // If cursor already sits inside the chip element
      if ((startContainer as HTMLElement)?.hasAttribute?.(CHIP_DATA_ATTR)) {
        return startContainer as HTMLElement
      }

      const probeSibling = (node: Node | null) =>
        node && (node as HTMLElement).hasAttribute?.(CHIP_DATA_ATTR)
          ? (node as HTMLElement)
          : null

      if (startContainer.nodeType === Node.TEXT_NODE) {
        const text = startContainer as Text
        const textLength = text.textContent?.length ?? 0
        if (direction === 'before' && startOffset === 0) {
          return probeSibling(text.previousSibling)
        }
        if (direction === 'after' && startOffset === textLength) {
          return probeSibling(text.nextSibling)
        }
      } else if (startContainer.nodeType === Node.ELEMENT_NODE) {
        const el = startContainer as HTMLElement
        const targetIndex = direction === 'before' ? startOffset - 1 : startOffset
        const sibling = el.childNodes[targetIndex] as HTMLElement | undefined
        if (sibling && probeSibling(sibling)) {
          return sibling
        }
      }

      return null
    },
    [getSelectionRange]
  )

  const moveCursorToChipBoundary = useCallback(
    (chip: HTMLElement, side: 'before' | 'after') => {
      const selection = getScopedSelection()
      if (!selection) return

      const range = document.createRange()
      if (side === 'before') {
        range.setStartBefore(chip)
      } else {
        range.setStartAfter(chip)
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    },
    [getScopedSelection]
  )

  // Prevent chip deletion (when chipDeletable is false)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (chipDeletable) return

      if (selectionContainsChip()) {
        const isNavigationKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
        const isCopy = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c'
        const isModifierOnly = ['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)
        const isEscape = e.key === 'Escape'
        const isTab = e.key === 'Tab'

        if (!isNavigationKey && !isCopy && !isModifierOnly && !isEscape && !isTab) {
          e.preventDefault()
          return
        }
      }

      if (e.key === 'Backspace') {
        const chip = getAdjacentChip('before')
        if (chip) {
          e.preventDefault()
          moveCursorToChipBoundary(chip, 'before')
          return
        }
      }

      if (e.key === 'Delete') {
        const chip = getAdjacentChip('after')
        if (chip) {
          e.preventDefault()
          moveCursorToChipBoundary(chip, 'after')
          return
        }
      }
    },
    [chipDeletable, selectionContainsChip, getAdjacentChip, moveCursorToChipBoundary]
  )

  // Prevent cut operation if selection contains chip
  const handleCut = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (chipDeletable) return

    if (selectionContainsChip()) {
      e.preventDefault()
    }
  }, [chipDeletable, selectionContainsChip])

  // Handle beforeinput to catch more deletion scenarios
  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (chipDeletable) return

    const inputEvent = e.nativeEvent as InputEvent
    const inputType = inputEvent?.inputType

    // Early return if inputType is not available
    if (!inputType) return

    // Check for deletion-related input types
    const deletionTypes = [
      'deleteContentBackward',
      'deleteContentForward',
      'deleteByCut',
      'deleteByDrag',
      'deleteWordBackward',
      'deleteWordForward',
      'deleteSoftLineBackward',
      'deleteSoftLineForward',
      'deleteHardLineBackward',
      'deleteHardLineForward'
    ]

    if (deletionTypes.includes(inputType)) {
      if (selectionContainsChip()) {
        e.preventDefault()
        return
      }

      if (inputType === 'deleteContentBackward') {
        const chip = getAdjacentChip('before')
        if (chip) {
          e.preventDefault()
          moveCursorToChipBoundary(chip, 'before')
          return
        }
      }
      if (inputType === 'deleteContentForward') {
        const chip = getAdjacentChip('after')
        if (chip) {
          e.preventDefault()
          moveCursorToChipBoundary(chip, 'after')
          return
        }
      }
    }

    // Block insertions that would replace a selection containing chip
    if (inputType.startsWith('insert') && selectionContainsChip()) {
      e.preventDefault()
      return
    }
  }, [chipDeletable, selectionContainsChip, getAdjacentChip, moveCursorToChipBoundary])

  // Handle paste - strip formatting
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      const selection = getScopedSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      if (!selection || !range) return

      range.deleteContents()
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStart(node, node.textContent?.length ?? text.length)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      handleInput()
    },
    [getScopedSelection, handleInput]
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    onBlur?.()
  }, [onBlur])

  return (
    <Box position="relative">
      <Box
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCut={handleCut}
        onBeforeInput={handleBeforeInput}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        minH="80px"
        p={3}
        border="1px solid"
        borderColor={error ? errorBorderColor : isFocused ? focusBorderColor : borderColor}
        borderRadius="md"
        outline="none"
        lineHeight="1.6"
        fontSize="sm"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        transition="border-color 0.2s"
        _focus={{
          borderColor: focusBorderColor,
          boxShadow: error ? '0 0 0 1px var(--chakra-colors-red-500)' : '0 0 0 1px var(--chakra-colors-blue-500)'
        }}
        css={{
          '&:empty::before': {
            content: `"${placeholder || ''}"`,
            color: 'var(--chakra-colors-gray-400)',
            pointerEvents: 'none'
          }
        }}
        cursor={'text'}
      />
      {/* Tooltip for chips - rendered via CSS hover on the chip elements */}
      <style>{`
        [${CHIP_DATA_ATTR}]:hover::after {
          content: "${chipTooltip}";
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: var(--chakra-colors-gray-700);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 1000;
          margin-bottom: 4px;
        }
        [${CHIP_DATA_ATTR}] {
          position: relative;
        }
      `}</style>
    </Box>
  )
}

