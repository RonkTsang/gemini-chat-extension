import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHistoryAnchorTracker } from './history-anchors'
import { hasQuoteAnchor, jumpToQuoteSource } from './dom'
import { serializeMessage, type SelectionItem } from './protocol'

const selection = (id: string, text = 'same source'): SelectionItem => ({
  id, revision: 1, selectedText: text, comment: 'comment',
  anchor: { quoteId: id, conversationId: 'chat', sourceMessageId: id, selectedText: text,
    startOffset: 0, endOffset: text.length, prefix: '', suffix: '' },
})

function query(chat: Element, items: SelectionItem[], request = ''): Element {
  const node = document.createElement('user-query')
  const text = document.createElement('div')
  text.className = 'query-text'
  for (const line of serializeMessage(items, request).split('\n')) {
    const row = document.createElement('p')
    row.className = 'query-text-line'
    row.textContent = line
    text.append(row)
  }
  node.append(text)
  chat.append(node)
  return node
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('optional history source association', () => {
  it.each([false, true])('links sources before or after draft cleanup (clear first: %s)', clearFirst => {
    const tracker = createHistoryAnchorTracker()
    const chat = document.createElement('chat-window')
    document.body.append(chat)
    const items = [selection('a'), selection('b', 'second source')]
    const oldQuery = query(chat, items)
    tracker.update(items, chat, 'chat')
    if (clearFirst) tracker.retire()
    const submitted = query(chat, items, 'native request formatting is independent')
    tracker.link(oldQuery, 'chat')
    tracker.link(submitted, 'chat')
    expect(hasQuoteAnchor(oldQuery, 0)).toBe(false)
    expect(hasQuoteAnchor(submitted, 0)).toBe(true)
    expect(hasQuoteAnchor(submitted, 1)).toBe(true)
  })

  it('does not guess when identical selections have different source anchors', () => {
    const tracker = createHistoryAnchorTracker()
    const chat = document.createElement('chat-window')
    tracker.update([selection('a')], chat, 'chat')
    tracker.retire()
    tracker.update([selection('b')], chat, 'chat')
    const submitted = query(chat, [selection('a')])
    tracker.link(submitted, 'chat')
    expect(hasQuoteAnchor(submitted, 0)).toBe(false)
  })

  it('expires cleared snapshots and never links them to another conversation', () => {
    vi.useFakeTimers()
    const tracker = createHistoryAnchorTracker()
    const chat = document.createElement('chat-window')
    tracker.update([selection('a')], chat, 'chat')
    tracker.retire()
    const submitted = query(chat, [selection('a')])
    tracker.link(submitted, 'other-chat')
    expect(hasQuoteAnchor(submitted, 0)).toBe(false)
    vi.advanceTimersByTime(15_001)
    tracker.link(submitted, 'chat')
    expect(hasQuoteAnchor(submitted, 0)).toBe(false)
  })

  it('updates an already linked anchor after the new-chat URL is assigned', () => {
    const tracker = createHistoryAnchorTracker()
    const chat = document.createElement('chat-window')
    document.body.append(chat)
    const source = document.createElement('message-content')
    source.id = 'a'
    source.textContent = 'same source'
    chat.append(source)
    const item = selection('a')
    item.anchor!.conversationId = 'new-chat'
    tracker.update([item], chat, 'new-chat')
    const submitted = query(chat, [item])
    tracker.link(submitted, 'new-chat')
    tracker.retire()
    tracker.migrate('new-chat', 'created', chat)
    window.history.replaceState({}, '', '/app/created')
    expect(jumpToQuoteSource(submitted, 0)).toBe(true)
  })
})
