import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCards = vi.hoisted(() => ({
  mountDraftCards: vi.fn(() => ({ render: vi.fn(), setDisabled: vi.fn(), destroy: vi.fn() })),
  renderHistory: vi.fn(() => vi.fn()),
  restoreHistory: vi.fn(),
  closeActiveFollowUpPopovers: vi.fn(),
}))
const mockStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ settings: { enabled: true }, hydrate: vi.fn().mockResolvedValue(undefined) })),
  subscribe: vi.fn(() => vi.fn()),
}))
const mockEventBus = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  return {
    on: vi.fn((event: string, listener: (payload: unknown) => void) => {
      const current = listeners.get(event) ?? new Set()
      current.add(listener)
      listeners.set(event, current)
    }),
    off: vi.fn((event: string, listener: (payload: unknown) => void) => listeners.get(event)?.delete(listener)),
    emitSync: vi.fn((event: string, payload: unknown) => listeners.get(event)?.forEach(listener => listener(payload))),
  }
})
const mockBrowser = vi.hoisted(() => ({ storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } }))

vi.mock('./cards', () => mockCards)
vi.mock('@/stores/quickFollowStore', () => ({ quickFollowStore: mockStore }))
vi.mock('@/utils/eventbus', () => ({ eventBus: mockEventBus }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/utils/i18nCache', () => ({ i18nCache: { preCache: vi.fn(), get: () => '' } }))
vi.mock('@/components/ui/toaster', () => ({ toaster: { create: vi.fn() } }))
vi.mock('wxt/browser', () => ({ browser: mockBrowser }))

import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { createFollowUpController } from './controller'
import { readRequest, replaceRequestText, resolveInput } from './dom'
import { serializeMessage } from './protocol'

const fixture = readFileSync(resolve(process.cwd(), 'docs/dom/input.html'), 'utf8')
const currentFixture = readFileSync(resolve(process.cwd(), 'docs/dom/input-2026-10-24.html'), 'utf8')
const prompt = { id: 'prompt', template: `Look at ${QUICK_FOLLOW_PLACEHOLDER}`, iconKey: 'sparkles' as const, enabled: true, createdAt: '', updatedAt: '' }

function removeSubmitButton(): void {
  document.querySelector('.send-button.submit')?.closest('.send-button-container')?.remove()
}

function removeStopButton(): void {
  document.querySelector('.send-button.stop')?.closest('.send-button-container')?.remove()
}

function clearEditor(editor: HTMLElement): void {
  const placeholder = document.createElement('p')
  placeholder.append(document.createElement('br'))
  editor.replaceChildren(placeholder)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

function addSubmittedQuery(chat: HTMLElement, raw: string): void {
  const query = document.createElement('user-query')
  const text = document.createElement('div')
  text.className = 'query-text'
  for (const line of raw.split('\n')) {
    const paragraph = document.createElement('p')
    paragraph.className = 'query-text-line'
    paragraph.textContent = line
    text.append(paragraph)
  }
  query.append(text)
  chat.append(query)
}

async function flushObservers(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0))
  await Promise.resolve()
}

describe('Follow-up controller recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = fixture
    window.history.replaceState({}, '', '/app/conversation-1')
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it.each([false, true])('sends a custom prompt from the current empty composer (draft cards: %s)', async withCards => {
    const nativeSend = document.querySelector('.send-button.submit')!.closest('.send-button-container')!.cloneNode(true)
    document.body.innerHTML = currentFixture
    window.getSelection()?.removeAllRanges()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    const sent: string[] = []
    const controller = createFollowUpController(vi.fn())
    controller.start()
    if (withCards) expect(controller.add(candidate)).toBe('quote-id')
    editor.addEventListener('input', () => {
      if (readRequest(editor) !== 'Look at quoted source') return
      chat.querySelector('[data-node-type="input-area"]')!.append(nativeSend)
    }, { once: true })
    nativeSend.addEventListener('click', () => {
      sent.push(readRequest(editor) ?? '')
      addSubmittedQuery(chat, sent[sent.length - 1])
      clearEditor(editor)
    })

    try {
      const result = withCards
        ? controller.sendPromptSeparately(prompt, candidate)
        : controller.runPrompt(prompt, candidate)
      await expect(result).resolves.toBe(true)
      await flushObservers()
      expect(sent).toEqual(['Look at quoted source'])
      expect(readRequest(editor)).toBe('')
      expect(controller.hasDraftCards()).toBe(withCards)
      expect(controller.isBusy()).toBe(false)
    } finally {
      controller.stop()
    }
  })

  it.each([
    { withCards: false, fails: false },
    { withCards: true, fails: false },
    { withCards: false, fails: true },
    { withCards: true, fails: true },
  ])('restores formatted content after a custom send: %j', async ({ withCards, fails }) => {
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const sendButton = chat.querySelector<HTMLButtonElement>('.send-button.submit')!
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    const controller = createFollowUpController(vi.fn())
    controller.start()
    if (withCards) expect(controller.add(candidate)).toBe('quote-id')
    editor.querySelector('p:not([data-gpk-follow-prefix]):not([data-gpk-follow-sentinel])')!
      .innerHTML = '<strong>formatted draft</strong> with <em>emphasis</em>'
    const original = editor.innerHTML
    // Neighboring Gemini controls do not determine whether editor content can be restored.
    const neighboringControl = document.createElement('div')
    neighboringControl.dataset.uploadControl = 'available'
    chat.querySelector('input-container')!.append(neighboringControl)
    const send = vi.spyOn(sendButton, 'click').mockImplementation(() => {
      expect(readRequest(editor)).toBe('Look at quoted source')
      expect(editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
      if (fails) throw new Error('native send failed')
      addSubmittedQuery(chat, readRequest(editor)!)
      clearEditor(editor)
    })

    try {
      const result = withCards
        ? controller.sendPromptSeparately(prompt, candidate)
        : controller.runPrompt(prompt, candidate)
      await expect(result).resolves.toBe(!fails)
      await flushObservers()
      expect(send).toHaveBeenCalledTimes(1)
      expect(editor.innerHTML).toBe(original)
      expect(editor.contentEditable).toBe('true')
      expect(controller.hasDraftCards()).toBe(withCards)
      expect(controller.isBusy()).toBe(false)
    } finally {
      controller.stop()
    }
  })

  it('keeps the no-card prompt one-click while waiting for native Send readiness and exact confirmation', async () => {
    removeSubmitButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    editor.querySelector('p')!.textContent = 'my unsent draft'
    const stopButton = chat.querySelector<HTMLButtonElement>('.send-button.stop')!
    const send = vi.fn(() => {
      const raw = readRequest(editor) ?? ''
      addSubmittedQuery(chat, raw)
      clearEditor(editor)
    })
    stopButton.addEventListener('click', send)

    const controller = createFollowUpController(vi.fn())
    controller.start()
    const pending = controller.runPrompt(prompt, {
      text: 'quoted source',
      scope: 'conversation-1',
      position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    })

    await flushObservers()
    expect(send).not.toHaveBeenCalled()
    expect(readRequest(editor)).toContain('Look at quoted source')
    stopButton.classList.remove('stop')
    stopButton.classList.add('submit')
    stopButton.setAttribute('aria-label', 'Send message')
    stopButton.dispatchEvent(new Event('change', { bubbles: true }))
    await flushObservers()
    // MutationObserver observes the button class/label transition.
    await expect(pending).resolves.toBe(true)
    await flushObservers()

    expect(send).toHaveBeenCalledTimes(1)
    expect(chat.querySelectorAll('user-query').item(chat.querySelectorAll('user-query').length - 1)
      ?.querySelector('.query-text')?.textContent).toBe('Look at quoted source')
    expect(readRequest(editor)).toBe('my unsent draft\nline-2')
    expect(editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    controller.stop()
  })

  it('single-sends only the expanded prompt and restores the card plus the original draft after confirmation and clear', async () => {
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const originalDraft = readRequest(editor)
    editor.querySelector('p')!.textContent = 'preserved draft'
    const sendButton = chat.querySelector<HTMLButtonElement>('.send-button.submit')!
    const sentRaw: string[] = []
    sendButton.addEventListener('click', () => {
      sentRaw.push(readRequest(editor) ?? '')
      addSubmittedQuery(chat, readRequest(editor) ?? '')
      clearEditor(editor)
    })
    const controller = createFollowUpController(vi.fn())
    controller.start()
    await flushObservers()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    const id = controller.add(candidate)
    expect(id).toBe('quote-id')
    const success = await controller.sendPromptSeparately(
      prompt,
      candidate,
    )
    await flushObservers()

    expect(success).toBe(true)
    expect(sentRaw).toEqual(['Look at quoted source'])
    expect(readRequest(editor)).toBe(originalDraft?.replace('line-1', 'preserved draft'))
    expect(editor.querySelector('[data-gpk-follow-prefix]')?.textContent).toContain('quoted source')
    expect(editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(1)
    controller.stop()
  })

  it('allows an explicit native-button retry after an unknown submission without auto-resending', async () => {
    vi.useFakeTimers()
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const binding = resolveInput(chat)!
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    const nativeClick = vi.fn()
    binding.sendButton!.addEventListener('click', nativeClick)
    const firstClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(firstClick)
    expect(firstClick.defaultPrevented).toBe(false)
    expect(nativeClick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_001)
    expect(controller.isBusy()).toBe(true)
    expect(nativeClick).toHaveBeenCalledTimes(1)

    const retryClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(retryClick)
    expect(retryClick.defaultPrevented).toBe(false)
    expect(nativeClick).toHaveBeenCalledTimes(2)
    expect(controller.isBusy()).toBe(true)
    binding.sendButton!.removeEventListener('click', nativeClick)
    controller.stop()
  })

  it('blocks a native retry when its exact query has already appeared but the editor has not cleared', async () => {
    vi.useFakeTimers()
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const binding = resolveInput(chat)!
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    const nativeClick = vi.fn()
    binding.sendButton!.addEventListener('click', nativeClick)
    binding.sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.advanceTimersByTimeAsync(15_001)
    const submittedRaw = serializeMessage([{
      id: 'quote-id', revision: 2, selectedText: 'quoted source', comment: '', anchor: candidate.anchor,
    }], readRequest(editor) ?? '')
    addSubmittedQuery(chat, submittedRaw)
    await Promise.resolve()
    const retryClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    binding.sendButton!.dispatchEvent(retryClick)
    expect(retryClick.defaultPrevented).toBe(true)
    expect(nativeClick).toHaveBeenCalledTimes(1)
    expect(controller.hasDraftCards()).toBe(true)
    expect(controller.isBusy()).toBe(true)
    binding.sendButton!.removeEventListener('click', nativeClick)
    controller.stop()
  })

  it('requires owned marker removal as the clear signal for an empty-body send', async () => {
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    expect(replaceRequestText(editor, '')).toBe(true)
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    const binding = resolveInput(chat)!
    const raw = serializeMessage([{
      id: 'quote-id', revision: 2, selectedText: 'quoted source', comment: '', anchor: candidate.anchor,
    }], '')
    binding.sendButton!.addEventListener('click', () => addSubmittedQuery(chat, raw))
    await expect(controller.requestSend()).resolves.toBe(true)
    await flushObservers()
    expect(controller.isBusy()).toBe(true)
    expect(controller.hasDraftCards()).toBe(true)

    editor.replaceChildren()
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await flushObservers()
    expect(controller.isBusy()).toBe(false)
    expect(controller.hasDraftCards()).toBe(false)
    controller.stop()
  })

  it('rolls back a separate-send readiness failure only while the attempted text is unchanged', async () => {
    vi.useFakeTimers()
    removeSubmitButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const original = readRequest(editor)!
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    const pending = controller.sendPromptSeparately(prompt, candidate)
    await vi.advanceTimersByTimeAsync(2_501)
    await expect(pending).resolves.toBe(false)
    expect(readRequest(editor)).toBe(original)
    expect(editor.contentEditable).toBe('true')
    expect(editor.querySelector('[data-gpk-follow-prefix]')?.textContent).toContain('quoted source')
    expect(controller.hasDraftCards()).toBe(true)
    controller.stop()
  })

  it('restores the backup after a late exact confirmation and observed clear', async () => {
    vi.useFakeTimers()
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const original = readRequest(editor)!
    const sendButton = chat.querySelector<HTMLButtonElement>('.send-button.submit')!
    let submittedRaw = ''
    sendButton.addEventListener('click', () => { submittedRaw = readRequest(editor) ?? '' })
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    await expect(controller.sendPromptSeparately(prompt, candidate)).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(15_001)
    expect(editor.contentEditable).toBe('true')
    addSubmittedQuery(chat, submittedRaw)
    clearEditor(editor)
    await Promise.resolve()
    await Promise.resolve()
    expect(readRequest(editor)).toBe(original)
    expect(editor.querySelector('[data-gpk-follow-prefix]')?.textContent).toContain('quoted source')
    expect(controller.hasDraftCards()).toBe(true)

    controller.stop()
  })

  it('does not overwrite a new draft after a custom send times out without exact confirmation', async () => {
    vi.useFakeTimers()
    removeStopButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const sendButton = chat.querySelector<HTMLButtonElement>('.send-button.submit')!
    sendButton.addEventListener('click', vi.fn())
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'conversation-1', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'conversation-1', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    await expect(controller.sendPromptSeparately(prompt, candidate)).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(15_001)
    const userText = 'new text typed after the uncertain send'
    const { replaceRequestText: replace } = await import('./dom')
    expect(replace(editor, userText)).toBe(true)
    controller.retryDraftRecovery()
    expect(readRequest(editor)).toBe(userText)
    expect(editor.contentEditable).toBe('true')
    controller.stop()
  })

  it('keeps a new-chat send pending through the early URL transition until its exact query appears', async () => {
    window.history.replaceState({}, '', '/app')
    removeSubmitButton()
    const chat = document.querySelector<HTMLElement>('chat-window')!
    const editor = chat.querySelector<HTMLElement>('.ql-editor')!
    const stopButton = chat.querySelector<HTMLButtonElement>('.send-button.stop')!
    const controller = createFollowUpController(vi.fn())
    controller.start()
    const candidate = {
      text: 'quoted source', scope: 'new-chat', position: { clientX: 40, clientY: 50 },
      anchor: {
        quoteId: 'quote-id', conversationId: 'new-chat', sourceMessageId: 'message-id',
        selectedText: 'quoted source', startOffset: 0, endOffset: 13, prefix: '', suffix: '',
      },
    }
    controller.add(candidate)
    const send = vi.fn(() => {
      const raw = serializeMessage([{
        id: 'quote-id', revision: 2, selectedText: 'quoted source', comment: '',
        anchor: candidate.anchor,
      }], readRequest(editor) ?? '')
      addSubmittedQuery(chat, raw)
      clearEditor(editor)
    })
    stopButton.addEventListener('click', send)
    const pending = controller.requestSend()
    await flushObservers()
    window.history.replaceState({}, '', '/app/created-chat')
    mockEventBus.emitSync('chatchange', {
      originalUrl: 'https://gemini.google.com/app',
      currentUrl: 'https://gemini.google.com/app/created-chat',
      isFromNewChat: true, timestamp: Date.now(),
    })
    expect(controller.hasDraftCards()).toBe(true)
    stopButton.classList.remove('stop')
    stopButton.classList.add('submit')
    stopButton.setAttribute('aria-label', 'Send message')
    await flushObservers()
    await expect(pending).resolves.toBe(true)
    await flushObservers()
    expect(send).toHaveBeenCalledTimes(1)
    expect(controller.hasDraftCards()).toBe(false)
    controller.stop()
  })
})
