import { ChakraProvider } from '@chakra-ui/react'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { system } from '@/components/ui/system'
import { readQuoteAnchorPosition } from '../../quick-follow-up/dom'
import type { QuoteAnchor } from '../../quick-follow-up/protocol'

vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('../../quick-follow-up/dom', () => ({ readQuoteAnchorPosition: vi.fn() }))

import { getQuickCommentKeyboardAction, QuickComment } from './QuickComment'

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    isComposing: false,
    keyCode: 13,
    ...overrides,
  } as KeyboardEvent
}

describe('QuickComment keyboard shortcuts', () => {
  it('adds with Enter and sends only with the platform modifier', () => {
    expect(getQuickCommentKeyboardAction(key(), false)).toBe('add')
    expect(getQuickCommentKeyboardAction(key({ ctrlKey: true }), false)).toBe('send')
    expect(getQuickCommentKeyboardAction(key({ metaKey: true }), true)).toBe('send')
    expect(getQuickCommentKeyboardAction(key({ ctrlKey: true }), true)).toBe('add')
    expect(getQuickCommentKeyboardAction(key({ metaKey: true }), false)).toBe('add')
  })

  it('preserves Shift+Enter and IME composition', () => {
    expect(getQuickCommentKeyboardAction(key({ shiftKey: true }), false)).toBe('none')
    expect(getQuickCommentKeyboardAction(key({ isComposing: true }), false)).toBe('none')
    expect(getQuickCommentKeyboardAction(key({ keyCode: 229 }), false)).toBe('none')
    expect(getQuickCommentKeyboardAction(key({ key: 'a' }), false)).toBe('none')
  })
})

const sourceAnchor: QuoteAnchor = {
  quoteId: 'quote', conversationId: 'chat', sourceMessageId: 'source', selectedText: 'quoted source',
  startOffset: 0, endOffset: 13, prefix: '', suffix: '',
}

describe('QuickComment editing', () => {
  let root: Root
  let container: HTMLDivElement
  let previousActEnvironment: boolean | undefined
  const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

  beforeEach(() => {
    previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(readQuoteAnchorPosition).mockReturnValue({ clientX: 200, clientY: 240 })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    if (previousActEnvironment === undefined) delete reactGlobal.IS_REACT_ACT_ENVIRONMENT
    else reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    vi.restoreAllMocks()
  })

  function renderEditor() {
    const callbacks = { onAdd: vi.fn(), onSend: vi.fn(), onChange: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn() }
    act(() => root.render(createElement(ChakraProvider, { value: system,
      children: createElement(QuickComment, {
        selectionText: 'quoted source', value: 'existing comment',
        position: { clientX: 200, clientY: 240 }, sourceAnchor, ...callbacks,
      })
    })))
    return callbacks
  }

  it('reuses the input with Cancel and Save, and saves rather than sends on Enter shortcuts', () => {
    const callbacks = renderEditor()
    const textarea = container.querySelector('textarea')!
    expect(textarea.value).toBe('existing comment')
    expect(document.activeElement).toBe(textarea)
    const buttons = [...container.querySelectorAll('button')]
    const cancel = buttons.find(button => button.textContent === 'common.cancel')!
    const save = buttons.find(button => button.textContent === 'settings.quickFollow.editModal.save')!
    expect(cancel).toBeDefined()
    expect(save).toBeDefined()
    act(() => cancel.click())
    expect(callbacks.onCancel).toHaveBeenCalledOnce()
    act(() => save.click())
    expect(callbacks.onAdd).toHaveBeenCalledOnce()
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true, bubbles: true }))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    })
    expect(callbacks.onAdd).toHaveBeenCalledTimes(3)
    expect(callbacks.onSend).not.toHaveBeenCalled()
  })

  it('tracks the source while scrolling and removes listeners on unmount', () => {
    const callbacks = renderEditor()
    const panel = container.querySelector<HTMLElement>('[data-quick-follow-comment]')!
    const beforeTop = panel.style.top
    vi.mocked(readQuoteAnchorPosition).mockReturnValue({ clientX: 220, clientY: 280 })
    act(() => document.dispatchEvent(new Event('scroll')))
    expect(panel.style.top).not.toBe(beforeTop)
    vi.mocked(readQuoteAnchorPosition).mockReturnValue(null)
    act(() => document.dispatchEvent(new Event('scroll')))
    expect(callbacks.onCancel).toHaveBeenCalledOnce()
    act(() => root.unmount())
    vi.mocked(readQuoteAnchorPosition).mockClear()
    document.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(readQuoteAnchorPosition).not.toHaveBeenCalled()
  })

  it('attaches below the end of a multiline selection when there is no room above', () => {
    vi.mocked(readQuoteAnchorPosition).mockReturnValue({ clientX: 300, clientY: 40, bottom: 180 })
    renderEditor()
    const panel = container.querySelector<HTMLElement>('[data-quick-follow-comment]')!
    expect(panel.style.left).toBe('120px')
    expect(panel.style.top).toBe('198px')
    expect(panel.style.transform).toBe('')

    vi.mocked(readQuoteAnchorPosition).mockReturnValue({ clientX: 300, clientY: 40, bottom: 220 })
    act(() => document.dispatchEvent(new Event('scroll')))
    expect(panel.style.top).toBe('238px')
  })

  it('uses the space above a selection when the editor fits without scrolling', () => {
    vi.mocked(readQuoteAnchorPosition).mockReturnValue({ clientX: 300, clientY: 130, bottom: 200 })
    renderEditor()
    const panel = container.querySelector<HTMLElement>('[data-quick-follow-comment]')!
    expect(panel.style.top).toBe('116px')
    expect(panel.style.transform).toBe('translateY(-100%)')
  })

})
