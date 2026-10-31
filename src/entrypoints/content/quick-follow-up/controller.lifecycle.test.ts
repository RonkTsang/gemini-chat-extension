import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => {
  type State = { settings: { enabled: boolean }; hydrate: () => Promise<void> }
  const listeners = new Set<(next: State, previous: State) => void>()
  const state: State = { settings: { enabled: true }, hydrate: async () => undefined }
  return { state, listeners }
})
vi.mock('@/stores/quickFollowStore', () => ({
  quickFollowStore: {
    getState: () => settings.state,
    subscribe: (callback: (next: typeof settings.state, previous: typeof settings.state) => void) => {
      settings.listeners.add(callback)
      return () => settings.listeners.delete(callback)
    },
  },
}))
vi.mock('@/components/ui/toaster', () => ({ toaster: { create: vi.fn() } }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/utils/i18nCache', () => ({ i18nCache: { get: (key: string) => key, preCache: vi.fn() } }))
vi.mock('wxt/browser', () => ({ browser: { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } } }))

import { eventBus } from '@/utils/eventbus'
import { toaster } from '@/components/ui/toaster'
import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { createFollowUpController } from './controller'
import { appendRequestText, getConversationScope, readRequest, replaceRequestText, resolveInput, type Candidate } from './dom'
import { serializeMessage } from './protocol'

const fixture = readFileSync(resolve(process.cwd(), 'docs/dom/input.html'), 'utf8')
let controller: ReturnType<typeof createFollowUpController>

function candidate(id: string): Candidate {
  return {
    text: `source ${id}`,
    position: { clientX: 100, clientY: 200 },
    scope: 'conversation-1',
    anchor: {
      quoteId: id, conversationId: 'conversation-1', sourceMessageId: `source-${id}`,
      selectedText: `source ${id}`, startOffset: 0, endOffset: id.length + 7,
      prefix: '', suffix: '',
    },
  }
}

function mountSource(id: string): HTMLElement {
  const source = document.createElement('message-content')
  source.id = `source-${id}`
  source.textContent = `source ${id}`
  document.querySelector('chat-window')!.append(source)
  const rect = new DOMRect(120, 160, 80, 20)
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(Object.assign([rect], {
    item: (index: number) => index === 0 ? rect : null,
  }))
  return source
}

function mountFixture(): void {
  document.body.innerHTML = fixture
  // The captured file deliberately shows both alternative states for documentation.
  document.querySelector('.send-button.stop')?.closest('.send-button-container')?.remove()
}

function addQuery(raw: string): Element {
  const query = document.createElement('user-query')
  const text = document.createElement('div')
  text.className = 'query-text'
  for (const line of raw.split('\n')) {
    const row = document.createElement('p')
    row.className = 'query-text-line'
    row.textContent = line
    text.append(row)
  }
  query.append(text)
  document.querySelector('chat-window')!.append(query)
  return query
}

function clearNativeInput(editor: HTMLElement): void {
  const paragraph = document.createElement('p')
  paragraph.append(document.createElement('br'))
  editor.replaceChildren(paragraph)
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

async function flushMutations(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

function setEnabled(enabled: boolean): void {
  const previous = { ...settings.state, settings: { ...settings.state.settings } }
  settings.state.settings = { enabled }
  settings.listeners.forEach(listener => listener(settings.state, previous))
}

beforeEach(() => {
  settings.state.settings = { enabled: true }
  window.history.replaceState({}, '', '/app/conversation-1')
  mountFixture()
  controller = createFollowUpController(vi.fn())
  controller.start()
})

afterEach(() => {
  controller.stop()
  vi.useRealTimers()
  eventBus.removeAllListeners()
  settings.listeners.clear()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Follow-up lifecycle regressions', () => {
  it('hides native Ask menus only while enabled and cleans up on stop', () => {
    const nativeStyle = document.createElement('style')
    nativeStyle.textContent = 'highlight-to-ask-menu { display: flex; }'
    document.head.prepend(nativeStyle)
    try {
      const menu = document.createElement('highlight-to-ask-menu')
      document.body.append(menu)
      expect(getComputedStyle(menu).display).toBe('none')

      setEnabled(false)
      expect(getComputedStyle(menu).display).toBe('flex')
      setEnabled(true)
      const replacement = menu.cloneNode() as HTMLElement
      menu.replaceWith(replacement)
      expect(getComputedStyle(replacement).display).toBe('none')
      expect(document.querySelectorAll('style[data-gpk-follow-native-ask]')).toHaveLength(1)

      controller.stop()
      expect(getComputedStyle(replacement).display).toBe('flex')
      setEnabled(false)
      controller.start()
      expect(getComputedStyle(replacement).display).toBe('flex')
      setEnabled(true)
      expect(getComputedStyle(replacement).display).toBe('none')
    } finally {
      nativeStyle.remove()
    }
  })

  it('edits and clears drafts even when submit controls are ambiguous', async () => {
    const binding = resolveInput()!
    binding.sendButton!.parentElement!.append(binding.sendButton!.cloneNode(true))
    expect(resolveInput()).toBeNull()
    expect(controller.add(candidate('a'))).toBe('a')
    expect(controller.changeQuickComment('a', 'latest comment')).toBe(true)
    expect(controller.add(candidate('b'))).toBe('b')
    expect(controller.remove('b')).toBe(true)
    clearNativeInput(binding.editor)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(false)
    expect(document.querySelector('.gpk-follow-card')).toBeNull()
  })

  it('never locks ordinary cards after Stop, Enter, or an unconfirmed native send', async () => {
    vi.useFakeTimers()
    const binding = resolveInput()!
    controller.add(candidate('a'))
    binding.sendButton!.classList.replace('submit', 'stop')
    const stop = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(stop)
    expect(stop.defaultPrevented).toBe(false)
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    binding.editor.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    expect(controller.changeQuickComment('a', 'after stop')).toBe(true)
    binding.sendButton!.classList.replace('stop', 'submit')
    binding.sendButton!.click()
    await vi.advanceTimersByTimeAsync(15_001)
    expect(controller.isBusy()).toBe(false)
    expect(controller.changeQuickComment('a', 'corrected')).toBe(true)
    expect(replaceRequestText(binding.editor, 'corrected request')).toBe(true)
    const retry = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(retry)
    expect(retry.defaultPrevented).toBe(false)
    expect(controller.remove('a')).toBe(true)
  })

  it('does not delete a sentinel that moves within the same mutation batch', async () => {
    const { editor } = resolveInput()!
    controller.add(candidate('a'))
    const sentinel = editor.querySelector('[data-gpk-follow-sentinel]')!
    sentinel.remove()
    editor.append(sentinel)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(true)
    expect(controller.changeQuickComment('a', 'still editable')).toBe(true)
  })

  it('rebinds a replaced editor without treating detachment as a submitted draft', async () => {
    const { editor } = resolveInput()!
    controller.add(candidate('a'))
    const replacement = editor.cloneNode(false) as HTMLElement
    replacement.innerHTML = '<p>replacement request</p>'
    editor.replaceWith(replacement)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(true)
    expect(replacement.querySelector('[data-gpk-follow-sentinel="a"]')).not.toBeNull()
    clearNativeInput(editor)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(true)
    expect(readRequest(replacement)).toBe('replacement request')
    clearNativeInput(replacement)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(false)
  })

  it('coalesces extension send actions while waiting and allows edits to cancel them', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    const container = binding.sendButton!.closest('.send-button-container')!
    const parent = container.parentElement!
    const clicks = vi.fn()
    binding.sendButton!.addEventListener('click', clicks)
    container.remove()
    const pending = controller.requestSend()
    await expect(controller.requestSend()).resolves.toBe(false)
    expect(controller.changeQuickComment('a', 'changed during readiness wait')).toBe(true)
    parent.append(container)
    await expect(pending).resolves.toBe(false)
    expect(clicks).not.toHaveBeenCalled()
    await expect(controller.requestSend()).resolves.toBe(true)
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(controller.isBusy()).toBe(false)
  })

  it('cleans ordinary cards without a send event or parseable history', async () => {
    const { editor } = resolveInput()!
    controller.add(candidate('a'))
    addQuery('a different native message format')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'next draft'
    editor.replaceChildren(paragraph)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(false)
    expect(readRequest(editor)).toBe('next draft')
    expect(controller.add(candidate('b'))).toBe('b')
  })

  it('publishes source selections in card order and removes the open comment when its native sentinel disappears', async () => {
    controller.stop()
    const change = vi.fn()
    const selections = vi.fn()
    controller = createFollowUpController(change, selections)
    controller.start()
    controller.add(candidate('a'))
    controller.addComment('a')
    controller.add(candidate('b'))
    expect(selections).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' }),
    ])
    resolveInput()!.editor.querySelector('[data-gpk-follow-sentinel="b"]')!.remove()
    await flushMutations()
    expect(change).toHaveBeenLastCalledWith({ mode: 'closed' })
    expect(selections).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a' })])
    controller.remove('a')
    expect(selections).toHaveBeenLastCalledWith([])
    controller.add(candidate('c'))
    controller.stop()
    expect(selections).toHaveBeenLastCalledWith([])
  })

  function mockHighlights() {
    const highlights = new Map<string, Set<Range>>()
    vi.stubGlobal('CSS', Object.assign(Object.create(globalThis.CSS), { highlights }))
    vi.stubGlobal('Highlight', class extends Set<Range> {
      constructor(...ranges: Range[]) { super(ranges) }
    })
    return highlights
  }

  it.each(['new', 'edit'])('keeps the %s comment source highlighted while typing beyond the jump timeout', mode => {
    vi.useFakeTimers()
    const highlights = mockHighlights()
    const source = mountSource('a')
    controller.add(candidate('a'))
    if (mode === 'edit') {
      controller.addComment('a')
      expect(highlights.size).toBe(0)
      expect(controller.openQuickComment('a')).toBe(true)
    }
    const highlight = highlights.get('gemini-power-kit-quote-highlight')!
    expect(highlight).toBeDefined()
    const range = [...highlight][0]
    expect(source.contains(range.startContainer)).toBe(true)
    expect(range.toString()).toBe('source a')

    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const textarea = document.createElement('textarea')
    shadow.append(textarea)
    document.body.append(host)
    textarea.focus()
    textarea.value = 'comment draft'
    textarea.setSelectionRange(5, 5)
    controller.changeQuickComment('a', textarea.value)
    vi.advanceTimersByTime(3_000)
    expect(highlights.get('gemini-power-kit-quote-highlight')).toBe(highlight)
    expect(shadow.activeElement).toBe(textarea)
    controller.addComment('a')
    expect(highlights.size).toBe(0)
  })

  it.each(['dismiss', 'remove', 'disable', 'stop', 'navigate'])(
    'clears the comment source highlight on %s', action => {
      const highlights = mockHighlights()
      mountSource('a')
      controller.add(candidate('a'))
      expect(highlights.size).toBe(1)
      if (action === 'dismiss') controller.dismiss()
      else if (action === 'remove') controller.remove('a')
      else if (action === 'disable') setEnabled(false)
      else if (action === 'stop') controller.stop()
      else eventBus.emit('chatchange', {
        currentUrl: 'https://gemini.google.com/app/conversation-2',
        originalUrl: 'https://gemini.google.com/app/conversation-1',
        timestamp: Date.now(),
        isFromNewChat: false,
      })
      expect(highlights.size).toBe(0)
    }
  )

  it('mounts draft cards inside rich-textarea directly before the native editor', () => {
    const binding = resolveInput()!
    expect(controller.add(candidate('position'))).toBe('position')
    const carousel = document.querySelector('.gpk-follow-draft-cards')!
    expect(carousel.parentElement).toBe(binding.richTextarea)
    expect(carousel.nextElementSibling).toBe(binding.editor)
    expect(binding.editor.querySelector('.gpk-follow-card')).toBeNull()
    expect(readRequest(binding.editor)).toBe('line-1\nline-2')
  })

  it('opens Quick Comment with an empty editor and no native Send button', () => {
    controller.stop()
    document.querySelector('.send-button-container')!.remove()
    const editor = document.querySelector<HTMLElement>('.ql-editor')!
    clearNativeInput(editor)
    const change = vi.fn()
    controller = createFollowUpController(change)
    controller.start()

    expect(controller.add(candidate('empty'))).toBe('empty')
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'comment', selectionId: 'empty' }))
    expect(document.querySelectorAll('.gpk-follow-draft-cards .gpk-follow-card')).toHaveLength(1)
    expect(readRequest(editor)).toBe('')
    expect(controller.changeQuickComment('empty', 'my comment')).toBe(true)
  })

  it('adds a selection immediately after Gemini replaces its native Send button', () => {
    const binding = resolveInput()!
    binding.sendButton!.replaceWith(binding.sendButton!.cloneNode(true))
    expect(controller.add(candidate('replaced'))).toBe('replaced')
    expect(controller.changeQuickComment('replaced', 'keep editing')).toBe(true)
  })

  it('shows a failure notice when Ask Gemini cannot bind a unique editor', () => {
    document.querySelector('rich-textarea')!.remove()
    vi.mocked(toaster.create).mockClear()
    expect(controller.add(candidate('missing'))).toBeNull()
    expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'quickFollow.multiSelection.addFailed' }))
  })

  it('waits for Gemini to create Send when sending an empty-body selection', async () => {
    const binding = resolveInput()!
    const container = binding.sendButton!.closest('.send-button-container')!
    const parent = container.parentElement!
    container.remove()
    clearNativeInput(binding.editor)
    expect(controller.add(candidate('empty'))).toBe('empty')
    const submit = vi.fn()
    binding.sendButton!.addEventListener('click', submit)

    const pending = controller.requestSend()
    expect(submit).not.toHaveBeenCalled()
    parent.append(container)
    expect(await pending).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps ten cards and the native body unchanged when an eleventh is refused', () => {
    const binding = resolveInput()!
    const nativeParagraph = binding.editor.querySelector('p')
    for (let index = 0; index < 10; index += 1) expect(controller.add(candidate(String(index)))).not.toBeNull()
    expect(controller.add(candidate('overflow'))).toBeNull()
    expect(binding.editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(10)
    expect(readRequest(binding.editor)).toBe('line-1\nline-2')
    expect(nativeParagraph?.isConnected).toBe(true)
  })

  it('distinguishes comment updates from removing a single sentinel', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    controller.add(candidate('b'))
    const first = binding.editor.querySelector('[data-gpk-follow-sentinel="a"]')
    expect(controller.changeQuickComment('a', 'comment')).toBe(true)
    await flushMutations()
    expect(binding.editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(2)
    expect(binding.editor.querySelector('[data-gpk-follow-sentinel="a"]')).toBe(first)
    binding.editor.querySelector('[data-gpk-follow-sentinel="b"]')!.remove()
    await flushMutations()
    expect(binding.editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(1)
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')?.textContent).toContain('source a')
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')?.textContent).not.toContain('source b')
    expect(readRequest(binding.editor)).toBe('line-1\nline-2')
  })

  it('syncs the request heading on typing, clearing, undo, and programmatic appends while preserving cards', async () => {
    const { editor } = resolveInput()!
    replaceRequestText(editor, '')
    controller.add(candidate('a'))
    const sentinel = editor.querySelector('[data-gpk-follow-sentinel]')!
    const paragraph = editor.lastElementChild!
    expect(editor.querySelector('[data-gpk-follow-request]')).toBeNull()

    for (const text of ['typed request', '', ' \t', 'restored by undo']) {
      paragraph.textContent = text
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'historyUndo' }))
      expect(Boolean(editor.querySelector('[data-gpk-follow-request]'))).toBe(Boolean(text.trim()))
      await flushMutations()
      expect(controller.hasDraftCards()).toBe(true)
      expect(editor.querySelector('[data-gpk-follow-sentinel]')).toBe(sentinel)
      expect(readRequest(editor)).toBe(text)
    }
    replaceRequestText(editor, '')
    expect(appendRequestText(editor, 'appended request')).toBe(true)
    expect(editor.querySelector('[data-gpk-follow-request]')?.textContent).toBe('## My request:')
    controller.stop()
    expect(editor.querySelector('[data-gpk-follow-request]')).toBeNull()
    expect(readRequest(editor)).toBe('appended request')
  })

  it('waits for composition to end and observes text mutations without input events', async () => {
    const { editor } = resolveInput()!
    replaceRequestText(editor, '')
    controller.add(candidate('a'))
    const paragraph = editor.lastElementChild!
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    paragraph.textContent = '输入中'
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    await flushMutations()
    expect(editor.querySelector('[data-gpk-follow-request]')).toBeNull()
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(editor.querySelector('[data-gpk-follow-request]')).not.toBeNull()
    paragraph.firstChild!.textContent = ''
    await flushMutations()
    expect(editor.querySelector('[data-gpk-follow-request]')).toBeNull()
    expect(controller.hasDraftCards()).toBe(true)
  })

  it.each(['clear-first', 'query-first'])('clears draft cards on the native editor clear regardless of query timing: %s', async order => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    controller.changeQuickComment('a', 'pending comment')
    const raw = serializeMessage([{ id: 'a', revision: 1, selectedText: 'source a', comment: 'pending comment' }], readRequest(binding.editor)!)
    binding.sendButton!.click()
    if (order === 'clear-first') clearNativeInput(binding.editor)
    else addQuery(raw)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(order !== 'clear-first')
    if (order === 'clear-first') addQuery(raw)
    else clearNativeInput(binding.editor)
    await flushMutations()
    expect(controller.hasDraftCards()).toBe(false)
    expect(controller.isBusy()).toBe(false)
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(document.querySelector('user-query [data-follow-jump]')).not.toBeNull()
  })

  it.each(['', 'first line\nsecond line'])('cleans sent cards without a matching history message for body %j', async request => {
    const binding = resolveInput()!
    expect(replaceRequestText(binding.editor, request)).toBe(true)
    controller.add(candidate('a'))
    const raw = serializeMessage([{ id: 'a', revision: 1, selectedText: 'source a', comment: '' }], request)
    binding.sendButton!.click()
    addQuery(raw.split('\n').map(line => line ? ` ${line} ` : '').join('\n'))
    clearNativeInput(binding.editor)
    await flushMutations()

    expect(controller.hasDraftCards()).toBe(false)
    expect(controller.isBusy()).toBe(false)
    expect(document.querySelectorAll('.gpk-follow-draft-cards .gpk-follow-card')).toHaveLength(0)
    expect(binding.editor.querySelector('[data-gpk-follow-sentinel]')).toBeNull()
    expect(controller.add(candidate('next'))).toBe('next')
  })

  it('cleans cards when native markers disappear without an input event and preserves newly typed text', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    binding.sendButton!.click()
    const paragraph = document.createElement('p')
    paragraph.textContent = 'new draft after send'
    binding.editor.replaceChildren(paragraph)
    await flushMutations()

    expect(controller.hasDraftCards()).toBe(false)
    expect(controller.isBusy()).toBe(false)
    expect(readRequest(binding.editor)).toBe('new draft after send')
    expect(paragraph.isConnected).toBe(true)
  })

  it('removes its hidden nodes on stop even after native content becomes rich text', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    const paragraph = [...binding.editor.children].find(node => !node.hasAttribute('data-gpk-follow-prefix')
      && !node.hasAttribute('data-gpk-follow-sentinel') && !node.hasAttribute('data-gpk-follow-request'))!
    const strong = document.createElement('strong')
    strong.textContent = 'formatted'
    paragraph.append(strong)
    controller.stop()
    await flushMutations()
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(binding.editor.querySelector('[data-gpk-follow-sentinel]')).toBeNull()
    expect(strong.isConnected).toBe(true)
    expect(document.querySelector('.gpk-follow-draft-cards')).toBeNull()
    expect(eventBus.listenerCount('chatchange')).toBe(0)
    expect(settings.listeners.size).toBe(0)
  })

  it('stays disabled across chat-window replacement and can be enabled again', async () => {
    controller.add(candidate('a'))
    setEnabled(false)
    mountFixture()
    const raw = serializeMessage([{ id: 'history', revision: 1, selectedText: 'history source', comment: '' }], 'question')
    addQuery(raw)
    await flushMutations()
    expect(document.querySelector('.gpk-follow-history')).toBeNull()
    expect(document.querySelector('.gpk-follow-draft-cards')).toBeNull()
    setEnabled(true)
    await flushMutations()
    expect(document.querySelector('.gpk-follow-history')).not.toBeNull()
    expect(controller.add(candidate('b'))).not.toBeNull()
  })

  it('starts again without retaining listeners or cards from the previous mount', async () => {
    controller.add(candidate('a'))
    controller.stop()
    controller.start()
    await flushMutations()
    expect(eventBus.listenerCount('chatchange')).toBe(1)
    expect(settings.listeners.size).toBe(1)
    expect(document.querySelectorAll('.gpk-follow-draft-cards')).toHaveLength(1)
    expect(controller.hasDraftCards()).toBe(false)
    expect(controller.add(candidate('b'))).not.toBeNull()
  })

  it('keeps a saved comment when reopening Quick Comment', () => {
    const change = vi.fn()
    controller.stop()
    controller = createFollowUpController(change)
    controller.start()
    controller.add(candidate('a'))
    controller.changeQuickComment('a', 'keep my comment')
    controller.addComment('a')
    mountSource('a')
    controller.openQuickComment('a')
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'comment', commentDraft: 'keep my comment',
    }))
  })

  it.each(['.gpk-follow-card-action-comment', '.gpk-follow-card-action-edit'])(
    'opens %s at its original source and commits changes only on Save', action => {
      const change = vi.fn()
      controller.stop()
      controller = createFollowUpController(change)
      controller.start()
      controller.add(candidate('a'))
      controller.changeQuickComment('a', 'saved comment')
      controller.addComment('a')
      const source = mountSource('a')
      const scroll = vi.spyOn(source, 'scrollIntoView')
      const editor = resolveInput()!.editor
      const savedPrefix = editor.innerHTML

      document.querySelector<HTMLButtonElement>(action)!.click()
      expect(scroll).not.toHaveBeenCalled()
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({
        mode: 'comment', commentDraft: 'saved comment',
        position: { clientX: 160, clientY: 160, bottom: 180 }, sourceAnchor: candidate('a').anchor,
      }))
      expect(controller.changeQuickComment('a', 'discarded edit')).toBe(true)
      expect(editor.innerHTML).toBe(savedPrefix)
      expect(document.querySelector('.gpk-follow-card-comment')?.textContent).toBe('saved comment')
      controller.dismiss()
      controller.openQuickComment('a')
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ commentDraft: 'saved comment' }))

      controller.changeQuickComment('a', 'new saved comment')
      expect(controller.addComment('a')).toBe(true)
      expect(change).toHaveBeenLastCalledWith({ mode: 'closed' })
      expect(document.querySelector('.gpk-follow-card-comment')?.textContent).toBe('new saved comment')
      expect(editor.textContent).toContain('new saved comment')
      expect(readRequest(editor)).toBe('line-1\nline-2')
    }
  )

  it('scrolls back to an offscreen source before opening its comment', () => {
    const change = vi.fn()
    controller.stop()
    controller = createFollowUpController(change)
    controller.start()
    controller.add(candidate('a'))
    controller.addComment('a')
    const source = mountSource('a')
    const offscreen = new DOMRect(120, -200, 80, 20)
    vi.mocked(Range.prototype.getClientRects).mockReturnValue(Object.assign([offscreen], {
      item: (index: number) => index === 0 ? offscreen : null,
    }))
    const scroll = vi.spyOn(source, 'scrollIntoView').mockImplementation(() => {
      const visible = new DOMRect(120, 160, 80, 20)
      vi.mocked(Range.prototype.getClientRects).mockReturnValue(Object.assign([visible], {
        item: (index: number) => index === 0 ? visible : null,
      }))
    })
    expect(controller.openQuickComment('a')).toBe(true)
    expect(scroll).toHaveBeenCalledOnce()
    expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' })
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'comment', position: { clientX: 160, clientY: 160, bottom: 180 },
    }))
  })

  it('reports an unavailable quote source instead of opening an editor beside the card', () => {
    controller.add(candidate('missing'))
    controller.dismiss()
    expect(controller.openQuickComment('missing')).toBe(false)
    expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'quickFollow.multiSelection.updateFailed',
    }))
  })

  it('keeps edits open on a failed Save and allows saving an empty comment', () => {
    const change = vi.fn()
    controller.stop()
    controller = createFollowUpController(change)
    controller.start()
    controller.add(candidate('a'))
    controller.changeQuickComment('a', 'saved comment')
    controller.addComment('a')
    mountSource('a')
    controller.openQuickComment('a')
    controller.changeQuickComment('a', '')
    const editor = resolveInput()!.editor
    const paragraph = editor.querySelector('p:not([data-gpk-follow-prefix]):not([data-gpk-follow-sentinel]):not([data-gpk-follow-request])')!
    const original = paragraph.innerHTML
    paragraph.appendChild(document.createElement('img'))
    change.mockClear()
    expect(controller.addComment('a')).toBe(false)
    expect(change).not.toHaveBeenCalled()
    expect(document.querySelector('.gpk-follow-card-comment')?.textContent).toBe('saved comment')
    paragraph.innerHTML = original
    expect(controller.addComment('a')).toBe(true)
    expect(change).toHaveBeenLastCalledWith({ mode: 'closed' })
    expect(document.querySelector('.gpk-follow-card-comment')).toBeNull()
  })

  it('allows an explicit retry after an unconfirmed ordinary send without automatically resending', async () => {
    vi.useFakeTimers()
    const binding = resolveInput()!
    controller.add(candidate('a'))
    const submit = vi.fn()
    binding.sendButton!.addEventListener('click', submit)
    binding.sendButton!.click()
    await vi.advanceTimersByTimeAsync(15_001)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(controller.hasDraftCards()).toBe(true)
    expect(await controller.requestSend()).toBe(true)
    expect(submit).toHaveBeenCalledTimes(2)
    binding.sendButton!.removeEventListener('click', submit)
  })

  it.each([
    ['/app', false],
    ['/u/1/app', false],
    ['/u/1/app', true],
  ] as const)('clears old quotes on a chat switch under %s (absolute URL: %s)', async (route, absoluteUrl) => {
    controller.stop()
    const originalPath = `${route}/chat-a`
    const nextPath = `${route}/chat-b`
    window.history.replaceState({}, '', originalPath)
    controller = createFollowUpController(vi.fn())
    controller.start()
    const source = candidate('a')
    source.scope = getConversationScope()
    source.anchor.conversationId = source.scope
    expect(controller.add(source)).toBe('a')
    const { editor } = resolveInput()!
    expect(editor.querySelector('[data-gpk-follow-prefix]')).not.toBeNull()

    window.history.replaceState({}, '', nextPath)
    eventBus.emitSync('chatchange', {
      originalUrl: absoluteUrl ? `https://gemini.google.com${originalPath}` : originalPath,
      currentUrl: absoluteUrl ? `https://gemini.google.com${nextPath}` : nextPath,
      isFromNewChat: false, timestamp: Date.now(),
    })
    const replacement = editor.cloneNode(false) as HTMLElement
    replacement.innerHTML = '<p>chat B request</p>'
    editor.replaceWith(replacement)
    await flushMutations()

    expect(controller.hasDraftCards()).toBe(false)
    expect(replacement.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(replacement.querySelector('[data-gpk-follow-sentinel]')).toBeNull()
    expect(readRequest(replacement)).toBe('chat B request')
    const nextSource = candidate('b')
    nextSource.scope = getConversationScope()
    nextSource.anchor.conversationId = nextSource.scope
    expect(controller.add(nextSource)).toBe('b')
  })

  it('does not block native sends in another conversation while retaining a separate-send backup', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    const prompt: QuickFollowPrompt = {
      id: 'p', template: 'Separate request', iconKey: 'sparkles', enabled: true,
      createdAt: '', updatedAt: '',
    }
    expect(await controller.sendPromptSeparately(prompt, candidate('b'))).toBe(true)
    window.history.replaceState({}, '', '/app/conversation-2')
    eventBus.emitSync('chatchange', {
      originalUrl: 'https://gemini.google.com/app/conversation-1',
      currentUrl: 'https://gemini.google.com/app/conversation-2',
      isFromNewChat: false, timestamp: Date.now(),
    })
    clearNativeInput(binding.editor)
    binding.editor.querySelector('p')!.textContent = 'new conversation request'
    await flushMutations()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(binding.editor.contentEditable).toBe('true')
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(readRequest(binding.editor)).toBe('new conversation request')
  })

  it('restores a separate-send draft when Gemini replaces the editor with an empty one', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    const prompt: QuickFollowPrompt = {
      id: 'p', template: 'Separate request', iconKey: 'sparkles', enabled: true,
      createdAt: '', updatedAt: '',
    }
    expect(await controller.sendPromptSeparately(prompt, candidate('b'))).toBe(true)
    const replacement = binding.editor.cloneNode(false) as HTMLElement
    replacement.innerHTML = '<p><br></p>'
    binding.editor.replaceWith(replacement)
    await flushMutations()
    expect(readRequest(replacement)).toBe('line-1\nline-2')
    expect(controller.hasDraftCards()).toBe(true)
    expect(replacement.contentEditable).toBe('true')
    expect(controller.remove('a')).toBe(true)
  })

  it('restores a separate-send draft on a native clear without an input event', async () => {
    const { editor } = resolveInput()!
    controller.add(candidate('a'))
    const prompt: QuickFollowPrompt = {
      id: 'p', template: 'Separate request', iconKey: 'sparkles', enabled: true,
      createdAt: '', updatedAt: '',
    }
    expect(await controller.sendPromptSeparately(prompt, candidate('b'))).toBe(true)
    editor.innerHTML = '<p></p>'
    await flushMutations()
    expect(readRequest(editor)).toBe('line-1\nline-2')
    expect(controller.hasDraftCards()).toBe(true)
  })

  it.each([false, true])('restores across new-chat URL assignment (clear first: %s)', async clearFirst => {
    controller.stop()
    window.history.replaceState({}, '', '/app')
    controller = createFollowUpController(vi.fn())
    controller.start()
    const { editor } = resolveInput()!
    const source = candidate('a')
    source.scope = 'new-chat'
    source.anchor.conversationId = 'new-chat'
    controller.add(source)
    const prompt: QuickFollowPrompt = {
      id: 'p', template: 'Separate request', iconKey: 'sparkles', enabled: true,
      createdAt: '', updatedAt: '',
    }
    expect(await controller.sendPromptSeparately(prompt, source)).toBe(true)
    window.history.replaceState({}, '', '/app/created-chat')
    if (clearFirst) clearNativeInput(editor)
    eventBus.emitSync('chatchange', {
      originalUrl: 'https://gemini.google.com/app', currentUrl: 'https://gemini.google.com/app/created-chat',
      isFromNewChat: true, timestamp: Date.now(),
    })
    if (!clearFirst) clearNativeInput(editor)
    await flushMutations()
    expect(readRequest(editor)).toBe('line-1\nline-2')
    expect(controller.hasDraftCards()).toBe(true)
    expect(controller.remove('a')).toBe(true)
  })

  it('restores editable card actions after a successful separate send', async () => {
    const binding = resolveInput()!
    controller.add(candidate('a'))
    controller.changeQuickComment('a', 'comment to retain')
    const prompt: QuickFollowPrompt = {
      id: 'p', template: 'Separate request', iconKey: 'sparkles', enabled: true,
      createdAt: '', updatedAt: '',
    }
    expect(await controller.sendPromptSeparately(prompt, candidate('b'))).toBe(true)
    addQuery('Separate request')
    clearNativeInput(binding.editor)
    await flushMutations()
    expect(controller.isBusy()).toBe(false)
    expect(readRequest(binding.editor)).toBe('line-1\nline-2')
    const removeButton = document.querySelector<HTMLButtonElement>('.gpk-follow-draft-cards .gpk-follow-card-action-remove')!
    expect(removeButton).not.toBeNull()
    expect(removeButton.disabled).toBe(false)
    removeButton.click()
    expect(controller.hasDraftCards()).toBe(false)
  })
})
