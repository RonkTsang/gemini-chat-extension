import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeActiveFollowUpPopovers, mountDraftCards } from './cards'
import type { SelectionItem } from './protocol'

vi.mock('@/utils/i18n', () => ({
  t: (key: string, count?: string) => key.endsWith('selectionCountOne') ? `${count} Selection`
    : key.endsWith('selectionCountMany') ? `${count} Selections` : key,
}))

const callbacks = { onComment: vi.fn(), onJumpToSource: vi.fn(), onRemove: vi.fn() }
let view: ReturnType<typeof mountDraftCards>
let editor: HTMLElement
const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined

function item(id: string, comment = ''): SelectionItem {
  return {
    id, revision: 1, selectedText: `source ${id}\nsecond line`, comment,
    anchor: {
      quoteId: id, conversationId: 'chat', sourceMessageId: 'source', selectedText: `source ${id}`,
      startOffset: 0, endOffset: 8, prefix: '', suffix: '',
    },
  }
}

function shadow(): ShadowRoot {
  return document.querySelector('.gpk-follow-compact-host')!.firstElementChild!.shadowRoot!
}

function trigger(): HTMLButtonElement {
  return shadow().querySelector<HTMLButtonElement>('[data-selection-count]')!
}

function list(): HTMLElement {
  return shadow().querySelector<HTMLElement>('[data-selection-list]')!
}

async function render(items: readonly SelectionItem[]) {
  await act(async () => view.render(items))
}

async function tick(time: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(time) })
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function pointer(element: HTMLElement, type: 'pointerover' | 'pointerout') {
  await act(async () => element.dispatchEvent(new PointerEvent(type, {
    bubbles: true, composed: true, pointerType: 'mouse', relatedTarget: document.body,
  })))
}

beforeEach(() => {
  previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  vi.clearAllMocks()
  const attachShadow = HTMLElement.prototype.attachShadow
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    // react-shadow handles the browser's NotSupportedError; happy-dom uses a different error name.
    if (this.shadowRoot) throw new DOMException('Shadow root already exists', 'NotSupportedError')
    return attachShadow.call(this, init)
  })
  callbacks.onRemove.mockReturnValue(true)
  editor = document.createElement('div')
  document.body.append(editor)
  view = mountDraftCards(editor, callbacks, 'compact')
})

afterEach(async () => {
  await act(async () => view.destroy())
  // Chakra retires dismissed layers over two animation frames.
  await tick(64)
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('compact draft selections', () => {
  it('renders a count in Shadow DOM, stays collapsed on additions and hides when empty', async () => {
    await render([item('a')])
    expect(trigger().textContent).toBe('1 Selection')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await render([item('a'), item('b')])
    expect(trigger().textContent).toBe('2 Selections')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-selection-count]')).toBeNull()
    await render([])
    expect(document.querySelector<HTMLElement>('.gpk-follow-compact-host')!.hidden).toBe(true)
    expect(shadow().querySelector('[data-selection-count]')).toBeNull()
  })

  it('shows full multiline text and only nonempty comments, with actions for every row', async () => {
    const text = 'long source\n'.repeat(100)
    await render([{ ...item('a'), selectedText: text, commentDraft: 'draft\ncomment' }, item('b', ' \n ')])
    await click(trigger())
    const rows = list().querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain(text)
    expect(rows[0].textContent).toContain('quickFollow.multiSelection.userComment')
    expect(rows[0].textContent).toContain('draft\ncomment')
    expect(rows[1].textContent).toContain('source b')
    expect(rows[1].textContent).not.toContain('quickFollow.multiSelection.userComment')
    expect(rows[1].textContent).not.toContain('quickFollow.multiSelection.noComment')
    expect(list().querySelectorAll('button[aria-label="quickFollow.multiSelection.editComment"]')).toHaveLength(2)
    expect(list().querySelectorAll('[data-selection-remove]')).toHaveLength(2)
  })

  it('waits 100ms to open and allows moving from the trigger into the list across the gap', async () => {
    await render([item('a')])
    await pointer(trigger(), 'pointerover')
    await tick(99)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await tick(1)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await pointer(trigger(), 'pointerout')
    await tick(100)
    await pointer(list(), 'pointerover')
    await tick(200)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await pointer(list(), 'pointerout')
    await tick(149)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await tick(1)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on hover when entering from another React root without clicking the count', async () => {
    const surroundingHost = document.createElement('div')
    document.body.append(surroundingHost)
    const surroundingRoot = createRoot(surroundingHost)
    try {
      await act(async () => surroundingRoot.render(<button>Surrounding page control</button>))
      await render([item('a')])
      await act(async () => trigger().dispatchEvent(new PointerEvent('pointerover', {
        bubbles: true, composed: true, pointerType: 'mouse', relatedTarget: surroundingHost.firstElementChild,
      })))
      await tick(100)
      expect(trigger().getAttribute('aria-expanded')).toBe('true')
      expect(list().textContent).toContain('source a')
    } finally {
      await act(async () => surroundingRoot.unmount())
      surroundingHost.remove()
    }
  })

  it('does not restart hover or close when moving over children inside the trigger and list', async () => {
    await render([item('a')])
    await pointer(trigger(), 'pointerover')
    await tick(50)
    await act(async () => {
      const icon = trigger().querySelector('svg')!
      trigger().dispatchEvent(new PointerEvent('pointerout', {
        bubbles: true, composed: true, pointerType: 'mouse', relatedTarget: icon,
      }))
      icon.dispatchEvent(new PointerEvent('pointerover', {
        bubbles: true, composed: true, pointerType: 'mouse', relatedTarget: trigger(),
      }))
    })
    await tick(50)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await act(async () => list().dispatchEvent(new PointerEvent('pointerout', {
      bubbles: true, composed: true, pointerType: 'mouse', relatedTarget: list().querySelector('li'),
    })))
    await tick(200)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('cancels a pending hover open on leave and supports click toggling', async () => {
    await render([item('a')])
    await pointer(trigger(), 'pointerover')
    await tick(50)
    await pointer(trigger(), 'pointerout')
    await tick(200)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('routes source and edit clicks separately and closes the list', async () => {
    await render([item('a')])
    await click(trigger())
    await click(list().querySelector<HTMLButtonElement>('li button')!)
    expect(callbacks.onJumpToSource).toHaveBeenCalledWith('a')
    expect(callbacks.onComment).not.toHaveBeenCalled()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await click(trigger())
    await click(list().querySelector<HTMLButtonElement>('button[aria-label="quickFollow.multiSelection.editComment"]')!)
    expect(callbacks.onComment).toHaveBeenCalledWith('a')
    expect(callbacks.onJumpToSource).toHaveBeenCalledTimes(1)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('preserves the list and scroll while deleting, renumbers and focuses the next then previous row', async () => {
    let items = [item('a'), item('b'), item('c')]
    callbacks.onRemove.mockImplementation(id => {
      items = items.filter(selection => selection.id !== id)
      view.render(items)
      return true
    })
    await render(items)
    await click(trigger())
    const originalList = list()
    originalList.scrollTop = 80
    await click(list().querySelector<HTMLButtonElement>('[data-selection-remove="b"]')!)
    expect(list()).toBe(originalList)
    expect(list().scrollTop).toBe(80)
    expect(trigger().textContent).toBe('2 Selections')
    expect(shadow().activeElement?.getAttribute('data-selection-remove')).toBe('c')
    expect(list().querySelectorAll('li')[1].textContent).toMatch(/^2\./)
    await click(list().querySelector<HTMLButtonElement>('[data-selection-remove="c"]')!)
    expect(shadow().activeElement?.getAttribute('data-selection-remove')).toBe('a')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(callbacks.onJumpToSource).not.toHaveBeenCalled()
    await click(list().querySelector<HTMLButtonElement>('[data-selection-remove="a"]')!)
    expect(document.querySelector<HTMLElement>('.gpk-follow-compact-host')!.hidden).toBe(true)
  })

  it('opens with the keyboard and closes on Escape, restoring focus from a row', async () => {
    await render([item('a')])
    await act(async () => {
      trigger().focus()
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    await tick(40)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    await act(async () => {
      const remove = list().querySelector<HTMLButtonElement>('[data-selection-remove]')!
      remove.focus()
      remove.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
    })
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(shadow().activeElement).toBe(trigger())
  })

  it('closes on outside pointer interaction and through the shared close entry', async () => {
    await render([item('a')])
    await click(trigger())
    await tick(40)
    await tick(40)
    await act(async () => {
      editor.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, composed: true, pointerType: 'mouse', clientX: 1000, clientY: 1000,
      }))
    })
    await tick(40)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await click(trigger())
    await act(async () => closeActiveFollowUpPopovers())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('cancels hover work on disable and cleans up on destroy', async () => {
    await render([item('a')])
    await pointer(trigger(), 'pointerover')
    await act(async () => view.setDisabled(true))
    await tick(200)
    expect(trigger().disabled).toBe(true)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    await act(async () => view.setDisabled(false))
    await pointer(trigger(), 'pointerover')
    await act(async () => view.destroy())
    await tick(200)
    expect(document.querySelector('.gpk-follow-compact-host')).toBeNull()
    await act(async () => closeActiveFollowUpPopovers())
  })
})
