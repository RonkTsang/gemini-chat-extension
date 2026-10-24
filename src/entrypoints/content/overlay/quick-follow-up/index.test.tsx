import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ChakraProvider } from '@chakra-ui/react'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { system } from '@/components/ui/system'
import QuickFollowUp from './index'

vi.mock('@/stores/quickFollowStore', () => ({
  quickFollowStore: {
    getState: () => ({ settings: { enabled: true }, hydrate: async () => undefined }),
    subscribe: () => () => undefined,
  },
  useQuickFollowStore: () => ({ prompts: [], settings: { enabled: true, orderedIds: [] } }),
}))
vi.mock('@/components/ui/toaster', () => ({ toaster: { create: vi.fn() } }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/utils/i18nCache', () => ({ i18nCache: { get: (key: string) => key, preCache: vi.fn() } }))
vi.mock('wxt/browser', () => ({ browser: { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } } }))
vi.mock('~/assets/quote.svg?react', () => ({ default: () => null }))
vi.mock('@/components/quick-follow/capsule-bar', async () => {
  const { createElement } = await import('react')
  return {
    CAPSULE_BAR_ACTION_BUTTON_WIDTH: 100, PROMPT_CONTAINER_MAX_WIDTH: 200,
    CapsuleBar: ({ onAsk }: { onAsk: () => void }) => createElement('button', { onClick: onAsk, 'data-test-ask': '' }, 'Ask'),
  }
})
vi.mock('./QuickComment', async () => {
  const { createElement } = await import('react')
  return {
    QuickComment: ({ onCancel, onAdd }: { onCancel: () => void; onAdd: () => void }) => createElement('div',
      { 'data-quick-follow-comment': '' },
      createElement('button', { onClick: onAdd, 'data-test-save': '' }, 'Save'),
      createElement('button', { onClick: onCancel, 'data-test-cancel': '' }, 'Cancel'),
    ),
  }
})

let root: Root
let container: HTMLDivElement
const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined

beforeEach(() => {
  previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true
  window.history.replaceState({}, '', '/app/conversation-1')
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'docs/dom/input.html'), 'utf8')
  document.querySelector('.send-button.stop')?.closest('.send-button-container')?.remove()
  const source = document.createElement('message-content')
  source.id = 'source'
  source.textContent = 'quoted source'
  document.querySelector('chat-window')!.append(source)
  const rect = new DOMRect(100, 150, 100, 20)
  vi.stubGlobal('CSS', Object.assign(Object.create(globalThis.CSS), { highlights: new Map() }))
  vi.stubGlobal('Highlight', class extends Set<Range> {
    constructor(...ranges: Range[]) { super(ranges) }
  })
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(Object.assign([rect], {
    item: (index: number) => index === 0 ? rect : null,
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(ChakraProvider, { value: system, children: createElement(QuickFollowUp) })))
})

afterEach(() => {
  act(() => root.unmount())
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('gives the comment overlay priority and restores the marker until its selection is removed', async () => {
  const source = document.getElementById('source')!
  const range = document.createRange()
  range.selectNodeContents(source)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  expect(window.getSelection()?.toString()).toBe('quoted source')
  await act(async () => { source.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 150 })) })
  act(() => container.querySelector<HTMLButtonElement>('[data-test-ask]')!.click())
  expect(container.querySelector('[data-quick-follow-comment]')).not.toBeNull()
  expect(document.querySelector('[data-quick-follow-marker]')).toBeNull()

  act(() => container.querySelector<HTMLButtonElement>('[data-test-save]')!.click())
  const marker = document.querySelector<HTMLButtonElement>('[data-quick-follow-marker]')!
  expect(marker.textContent).toBe('1')
  expect(marker.closest('chat-window')).toBe(document.querySelector('chat-window'))
  expect(marker.getRootNode()).toBe(document)
  expect(container.contains(marker)).toBe(false)
  expect(source.textContent).toBe('quoted source')
  act(() => marker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
  expect(CSS.highlights.has('gemini-power-kit-quote-highlight')).toBe(true)
  act(() => marker.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })))
  expect(CSS.highlights.has('gemini-power-kit-quote-highlight')).toBe(false)
  act(() => marker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
  act(() => marker.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
  act(() => marker.click())
  expect(container.querySelector('[data-quick-follow-comment]')).not.toBeNull()
  expect(document.querySelector('[data-quick-follow-marker]')).toBeNull()
  expect(CSS.highlights.has('gemini-power-kit-quote-highlight')).toBe(true)

  act(() => container.querySelector<HTMLButtonElement>('[data-test-cancel]')!.click())
  expect(CSS.highlights.has('gemini-power-kit-quote-highlight')).toBe(false)
  expect(document.querySelector('[data-quick-follow-marker]')?.textContent).toBe('1')
  act(() => document.querySelector<HTMLButtonElement>('.gpk-follow-card-action-remove')!.click())
  expect(document.querySelector('[data-quick-follow-marker]')).toBeNull()
})
