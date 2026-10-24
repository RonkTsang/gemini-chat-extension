import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getOutlineSummary, mountDraftCards, renderHistory } from './cards'
import { attachSelectionAnchors, readRawQuery } from './dom'
import { serializeMessage, type SelectionItem } from './protocol'

const item = (id: string, comment = 'First comment'): SelectionItem => ({
  id,
  revision: 1,
  selectedText: `Source text ${id}`,
  comment,
})

const historyFixture = readFileSync(resolve(process.cwd(), 'docs/dom/quick-follow-up-history.html'), 'utf8')

function makeQuery(raw: string): HTMLElement {
  const query = document.createElement('user-query')
  const text = document.createElement('div')
  text.className = 'query-text'
  for (const line of raw.split('\n')) {
    const paragraph = document.createElement('p')
    paragraph.className = 'query-text-line'
    paragraph.textContent = line
    text.appendChild(paragraph)
  }
  query.appendChild(text)
  document.body.appendChild(query)
  return query
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('quick follow-up cards', () => {
  it.each([
    ['legacy', 'old source', 'old question'],
    ['multi-selection', 'new source', 'new question'],
  ])('renders captured %s history and restores the native message rows unchanged', (format, source, request) => {
    document.body.innerHTML = historyFixture
    const query = document.querySelector<HTMLElement>(`user-query[data-fixture="${format}"]`)!
    const lines = [...query.querySelectorAll<HTMLElement>('p.query-text-line')]
    const originalRows = lines.map(line => line.outerHTML)
    const originalRaw = readRawQuery(query)
    // The UI language differs from the historical message language.
    const dispose = renderHistory(query, '特指这段内容')

    expect(query.querySelectorAll('.gpk-follow-history .gpk-follow-card')).toHaveLength(1)
    expect(query.querySelector('.gpk-follow-card-selected')?.textContent).toBe(source)
    expect(query.querySelector('.gpk-follow-history-request')?.textContent).toBe(request)
    expect(getOutlineSummary(query, '特指这段内容').selectionCount).toBe(1)
    expect(readRawQuery(query)).toBe(originalRaw)
    const view = query.querySelector('.gpk-follow-history')
    const secondDispose = renderHistory(query, '特指这段内容')
    expect(query.querySelector('.gpk-follow-history')).toBe(view)

    secondDispose()
    dispose()
    expect(lines.map(line => line.outerHTML)).toEqual(originalRows)
    expect(readRawQuery(query)).toBe(originalRaw)
  })

  it('renders captured comments-only history without a trailing request paragraph and restores its raw rows', () => {
    document.body.innerHTML = historyFixture
    const query = document.querySelector<HTMLElement>('user-query[data-fixture="multi-selection-empty-request"]')!
    const lines = [...query.querySelectorAll<HTMLElement>('p.query-text-line')]
    const originalRows = lines.map(line => line.outerHTML)
    const raw = readRawQuery(query)
    expect(raw?.endsWith('## My request:')).toBe(true)
    const dispose = renderHistory(query, '')

    expect([...query.querySelectorAll('.gpk-follow-card-selected')].map(node => node.textContent))
      .toEqual(['免费额度有限', '多端同步偶尔失效'])
    expect([...query.querySelectorAll('.gpk-follow-card-comment')].map(node => node.textContent))
      .toEqual(['浏览器 sync 同步还是自建云？', '有多少，给我原话'])
    expect(query.querySelector('.gpk-follow-history-request')).toBeNull()
    expect(getOutlineSummary(query, '')).toEqual({
      questionText: '浏览器 sync 同步还是自建云？', quoteText: '免费额度有限', selectionCount: 2,
    })
    expect(readRawQuery(query)).toBe(raw)
    dispose()
    expect(lines.map(line => line.outerHTML)).toEqual(originalRows)
    expect(readRawQuery(query)).toBe(raw)
  })

  it('preserves multiline selections, escaped comments and request indentation while trimming outer blank lines for display', () => {
    const selections = [
      { ...item('one'), selectedText: '  indented source  \n\nlast line', comment: '## Selection 2\n\\literal\n\n' },
      { ...item('two'), comment: '' },
    ]
    const request = '\n \t\n  indented request  \n\n## Selection 8\n## My request:  \n\n \t'
    const raw = serializeMessage(selections, request)
    const query = makeQuery(raw)
    for (const row of query.querySelectorAll('p.query-text-line')) {
      const text = row.textContent
      row.replaceChildren(document.createComment(''), document.createComment(''),
        text ? document.createTextNode(` ${text} `) : document.createElement('br'),
        document.createComment(''), document.createComment(''))
    }
    const dispose = renderHistory(query, '')
    expect([...query.querySelectorAll('.gpk-follow-card-selected')].map(node => node.textContent))
      .toEqual(selections.map(selection => selection.selectedText))
    expect(query.querySelector('.gpk-follow-card-comment')?.textContent).toBe(selections[0].comment)
    expect(query.querySelector('.gpk-follow-history-request')?.textContent)
      .toBe('  indented request  \n\n## Selection 8\n## My request:  ')
    expect(query.getAttribute('data-question-text')).toBe(request)
    expect(readRawQuery(query)).toBe(raw)
    dispose()
    expect(readRawQuery(query)).toBe(raw)
  })

  it('restores reused history nodes when Gemini replaces a quote with an ordinary message', () => {
    const query = makeQuery('Referring to this in particular: old quote\n---------\nquestion')
    const dispose = renderHistory(query, '特指这段内容')
    expect(query.hasAttribute('data-gpk-follow-history')).toBe(true)
    const text = query.querySelector('.query-text')!
    const row = document.createElement('p')
    row.className = 'query-text-line'
    row.textContent = 'ordinary replacement'
    text.replaceChildren(row)
    renderHistory(query, '特指这段内容')
    expect(query.querySelector('.gpk-follow-history')).toBeNull()
    expect(query.hasAttribute('data-gpk-follow-history')).toBe(false)
    expect(row.style.display).toBe('')
    expect(readRawQuery(query)).toBe('ordinary replacement')
    dispose()
    expect(row.isConnected).toBe(true)
  })

  it('transforms a lazily completed legacy message only when its separator and request row exist', () => {
    const query = makeQuery('Referring to this in particular: old quote')
    renderHistory(query, '')
    expect(query.querySelector('.gpk-follow-history')).toBeNull()
    const text = query.querySelector('.query-text')!
    for (const value of ['---------', 'question']) {
      const row = document.createElement('p')
      row.className = 'query-text-line'
      row.textContent = value
      text.append(row)
    }
    const dispose = renderHistory(query, '')
    expect(query.querySelector('.gpk-follow-card-selected')?.textContent).toBe('old quote')
    dispose()
  })

  it.each([
    'Referring to this in particular: quote only\n---------\n',
    serializeMessage([{ ...item('empty'), selectedText: 'quote only', comment: '' }], ''),
    serializeMessage([{ ...item('empty'), selectedText: 'quote only', comment: '' }], '\n \t\n\n'),
  ])('renders quote-only history without inventing request text: %s', raw => {
    const query = makeQuery(raw)
    const dispose = renderHistory(query, '')
    expect(query.querySelector('.gpk-follow-card-selected')?.textContent).toBe('quote only')
    expect(query.querySelector('.gpk-follow-history-request')).toBeNull()
    expect(readRawQuery(query)).toBe(raw)
    dispose()
  })

  it('keeps rendered cards stable across unrelated changes and routes both comment actions to one editor', () => {
    const input = document.createElement('div')
    input.contentEditable = 'true'
    document.body.append(input)
    const onComment = vi.fn()
    const cards = mountDraftCards(input, {
      onComment,
      onJumpToSource: vi.fn(),
      onRemove: vi.fn().mockReturnValue(true),
    })
    const first = item('one')
    const second = item('two')
    cards.render([first, second])
    const firstNode = document.querySelector('.gpk-follow-card')!
    const headingNode = firstNode.querySelector('.gpk-follow-card-heading')
    firstNode.querySelector<HTMLButtonElement>('.gpk-follow-card-action-comment')!.click()
    firstNode.querySelector<HTMLButtonElement>('.gpk-follow-card-action-edit')!.click()
    expect(onComment.mock.calls).toEqual([['one'], ['one']])
    expect(document.querySelector('.gpk-follow-edit-panel')).toBeNull()

    cards.render([{ ...second, comment: 'Updated second' }, first])
    expect(document.querySelectorAll('.gpk-follow-card')[1]).toBe(firstNode)
    expect(firstNode.querySelector('.gpk-follow-card-heading')).toBe(headingNode)
    expect((firstNode as HTMLElement).dataset.selectionIndex).toBe('2')
    cards.destroy()
  })

  it('destroys visible draft tooltips and restores focusable node ownership on destroy', () => {
    const input = document.createElement('div')
    input.contentEditable = 'true'
    document.body.append(input)
    const cards = mountDraftCards(input, { onComment: vi.fn(), onJumpToSource: vi.fn(), onRemove: vi.fn() })
    cards.render([item('one')])
    const preview = document.querySelector<HTMLElement>('.gpk-follow-card-preview')!
    const tooltip = (preview as HTMLElement & { _tippy?: { show(): void; state: { isDestroyed: boolean } } })._tippy!
    tooltip.show()
    expect(document.querySelector('.tippy-box')).not.toBeNull()
    cards.destroy()
    expect(tooltip.state.isDestroyed).toBe(true)
    expect(document.querySelector('.tippy-box')).toBeNull()
  })

  it('keeps the unified comment action on an empty draft', () => {
    const input = document.createElement('div')
    input.contentEditable = 'true'
    document.body.append(input)
    const onComment = vi.fn()
    const cards = mountDraftCards(input, {
      onComment,
      onJumpToSource: vi.fn(),
      onRemove: vi.fn(),
    })
    cards.render([{ ...item('empty'), comment: '', commentDraft: '' }])
    const action = document.querySelector<HTMLButtonElement>('.gpk-follow-card-action-comment')!
    expect(action.getAttribute('aria-label')).toBeTruthy()
    expect(document.querySelector('.gpk-follow-card-action-edit')).toBeNull()
    action.click()
    expect(onComment).toHaveBeenCalledWith('empty')
    cards.destroy()
  })

  it('jumps from a pending card selection preview when its anchor is available', () => {
    const input = document.createElement('div')
    input.contentEditable = 'true'
    document.body.append(input)
    const onJumpToSource = vi.fn()
    const cards = mountDraftCards(input, {
      onComment: vi.fn(),
      onJumpToSource,
      onRemove: vi.fn(),
    })
    cards.render([{ ...item('anchored'), anchor: {
      quoteId: 'anchored', conversationId: 'chat', sourceMessageId: 'message', selectedText: 'Source text anchored',
      startOffset: 0, endOffset: 1, prefix: '', suffix: '',
    } }])
    document.querySelector<HTMLElement>('.gpk-follow-card-preview')!.click()
    expect(onJumpToSource).toHaveBeenCalledWith('anchored')
    cards.destroy()
  })

  it('shows no edit or remove controls in read-only history and restores original rows on dispose', () => {
    const raw = serializeMessage([item('history')], 'Main request')
    const query = makeQuery(raw)
    const dispose = renderHistory(query, '')
    expect(query.querySelector('.gpk-follow-history')).not.toBeNull()
    expect(query.querySelector('.gpk-follow-card-action-edit')).toBeNull()
    expect(query.querySelector('.gpk-follow-card-action-remove')).toBeNull()
    expect(getOutlineSummary(query, '')).toEqual({
      questionText: 'Main request',
      quoteText: 'Source text history',
      selectionCount: 1,
    })
    expect(Array.from(query.querySelectorAll('.query-text-line')).every(line => (line as HTMLElement).style.display === 'none')).toBe(true)
    dispose()
    expect(query.querySelector('.gpk-follow-history')).toBeNull()
    expect(Array.from(query.querySelectorAll('.query-text-line')).every(line => (line as HTMLElement).style.display !== 'none')).toBe(true)
  })

  it('reuses a matching history view and destroys its tooltip when the query is removed', () => {
    const raw = serializeMessage([item('history')], 'Main request')
    const query = makeQuery(raw)
    const firstDispose = renderHistory(query, '')
    const view = query.querySelector('.gpk-follow-history')
    const preview = query.querySelector<HTMLElement>('.gpk-follow-card-preview')!
    const instance = (preview as HTMLElement & { _tippy?: { show(): void; state: { isDestroyed: boolean } } })._tippy!
    const secondDispose = renderHistory(query, '')
    expect(query.querySelector('.gpk-follow-history')).toBe(view)
    instance.show()
    expect(document.querySelector('.tippy-box')).not.toBeNull()
    query.remove()
    firstDispose()
    secondDispose()
    expect(instance.state.isDestroyed).toBe(true)
    expect(document.querySelector('.tippy-box')).toBeNull()
  })

  it('routes a readonly anchored history card click to its stable selection index', () => {
    const raw = serializeMessage([item('history-a'), item('history-b')], 'Main request')
    const query = makeQuery(raw)
    attachSelectionAnchors(query, [undefined, {
      quoteId: 'history-b',
      conversationId: 'chat',
      sourceMessageId: 'message',
      selectedText: 'Source text history-b',
      startOffset: 0,
      endOffset: 1,
      prefix: '',
      suffix: '',
    }])
    const jump = vi.fn()
    renderHistory(query, '', { onJumpToSource: jump })
    query.querySelectorAll<HTMLElement>('.gpk-follow-card-preview')[1].click()
    expect(jump).toHaveBeenCalledWith(query, 1)
  })

  it('refreshes the jump affordance when send confirmation adds source anchors', () => {
    const raw = serializeMessage([item('history')], 'Main request')
    const query = makeQuery(raw)
    const jump = vi.fn()
    renderHistory(query, '', { onJumpToSource: jump })
    expect(query.querySelector('.gpk-follow-card-preview')?.getAttribute('role')).toBeNull()

    attachSelectionAnchors(query, [{
      quoteId: 'history',
      conversationId: 'chat',
      sourceMessageId: 'message',
      selectedText: 'Source text history',
      startOffset: 0,
      endOffset: 1,
      prefix: '',
      suffix: '',
    }])
    renderHistory(query, '', { onJumpToSource: jump })
    query.querySelector<HTMLElement>('.gpk-follow-card-preview')!.click()

    expect(jump).toHaveBeenCalledWith(query, 0)
  })
})
