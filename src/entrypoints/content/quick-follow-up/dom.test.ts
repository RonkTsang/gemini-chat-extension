import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appendRequestText,
  attachSelectionAnchors,
  captureEditorDraft,
  captureCandidate,
  hasQuoteAnchor,
  isReadyToSubmit,
  readQueryLines,
  readRawQuery,
  readRequest,
  readQuoteAnchorEndPosition,
  readQuoteAnchorPosition,
  observeQuoteAnchorLayout,
  resolveQueryText,
  replaceRequestText,
  resolveInput,
  resolveNativeSubmitButton,
  inputStructureChanged,
  restoreEditorDraft,
  syncRequestHeading,
  writePrefix,
} from './dom'
import { serializePrefix, type SelectionItem } from './protocol'

const inputFixture = readFileSync(resolve(process.cwd(), 'docs/dom/input.html'), 'utf8')
const currentInputFixture = readFileSync(resolve(process.cwd(), 'docs/dom/input-2026-10-24.html'), 'utf8')

const selections: SelectionItem[] = [
  { id: 'selection-a', revision: 1, selectedText: 'first source', comment: 'first comment' },
  { id: 'selection-b', revision: 1, selectedText: 'second source', comment: '' },
]

describe('Follow-up editor DOM adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = inputFixture
    window.history.replaceState({}, '', '/app/conversation-1')
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('resolves the unique editor and active Send button from the Gemini fixture', () => {
    removeStopButton()
    const binding = resolveInput()

    expect(binding).not.toBeNull()
    expect(binding?.chatWindow.matches('chat-window')).toBe(true)
    expect(binding?.richTextarea.matches('rich-textarea')).toBe(true)
    expect(binding?.editor.matches('.ql-editor.textarea.new-input-ui[contenteditable="true"]')).toBe(true)
    expect(binding?.sendButton!.getAttribute('aria-label')).toBe('Send message')
    expect(isReadyToSubmit(binding!)).toBe(true)
  })

  it('captures and restores the current empty composer without inspecting surrounding controls', () => {
    document.body.innerHTML = currentInputFixture
    const binding = resolveInput()!
    const original = binding.editor.innerHTML
    const snapshot = captureEditorDraft(binding.editor)

    replaceRequestText(binding.editor, 'custom prompt')
    replaceRequestText(binding.editor, '')
    expect(restoreEditorDraft(binding.editor, snapshot)).toBe(true)
    expect(binding.editor.innerHTML).toBe(original)
  })

  it('restores formatted content and selected text from an independent snapshot', () => {
    removeStopButton()
    const { editor } = resolveInput()!
    editor.innerHTML = '<p><strong>formatted</strong> draft</p><p><br></p><p>last line</p>'
    const original = editor.innerHTML
    const range = document.createRange()
    range.selectNodeContents(editor.querySelector('strong')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const snapshot = captureEditorDraft(editor)
    editor.querySelector('strong')!.textContent = 'changed after capture'

    expect(replaceRequestText(editor, 'custom prompt')).toBe(true)
    expect(replaceRequestText(editor, '')).toBe(true)
    expect(restoreEditorDraft(editor, snapshot)).toBe(true)
    expect(editor.innerHTML).toBe(original)
  })

  it('does not overwrite a new plain or formatted draft during restoration', () => {
    removeStopButton()
    const { editor } = resolveInput()!
    const snapshot = captureEditorDraft(editor)
    for (const html of ['<p>new draft</p>', '<p><strong>new draft</strong></p>']) {
      editor.innerHTML = html
      expect(restoreEditorDraft(editor, snapshot)).toBe(false)
      expect(editor.innerHTML).toBe(html)
    }
  })

  it('resolves the unique Stop button but does not treat it as ready to submit', () => {
    document.querySelector('.send-button.submit')?.closest('.send-button-container')?.remove()
    const binding = resolveInput()

    expect(binding?.sendButton!.getAttribute('aria-label')).toBe('Stop response')
    expect(isReadyToSubmit(binding!)).toBe(false)
  })

  it('binds an editor without Send while refusing ambiguous send controls', () => {
    expect(resolveInput()).toBeNull()
    document.querySelectorAll('.send-button-container').forEach(node => node.remove())
    const binding = resolveInput()!
    expect(binding).not.toBeNull()
    expect(binding.sendButton).toBeNull()
    expect(isReadyToSubmit(binding)).toBe(false)
    expect(resolveNativeSubmitButton(binding)).toBeNull()
  })

  it('reconciles native send controls when only the button subtree changes', () => {
    removeStopButton()
    const container = document.querySelector('.send-button-container')!
    const observer = new MutationObserver(() => undefined)
    observer.observe(container, { childList: true })
    container.replaceChildren()
    expect(inputStructureChanged(observer.takeRecords())).toBe(true)
    observer.disconnect()
  })

  it('keeps request text, sentinel identity and prefix order stable across updates', () => {
    removeStopButton()
    const binding = resolveInput()!
    const originalRequest = 'line-1\nline-2'
    const input = vi.fn()
    binding.editor.addEventListener('input', input)

    expect(readRequest(binding.editor)).toBe(originalRequest)
    expect(writePrefix(binding.editor, selections)).toBe(true)
    expect(readRequest(binding.editor)).toBe(originalRequest)
    expect([...binding.editor.children].map(node => node.getAttribute('data-gpk-follow-sentinel')).filter(Boolean))
      .toEqual(['selection-a', 'selection-b'])
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')?.textContent).toBe(serializePrefix(selections))

    const updated = [selections[1], { ...selections[0], comment: 'updated comment', revision: 2 }]
    expect(writePrefix(binding.editor, updated)).toBe(true)
    expect(readRequest(binding.editor)).toBe(originalRequest)
    expect([...binding.editor.children].map(node => node.getAttribute('data-gpk-follow-sentinel')).filter(Boolean))
      .toEqual(['selection-b', 'selection-a'])
    expect(binding.editor.querySelectorAll('[data-gpk-follow-prefix]')).toHaveLength(1)
    expect(binding.editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(2)

    expect(writePrefix(binding.editor, [])).toBe(true)
    expect(readRequest(binding.editor)).toBe(originalRequest)
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(binding.editor.querySelector('[data-gpk-follow-request]')).toBeNull()
    expect(binding.editor.querySelectorAll('[data-gpk-follow-sentinel]')).toHaveLength(0)
    expect(input).not.toHaveBeenCalled()
  })

  it('adds a separate heading only for nonblank request text without changing native paragraphs or sentinels', () => {
    removeStopButton()
    const { editor } = resolveInput()!
    replaceRequestText(editor, '')
    writePrefix(editor, selections)
    const sentinel = editor.querySelector('[data-gpk-follow-sentinel]')
    const paragraph = editor.lastElementChild!
    expect(editor.querySelector('[data-gpk-follow-request]')).toBeNull()

    for (const text of ['request', '', ' \t', '  new request']) {
      paragraph.textContent = text
      syncRequestHeading(editor, true)
      expect(readRequest(editor)).toBe(text)
      expect(editor.querySelector('[data-gpk-follow-sentinel]')).toBe(sentinel)
      const heading = editor.querySelector('[data-gpk-follow-request]')
      expect(Boolean(heading)).toBe(Boolean(text.trim()))
      if (heading) {
        expect(heading.textContent).toBe('## My request:')
        expect(heading.nextSibling).toBe(paragraph)
        expect(heading.previousSibling?.nodeType).toBe(Node.ELEMENT_NODE)
        expect((heading.previousSibling as Element).hasAttribute('data-gpk-follow-sentinel')).toBe(true)
      }
    }
    writePrefix(editor, [])
    expect(editor.children).toHaveLength(1)
    expect(editor.firstElementChild).toBe(paragraph)
  })

  it('appends multiline request text after an empty placeholder and restores the content', () => {
    removeStopButton()
    const binding = resolveInput()!
    binding.editor.replaceChildren(Object.assign(document.createElement('p'), { innerHTML: '<br>' }))

    expect(readRequest(binding.editor)).toBe('')
    expect(appendRequestText(binding.editor, 'added one\nadded two')).toBe(true)
    expect(readRequest(binding.editor)).toBe('added one\nadded two')

    const paragraphText = binding.editor.querySelector('p')?.firstChild
    expect(paragraphText?.textContent).toBe('added one')
    const range = document.createRange()
    range.setStart(paragraphText!, 3)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    const snapshot = captureEditorDraft(binding.editor)
    expect(replaceRequestText(binding.editor, '')).toBe(true)
    expect(restoreEditorDraft(binding.editor, snapshot!)).toBe(true)
    expect(readRequest(binding.editor)).toBe('added one\nadded two')
  })

  it('rejects rich editor content without changing it or inserting Follow-up nodes', () => {
    removeStopButton()
    const binding = resolveInput()!
    const paragraph = binding.editor.querySelector('p')!
    const richText = document.createElement('span')
    richText.textContent = 'formatted'
    paragraph.append(richText)
    const originalHTML = binding.editor.innerHTML

    expect(readRequest(binding.editor)).toBeNull()
    expect(writePrefix(binding.editor, selections)).toBe(false)
    expect(appendRequestText(binding.editor, 'additional text')).toBe(false)
    expect(binding.editor.innerHTML).toBe(originalHTML)
    expect(binding.editor.querySelector('[data-gpk-follow-prefix]')).toBeNull()
    expect(binding.editor.querySelector('[data-gpk-follow-sentinel]')).toBeNull()
  })

  it('reads history rows and keeps source anchors in extension-owned memory', () => {
    const query = document.createElement('user-query')
    query.innerHTML = '<div class="query-text"><p class="query-text-line">request one</p><p class="query-text-line">request two</p></div>'
    document.body.append(query)
    const anchor = {
      quoteId: 'quote-a',
      conversationId: 'conversation-1',
      sourceMessageId: 'source-a',
      selectedText: 'source text',
      startOffset: 4,
      endOffset: 15,
      prefix: 'before',
      suffix: 'after',
    }

    expect(resolveQueryText(query)?.className).toBe('query-text')
    expect(readQueryLines(query).map(line => line.textContent)).toEqual(['request one', 'request two'])
    expect(readRawQuery(query)).toBe('request one\nrequest two')
    attachSelectionAnchors(query, [anchor])
    expect(hasQuoteAnchor(query, 0)).toBe(true)
    expect(hasQuoteAnchor(query, 1)).toBe(false)
    expect(query.hasAttribute('data-gpk-follow-anchor-0')).toBe(false)
  })

  it('places a multiline source marker at the selection end without changing the source DOM', () => {
    const source = document.createElement('message-content')
    source.innerHTML = '<p>first line</p><p>last <strong>line</strong></p>'
    document.querySelector('chat-window')!.append(source)
    const selection = document.createRange()
    selection.selectNodeContents(source)
    const candidate = captureCandidate(selection, source, { clientX: 20, clientY: 50 })!
    const original = source.innerHTML
    const first = new DOMRect(20, 50, 100, 20)
    const last = new DOMRect(20, 80, 40, 20)
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
      const rects = this.collapsed ? [] : [first, last]
      return Object.assign(rects, { item: (index: number) => rects[index] ?? null })
    })
    expect(readQuoteAnchorEndPosition(candidate.anchor)).toEqual({ clientX: 60, clientY: 80 })
    expect(readQuoteAnchorPosition(candidate.anchor)).toEqual({ clientX: 70, clientY: 50, bottom: 100 })
    expect(source.innerHTML).toBe(original)

    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    source.before(scroller)
    scroller.append(source)
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 120, 400, 200))
    expect(readQuoteAnchorEndPosition(candidate.anchor)).toBeNull()
    expect(readQuoteAnchorPosition(candidate.anchor)).toBeNull()
    vi.mocked(scroller.getBoundingClientRect).mockReturnValue(new DOMRect(0, 75, 400, 200))
    expect(readQuoteAnchorPosition(candidate.anchor)).toEqual({ clientX: 40, clientY: 80, bottom: 100 })
    scroller.style.overflowY = 'visible'
    source.remove()
    expect(readQuoteAnchorEndPosition(candidate.anchor)).toBeNull()
  })

  it('starts a quote at its own text node instead of the end of the preceding paragraph', () => {
    const source = document.createElement('message-content')
    source.innerHTML = '<p>The most useful shortcuts for daily research include:</p>'
      + '<ul><li><strong>New Chat / Focus Prompt:</strong> Start fresh research threads.</li></ul>'
    document.querySelector('chat-window')!.append(source)
    const selectedText = source.querySelector('strong')!.firstChild!
    const selection = document.createRange()
    selection.selectNodeContents(selectedText)
    const candidate = captureCandidate(selection, source, { clientX: 200, clientY: 300 })!
    const selectedRect = new DOMRect(100, 300, 200, 20)
    const previousParagraphCaret = new DOMRect(400, 230, 0, 20)
    const readRects = vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
      const rects = this.startContainer === selectedText
        ? [selectedRect] : [previousParagraphCaret, selectedRect]
      return Object.assign(rects, { item: (index: number) => rects[index] ?? null })
    })

    expect(readQuoteAnchorPosition(candidate.anchor)).toEqual({ clientX: 200, clientY: 300, bottom: 320 })
    expect(readRects.mock.instances[0]).toMatchObject({
      startContainer: selectedText,
      startOffset: 0,
      endContainer: selectedText,
      endOffset: selectedText.textContent!.length,
    })
  })

  it('coalesces layout events and cancels pending work when markers unmount', () => {
    const update = vi.fn()
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const cleanup = observeQuoteAnchorLayout([], update)
    document.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(frame).toHaveBeenCalledOnce()
    cleanup()
    expect(cancel).toHaveBeenCalledWith(7)
    document.dispatchEvent(new Event('scroll'))
    expect(frame).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
  })

  it('removes only the observed interpolation envelope and preserves authored indentation and blank lines', () => {
    const query = document.createElement('user-query')
    query.innerHTML = '<div class="query-text"><h5>You said</h5>'
      + '<p class="query-text-line"><!----><!---->   indented text   <!----><!----></p>'
      + '<p class="query-text-line"><br><!----><!----><!----><!----></p>'
      + '<p class="query-text-line"><!----><!----> \tcode  <!----><!----></p>'
      + '<p class="query-text-line">  unframed text  </p></div>'
    const original = query.innerHTML
    expect(readRawQuery(query)).toBe('  indented text  \n\n\tcode \n  unframed text  ')
    expect(query.innerHTML).toBe(original)
  })
})

function removeStopButton(): void {
  document.querySelector('.send-button.stop')?.closest('.send-button-container')?.remove()
}
