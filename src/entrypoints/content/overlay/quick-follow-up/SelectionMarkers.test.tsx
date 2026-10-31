import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { findCurrentChatWindow, observeQuoteAnchorLayout, readQuoteAnchorEndPosition } from '../../quick-follow-up/dom'
import type { SelectionItem } from '../../quick-follow-up/protocol'
import { SelectionMarkers } from './SelectionMarkers'

vi.mock('@/utils/i18n', () => ({ t: (key: string, number?: string) => number ? `${key} ${number}` : key }))
vi.mock('../../quick-follow-up/dom', () => ({
  findCurrentChatWindow: vi.fn(), readQuoteAnchorEndPosition: vi.fn(), observeQuoteAnchorLayout: vi.fn(),
}))

const items: SelectionItem[] = ['a', 'b'].map(id => ({
  id, revision: 1, selectedText: `source ${id}`, comment: '',
  anchor: { quoteId: id, conversationId: 'chat', sourceMessageId: id,
    selectedText: `source ${id}`, startOffset: 0, endOffset: 8, prefix: '', suffix: '' },
}))
let root: Root
let container: HTMLDivElement
let chatWindow: HTMLElement
const cleanup = vi.fn()
const onEdit = vi.fn()
const onPreview = vi.fn()
const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined

beforeEach(() => {
  previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  chatWindow = document.createElement('chat-window')
  document.body.append(container, chatWindow)
  vi.mocked(findCurrentChatWindow).mockReturnValue(chatWindow)
  root = createRoot(container)
  vi.mocked(readQuoteAnchorEndPosition).mockReturnValue({ clientX: 100, clientY: 150 })
  vi.mocked(observeQuoteAnchorLayout).mockReturnValue(cleanup)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  chatWindow.remove()
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  vi.resetAllMocks()
})

function render(selections = items, disabled = false) {
  act(() => root.render(createElement(SelectionMarkers, { items: selections, disabled, onEdit, onPreview })))
}

it('opens the numbered source and updates numbering when a preceding selection is removed', () => {
  render()
  const buttons = [...chatWindow.querySelectorAll('button')]
  expect(container.childElementCount).toBe(0)
  expect(buttons[0].parentElement?.parentElement).toBe(chatWindow)
  expect(buttons[0].getRootNode()).toBe(document)
  expect(buttons.map(button => button.textContent)).toEqual(['1', '2'])
  act(() => buttons[1].click())
  expect(onEdit).toHaveBeenCalledWith('b')
  render([items[1]])
  expect(chatWindow.querySelectorAll('button')).toHaveLength(1)
  expect(chatWindow.querySelector('button')?.textContent).toBe('1')
  expect(chatWindow.querySelector('button')?.getAttribute('data-quick-follow-marker')).toBe('b')
})

it('removes portal elements on unmount and does not mount without a unique chat host', () => {
  render()
  expect(chatWindow.querySelectorAll('button')).toHaveLength(2)
  vi.mocked(findCurrentChatWindow).mockReturnValue(null)
  const update = vi.mocked(observeQuoteAnchorLayout).mock.calls[0][1]
  act(update)
  expect(chatWindow.querySelector('button')).toBeNull()
  vi.mocked(findCurrentChatWindow).mockReturnValue(chatWindow)
  act(update)
  expect(chatWindow.querySelectorAll('button')).toHaveLength(2)
  act(() => root.unmount())
  expect(chatWindow.childElementCount).toBe(0)
})

it('tracks scrolling, hides unavailable sources, and cleans up positioning on unmount', () => {
  render()
  const beforeTop = chatWindow.querySelector('button')!.parentElement!.style.top
  const update = vi.mocked(observeQuoteAnchorLayout).mock.calls[0][1]
  vi.mocked(readQuoteAnchorEndPosition).mockReturnValue({ clientX: 120, clientY: 220 })
  act(update)
  expect(chatWindow.querySelector('button')!.parentElement!.style.top).not.toBe(beforeTop)
  vi.mocked(readQuoteAnchorEndPosition).mockReturnValue(null)
  act(update)
  expect(chatWindow.querySelector('button')).toBeNull()
  act(() => root.unmount())
  expect(cleanup).toHaveBeenCalledOnce()
})

it('does not open a comment during an active submission', () => {
  render(items, true)
  act(() => chatWindow.querySelector('button')!.click())
  expect(onEdit).not.toHaveBeenCalled()
})

it('previews the hovered source and clears it on leave, source removal, or unmount', () => {
  render()
  const hover = () => act(() => chatWindow.querySelector('button')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
  hover()
  expect(onPreview).toHaveBeenLastCalledWith('a')
  act(() => chatWindow.querySelector('button')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })))
  expect(onPreview).toHaveBeenLastCalledWith(null)
  hover()
  render([items[1]])
  expect(onPreview).toHaveBeenLastCalledWith(null)
  hover()
  expect(onPreview).toHaveBeenLastCalledWith('b')
  act(() => root.unmount())
  expect(onPreview).toHaveBeenLastCalledWith(null)
})

it('clears a hover preview when submission starts and ignores disabled hover', () => {
  render()
  act(() => chatWindow.querySelector('button')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
  render(items, true)
  expect(onPreview).toHaveBeenLastCalledWith(null)
  onPreview.mockClear()
  act(() => chatWindow.querySelector('button')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
  expect(onPreview).not.toHaveBeenCalled()
})
