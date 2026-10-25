import { REQUEST_HEADER, serializePrefix, type QuoteAnchor, type SelectionItem } from './protocol'

export type InputBinding = {
  chatWindow: HTMLElement
  richTextarea: HTMLElement
  editor: HTMLElement
  sendButton: HTMLElement | null
}

export type Candidate = {
  text: string
  position: { clientX: number; clientY: number }
  anchor: QuoteAnchor
  scope: string
}

export type EditorSnapshot = { content: Node[] }

const INPUT_SELECTOR = 'rich-textarea .ql-editor.textarea.new-input-ui[contenteditable]'
const SEND_SELECTOR = '[data-node-type="input-area"] .send-button-container .send-button'
const QUOTE_CONTEXT_LENGTH = 48

export function getConversationScope(locationPath = window.location.pathname): string {
  return locationPath.match(/^\/app\/([^/?#]+)/)?.[1] ?? 'new-chat'
}

export function resolveInput(chatWindow: Element | null = document.querySelector('chat-window')): InputBinding | null {
  if (!(chatWindow instanceof HTMLElement)) return null
  const editors = chatWindow.querySelectorAll<HTMLElement>(INPUT_SELECTOR)
  const buttons = chatWindow.querySelectorAll<HTMLElement>(SEND_SELECTOR)
  if (editors.length !== 1 || buttons.length > 1) return null

  const editor = editors[0]
  const richTextarea = editor.closest<HTMLElement>('rich-textarea')
  if (!richTextarea) return null
  return { chatWindow, richTextarea, editor, sendButton: buttons[0] ?? null }
}

export function resolveInputContainer(chatWindow: Element): HTMLElement | null {
  const containers = chatWindow.querySelectorAll<HTMLElement>('input-container')
  return containers.length === 1 ? containers[0] : null
}

export function resolveMessageContent(target: Element | null, chatWindow: Element): Element | null {
  const content = target?.closest('message-content') ?? null
  return content && chatWindow.contains(content) ? content : null
}

export function resolveNativeSubmitButton(binding: InputBinding): HTMLButtonElement | null {
  if (!binding.sendButton) return null
  return binding.sendButton.matches('button')
    ? binding.sendButton as HTMLButtonElement
    : binding.sendButton.querySelector<HTMLButtonElement>('button')
}

export function isReadyToSubmit(binding: InputBinding): boolean {
  const button = binding.sendButton
  if (!button?.isConnected) return false
  const interactive = button.matches('button') ? button : button.querySelector<HTMLButtonElement>('button')
  return button.classList.contains('submit')
    && button.getAttribute('aria-disabled') !== 'true'
    && interactive?.getAttribute('aria-disabled') !== 'true'
    && !(interactive instanceof HTMLButtonElement && interactive.disabled)
}

function isOwnedNode(node: Node): boolean {
  return node instanceof Element && (node.hasAttribute('data-gpk-follow-prefix')
    || node.hasAttribute('data-gpk-follow-request')
    || node.hasAttribute('data-gpk-follow-sentinel'))
}

function readPlainEditorChildren(editor: HTMLElement): string | null {
  if ([...editor.childNodes].some(child => child.nodeType !== Node.ELEMENT_NODE
    && child.textContent?.trim() !== '')) return null
  const paragraphs = [...editor.children].filter((child): child is HTMLElement => !isOwnedNode(child))
  if (paragraphs.some(child => child.tagName !== 'P')) return null
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if ([...paragraph.childNodes].some(child => child.nodeType !== Node.TEXT_NODE
      && !(child instanceof HTMLBRElement))) return null
    if (paragraph.childNodes.length === 1 && paragraph.firstChild instanceof HTMLBRElement) {
      lines.push('')
      continue
    }
    lines.push([...paragraph.childNodes].map(child => child instanceof HTMLBRElement ? '\n' : child.textContent ?? '').join(''))
  }
  return lines.join('\n')
}

export function readRequest(editor: HTMLElement): string | null {
  return readPlainEditorChildren(editor)
}

function makeHiddenNode(text: string, attribute: 'data-gpk-follow-prefix' | 'data-gpk-follow-request' | 'data-gpk-follow-sentinel'): HTMLParagraphElement {
  const node = document.createElement('p')
  node.setAttribute(attribute, '')
  node.contentEditable = 'false'
  node.style.display = 'none'
  node.style.userSelect = 'none'
  node.style.pointerEvents = 'none'
  if (text) node.textContent = text
  else node.append(document.createElement('br'))
  return node
}

export function syncRequestHeading(editor: HTMLElement, hasSelections: boolean): void {
  const heading = [...editor.children].find(node => node.hasAttribute('data-gpk-follow-request'))
  const request = readRequest(editor)
  if (!hasSelections || request !== null && !request.trim()) {
    heading?.remove()
    return
  }
  if (request === null) return
  // The paragraph boundary supplies the single newline before the visible request.
  const node = heading ?? makeHiddenNode(REQUEST_HEADER, 'data-gpk-follow-request')
  const firstRequestNode = [...editor.children].find(child => !isOwnedNode(child)) ?? null
  if (node.nextSibling !== firstRequestNode || node.parentNode !== editor) editor.insertBefore(node, firstRequestNode)
}

export function writePrefix(editor: HTMLElement, items: readonly SelectionItem[]): boolean {
  const request = readRequest(editor)
  const existingPrefix = [...editor.children].find(node => node.hasAttribute('data-gpk-follow-prefix')) as HTMLElement | undefined
  const existingSentinels = new Map([...editor.children]
    .filter(node => node.hasAttribute('data-gpk-follow-sentinel'))
    .map(node => [node.getAttribute('data-gpk-follow-sentinel') ?? '', node as HTMLElement]))
  if (!items.length) {
    existingPrefix?.remove()
    existingSentinels.forEach(node => node.remove())
    syncRequestHeading(editor, false)
    return request === null || readRequest(editor) === request
  }
  if (request === null) return false
  const prefix = serializePrefix(items)

  if (existingPrefix) {
    if (existingPrefix.textContent !== prefix) existingPrefix.textContent = prefix
  }
  else editor.prepend(makeHiddenNode(prefix, 'data-gpk-follow-prefix'))

  const retainedIds = new Set(items.map(item => item.id))
  existingSentinels.forEach((node, id) => { if (!retainedIds.has(id)) node.remove() })
  for (const item of items) {
    if (existingSentinels.has(item.id)) continue
    const sentinel = makeHiddenNode('', 'data-gpk-follow-sentinel')
    sentinel.setAttribute('data-gpk-follow-sentinel', item.id)
    existingSentinels.set(item.id, sentinel)
  }
  syncRequestHeading(editor, true)
  const firstRequestNode = [...editor.children].find(child => child.hasAttribute('data-gpk-follow-request') || !isOwnedNode(child)) ?? null
  let nextNode: Node | null = firstRequestNode
  for (const item of [...items].reverse()) {
    const sentinel = existingSentinels.get(item.id)
    if (!sentinel) continue
    if (sentinel.nextSibling !== nextNode) editor.insertBefore(sentinel, nextNode)
    nextNode = sentinel
  }
  return readRequest(editor) === request
}

export function appendRequestText(editor: HTMLElement, text: string): boolean {
  const original = readRequest(editor)
  if (original === null) return false
  const next = original ? `${original}\n${text}` : text
  const nodes = [...editor.children].filter(child => !isOwnedNode(child))
  const fragment = document.createDocumentFragment()
  text.split('\n').forEach(line => {
    const paragraph = document.createElement('p')
    paragraph.textContent = line
    fragment.append(paragraph)
  })
  if (!original && nodes.length === 1 && nodes[0].tagName === 'P'
    && nodes[0].textContent === '' && (nodes[0].childNodes.length === 0
      || nodes[0].childNodes.length === 1 && nodes[0].firstChild instanceof HTMLBRElement)) nodes[0].remove()
  editor.append(fragment)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
  return readRequest(editor) === next
}

export function captureEditorDraft(editor: HTMLElement): EditorSnapshot {
  return {
    content: [...editor.childNodes].map(node => node.cloneNode(true)),
  }
}

export function restoreEditorDraft(editor: HTMLElement, snapshot: EditorSnapshot): boolean {
  if (readRequest(editor) !== '') return false
  replaceEditorContent(editor, snapshot.content.map(node => node.cloneNode(true)))
  return true
}

function replaceEditorContent(editor: HTMLElement, content: Node[]): void {
  editor.replaceChildren(...content)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

export function replaceRequestText(editor: HTMLElement, text: string): boolean {
  const fragment = document.createDocumentFragment()
  text.split('\n').forEach(line => {
    const paragraph = document.createElement('p')
    paragraph.textContent = line
    fragment.append(paragraph)
  })
  replaceEditorContent(editor, [...editor.childNodes].filter(isOwnedNode).concat([...fragment.childNodes]))
  return readRequest(editor) === text
}

export function observeSubmissionClearTransition(
  editor: HTMLElement,
  submittedRequest: string,
  onClearTransition: () => void,
): () => void {
  let previous = readRequest(editor)
  if (!submittedRequest || previous !== submittedRequest) return () => undefined
  const checkTransition = () => {
    const current = readRequest(editor)
    if (previous === submittedRequest && current === '') {
      observer.disconnect()
      editor.removeEventListener('input', checkTransition)
      onClearTransition()
    }
    previous = current
  }
  const observer = new MutationObserver(checkTransition)
  observer.observe(editor, { childList: true, characterData: true, subtree: true })
  editor.addEventListener('input', checkTransition)
  return () => {
    observer.disconnect()
    editor.removeEventListener('input', checkTransition)
  }
}

export function observeFollowUpClearTransition(
  editor: HTMLElement,
  selectionIds: readonly string[],
  onClearTransition: () => void,
): () => void {
  const hasSubmittedMarkers = () => editor.hasAttribute('data-gpk-follow-prefix')
    || editor.querySelector('[data-gpk-follow-prefix]') !== null
    || selectionIds.some(id => [...editor.querySelectorAll<HTMLElement>('[data-gpk-follow-sentinel]')]
      .some(node => node.getAttribute('data-gpk-follow-sentinel') === id))
  const hadMarkers = hasSubmittedMarkers()
  if (!hadMarkers) return () => undefined
  const checkTransition = () => {
    if (hasSubmittedMarkers()) return
    observer.disconnect()
    editor.removeEventListener('input', checkTransition)
    onClearTransition()
  }
  const observer = new MutationObserver(checkTransition)
  observer.observe(editor, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-gpk-follow-prefix', 'data-gpk-follow-sentinel'] })
  editor.addEventListener('input', checkTransition)
  return () => {
    observer.disconnect()
    editor.removeEventListener('input', checkTransition)
  }
}

export function captureCandidate(range: Range, messageContent: Element, position: Candidate['position']): Candidate | null {
  if (!messageContent.contains(range.startContainer) || !messageContent.contains(range.endContainer)) return null
  const text = range.toString()
  if (!text.trim()) return null

  const startRange = document.createRange()
  startRange.selectNodeContents(messageContent)
  startRange.setEnd(range.startContainer, range.startOffset)
  const startOffset = startRange.toString().length
  const messageText = messageContent.textContent ?? ''
  const endOffset = startOffset + text.length
  const quoteId = globalThis.crypto?.randomUUID?.() ?? `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (!messageContent.id && !messageContent.hasAttribute('data-gpk-quote-source-id')) {
    messageContent.setAttribute('data-gpk-quote-source-id', `gpk-message-${quoteId}`)
  }

  return {
    text,
    position,
    scope: getConversationScope(),
    anchor: {
      quoteId,
      conversationId: getConversationScope(),
      sourceMessageId: messageContent.id || messageContent.getAttribute('data-gpk-quote-source-id')!,
      selectedText: text,
      startOffset,
      endOffset,
      prefix: messageText.slice(Math.max(0, startOffset - QUOTE_CONTEXT_LENGTH), startOffset),
      suffix: messageText.slice(endOffset, endOffset + QUOTE_CONTEXT_LENGTH),
    },
  }
}

export function readRawQuery(userQuery: Element): string | null {
  const queryText = userQuery.querySelector('.query-text')
  if (!queryText) return null
  const lines = queryText.querySelectorAll<HTMLElement>('p.query-text-line')
  if (!lines.length) return null
  return [...lines].filter(line => !line.hasAttribute('data-gpk-follow-display'))
    .map(readQueryLineText).join('\n')
}

function readQueryLineText(line: HTMLElement): string {
  const nodes = [...line.childNodes]
  return nodes.map((node, index) => {
    if (node.nodeType === Node.COMMENT_NODE) return ''
    const text = node.textContent ?? ''
    // Gemini's observed interpolation template adds one space on each side,
    // between two comment anchors. Remove only that envelope, not user whitespace.
    const isInterpolation = node.nodeType === Node.TEXT_NODE
      && nodes[index - 2]?.nodeType === Node.COMMENT_NODE
      && nodes[index - 1]?.nodeType === Node.COMMENT_NODE
      && nodes[index + 1]?.nodeType === Node.COMMENT_NODE
      && nodes[index + 2]?.nodeType === Node.COMMENT_NODE
    return isInterpolation && text.startsWith(' ') && text.endsWith(' ') && text.length >= 2
      ? text.slice(1, -1)
      : text
  }).join('')
}

export function listUserQueries(chatWindow: Element): Element[] {
  return [...chatWindow.querySelectorAll('user-query')]
}

export function queriesAffectedBy(records: readonly MutationRecord[], root: Element): Set<Element> {
  const result = new Set<Element>()
  for (const record of records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement
    const closest = target?.closest('user-query')
    if (closest && root.contains(closest)) result.add(closest)
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue
      if (node.matches('user-query')) result.add(node)
      node.querySelectorAll('user-query').forEach(query => result.add(query))
      const parent = node.closest('user-query')
      if (parent && root.contains(parent)) result.add(parent)
    }
  }
  return result
}

export function removedUserQueries(records: readonly MutationRecord[]): Element[] {
  const result = new Set<Element>()
  for (const record of records) for (const node of record.removedNodes) {
    if (!(node instanceof Element)) continue
    if (node.matches('user-query')) result.add(node)
    node.querySelectorAll('user-query').forEach(query => result.add(query))
  }
  return [...result]
}

export function chatWindowAddedOrRemoved(records: readonly MutationRecord[]): boolean {
  return records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
    node instanceof Element && (node.matches('chat-window') || node.querySelector('chat-window'))))
}

export function inputStructureChanged(records: readonly MutationRecord[]): boolean {
  const selector = 'rich-textarea, .ql-editor.textarea.new-input-ui[contenteditable], [data-node-type="input-area"], .send-button-container, .send-button'
  const isInput = (element: Element) => element.matches(selector) || !!element.querySelector(selector)
  return records.some(record => {
    if (record.type !== 'childList') return false
    const target = record.target instanceof Element ? record.target : record.target.parentElement
    if (target && isInput(target)) return true
    return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && isInput(node))
  })
}

export function findQueryBySentinel(editor: Element, id: string): Element | null {
  const matches = [...editor.querySelectorAll('[data-gpk-follow-sentinel]')]
    .filter(node => node.getAttribute('data-gpk-follow-sentinel') === id)
  return matches.length === 1 ? matches[0] : null
}

export function currentSentinelIds(editor: Element): string[] {
  return [...editor.querySelectorAll('[data-gpk-follow-sentinel]')]
    .map(node => node.getAttribute('data-gpk-follow-sentinel'))
    .filter((id): id is string => !!id)
}

export function removedSentinelIds(records: readonly MutationRecord[]): string[] {
  const ids = new Set<string>()
  for (const record of records) for (const node of record.removedNodes) {
    if (!(node instanceof Element) || !node.hasAttribute('data-gpk-follow-sentinel')) continue
    const id = node.getAttribute('data-gpk-follow-sentinel')
    if (id) ids.add(id)
  }
  return [...ids]
}

export function findCurrentChatWindow(): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>('chat-window')
  return matches.length === 1 ? matches[0] : null
}

export function attachSelectionAnchors(query: Element, anchors: readonly (QuoteAnchor | undefined)[]): void {
  queryAnchors.set(query, anchors.map(anchor => anchor ? { ...anchor } : undefined))
}

const HIGHLIGHT_NAME = 'gemini-power-kit-quote-highlight'
let highlightTimer: ReturnType<typeof setTimeout> | null = null
let fallbackHighlightRange: Range | null = null
const queryAnchors = new WeakMap<Element, readonly (QuoteAnchor | undefined)[]>()

export function hasQuoteAnchor(query: Element, selectionIndex: number): boolean {
  return !!queryAnchors.get(query)?.[selectionIndex] || (selectionIndex === 0 && !!readLegacyAnchor(query))
}

export function jumpToQuoteSource(query: Element, selectionIndex: number): boolean {
  const anchor = queryAnchors.get(query)?.[selectionIndex]
    ?? (selectionIndex === 0 ? parseLegacyAnchor(query) : undefined)
  if (!anchor) return false
  return jumpToQuoteAnchor(anchor)
}

function resolveQuoteAnchorSource(anchor: QuoteAnchor): Element | null {
  if (!anchor.sourceMessageId || anchor.conversationId !== getConversationScope()) return null
  const chat = document.querySelector('chat-window')
  if (!chat) return null
  const sources = [...chat.querySelectorAll('message-content')].filter(message =>
    message.id === anchor.sourceMessageId || message.getAttribute('data-gpk-quote-source-id') === anchor.sourceMessageId)
  if (sources.length !== 1) return null
  return sources[0]
}

function resolveQuoteAnchorRange(anchor: QuoteAnchor): Range | null {
  const source = resolveQuoteAnchorSource(anchor)
  return source ? resolveAnchorRange(source, anchor) : null
}

export type QuoteCommentPosition = Candidate['position'] & { bottom?: number }

export function readQuoteAnchorPosition(anchor: QuoteAnchor): QuoteCommentPosition | null {
  const range = resolveQuoteAnchorRange(anchor)
  if (!range) return null
  const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  for (let element = range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    const bounds = element.getBoundingClientRect()
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
      viewport.left = Math.max(viewport.left, bounds.left)
      viewport.right = Math.min(viewport.right, bounds.right)
    }
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
      viewport.top = Math.max(viewport.top, bounds.top)
      viewport.bottom = Math.min(viewport.bottom, bounds.bottom)
    }
  }
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0
    && rect.bottom > viewport.top && rect.top < viewport.bottom
    && rect.right > viewport.left && rect.left < viewport.right)
  if (!rects.length) return null
  const left = Math.max(viewport.left, Math.min(...rects.map(rect => rect.left)))
  const right = Math.min(viewport.right, Math.max(...rects.map(rect => rect.right)))
  return {
    clientX: (left + right) / 2,
    clientY: Math.max(viewport.top, Math.min(...rects.map(rect => rect.top))),
    bottom: Math.min(viewport.bottom, Math.max(...rects.map(rect => rect.bottom))),
  }
}

export function readQuoteAnchorEndPosition(anchor: QuoteAnchor): Candidate['position'] | null {
  const range = resolveQuoteAnchorRange(anchor)
  if (!range) return null
  const end = range.cloneRange()
  end.collapse(false)
  const caretRect = end.getClientRects()[0]
  const rect = caretRect?.height > 0 ? caretRect : [...range.getClientRects()].filter(rect => rect.height > 0).at(-1)
  if (!rect || rect.right < 0 || rect.right > window.innerWidth || rect.bottom <= 0 || rect.top >= window.innerHeight) return null

  // Fixed markers must disappear when their source scrolls behind a clipped ancestor.
  for (let element = range.endContainer.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX)
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY)
    if (!clipsX && !clipsY) continue
    const bounds = element.getBoundingClientRect()
    if ((clipsX && (rect.right < bounds.left || rect.right > bounds.right))
      || (clipsY && (rect.bottom <= bounds.top || rect.top >= bounds.bottom))) return null
  }
  return { clientX: rect.right, clientY: rect.top }
}

export function observeQuoteAnchorLayout(anchors: readonly QuoteAnchor[], onChange: () => void): () => void {
  let frame: number | null = null
  const schedule = () => {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      onChange()
    })
  }
  const chat = findCurrentChatWindow()
  const mutations = new MutationObserver(schedule)
  const resize = new ResizeObserver(schedule)
  if (chat) {
    mutations.observe(chat, { childList: true, subtree: true, characterData: true })
    resize.observe(chat)
    for (const anchor of anchors) {
      const source = resolveQuoteAnchorSource(anchor)
      if (source) resize.observe(source)
    }
  }
  document.addEventListener('scroll', schedule, true)
  window.addEventListener('resize', schedule)
  return () => {
    mutations.disconnect()
    resize.disconnect()
    document.removeEventListener('scroll', schedule, true)
    window.removeEventListener('resize', schedule)
    if (frame !== null) cancelAnimationFrame(frame)
  }
}

export function jumpToQuoteAnchor(anchor: QuoteAnchor, behavior: ScrollBehavior = 'smooth'): boolean {
  const range = resolveQuoteAnchorRange(anchor)
  if (!range) return false
  range.startContainer.parentElement?.scrollIntoView?.({ behavior, block: 'center' })
  showQuoteHighlight(range, 2_000)
  return true
}

export function highlightQuoteAnchor(anchor: QuoteAnchor): boolean {
  const range = resolveQuoteAnchorRange(anchor)
  if (!range) return false
  showQuoteHighlight(range, null)
  return true
}

function showQuoteHighlight(range: Range, duration: number | null): void {
  clearQuoteHighlight()
  if (globalThis.CSS?.highlights && globalThis.Highlight) {
    globalThis.CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
  } else {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fallbackHighlightRange = range.cloneRange()
  }
  if (duration !== null) highlightTimer = setTimeout(clearQuoteHighlight, duration)
}

export function clearQuoteHighlight(): void {
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = null
  globalThis.CSS?.highlights?.delete(HIGHLIGHT_NAME)
  clearFallbackSelection()
}

function clearFallbackSelection(): void {
  const selection = window.getSelection()
  if (!fallbackHighlightRange || !selection || selection.rangeCount !== 1) {
    fallbackHighlightRange = null
    return
  }
  const current = selection.getRangeAt(0)
  if (current.compareBoundaryPoints(Range.START_TO_START, fallbackHighlightRange) === 0
    && current.compareBoundaryPoints(Range.END_TO_END, fallbackHighlightRange) === 0) selection.removeAllRanges()
  fallbackHighlightRange = null
}

function resolveAnchorRange(source: Element, anchor: QuoteAnchor): Range | null {
  const exact = rangeFromTextOffsets(source, anchor.startOffset, anchor.endOffset)
  if (exact?.toString() === anchor.selectedText) return exact
  const text = source.textContent ?? ''
  const ranges: Range[] = []
  let searchFrom = 0
  while (searchFrom <= text.length) {
    const index = text.indexOf(anchor.selectedText, searchFrom)
    if (index < 0) break
    const prefix = anchor.prefix
    const suffix = anchor.suffix
    if ((!prefix || text.slice(Math.max(0, index - prefix.length), index).endsWith(prefix))
      && (!suffix || text.slice(index + anchor.selectedText.length).startsWith(suffix))) {
      const match = rangeFromTextOffsets(source, index, index + anchor.selectedText.length)
      if (match) ranges.push(match)
    }
    searchFrom = index + Math.max(1, anchor.selectedText.length)
  }
  return ranges.length === 1 ? ranges[0] : null
}

function rangeFromTextOffsets(root: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let cursor = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const length = node.textContent?.length ?? 0
    // A start on a text boundary belongs to the next node; the previous node's
    // trailing caret can add an unrelated line to the range's layout rectangles.
    if (!startNode && start < cursor + length) {
      startNode = node
      startOffset = Math.max(0, start - cursor)
    }
    if (!endNode && end <= cursor + length) {
      endNode = node
      endOffset = Math.max(0, end - cursor)
      break
    }
    cursor += length
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

function parseLegacyAnchor(query: Element): QuoteAnchor | undefined {
  const raw = readLegacyAnchor(query)
  if (!raw) return undefined
  try { return JSON.parse(raw) as QuoteAnchor } catch { return undefined }
}

function readLegacyAnchor(query: Element): string | null {
  const data = (query as HTMLElement).dataset
  if (!data.quoteId || !data.quoteSourceMessageId || !data.quoteConversationId || !data.quoteSelectedText) return null
  return JSON.stringify({
    quoteId: data.quoteId,
    sourceMessageId: data.quoteSourceMessageId,
    conversationId: data.quoteConversationId,
    selectedText: data.quoteSelectedText,
    startOffset: Number(data.quoteStartOffset),
    endOffset: Number(data.quoteEndOffset),
    prefix: data.quotePrefix ?? '',
    suffix: data.quoteSuffix ?? '',
  } satisfies QuoteAnchor)
}

export function resolveQueryText(userQuery: Element): HTMLElement | null {
  return userQuery.querySelector<HTMLElement>('.query-text')
}

export function readQueryLines(userQuery: Element): HTMLElement[] {
  return [...(resolveQueryText(userQuery)?.querySelectorAll<HTMLElement>('p.query-text-line') ?? [])]
}

export function findNewMatchingQuery(chatWindow: Element, baseline: WeakSet<Element>, raw: string): Element | null {
  const matches = [...chatWindow.querySelectorAll('user-query')]
    .filter(query => !baseline.has(query) && readRawQuery(query) === raw)
  return matches.length === 1 ? matches[0] : null
}

export function baselineQueries(chatWindow: Element): WeakSet<Element> {
  const result = new WeakSet<Element>()
  chatWindow.querySelectorAll('user-query').forEach(query => result.add(query))
  return result
}
