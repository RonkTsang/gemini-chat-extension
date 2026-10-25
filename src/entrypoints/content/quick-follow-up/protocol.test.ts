import { describe, expect, it } from 'vitest'
import { parseDisplayMessage, serializeMessage, serializePrefix, type SelectionItem } from './protocol'

const item = (id: string, selectedText: string, comment: string, commentDraft?: string): SelectionItem => ({
  id, revision: 1, selectedText, comment, ...(commentDraft === undefined ? {} : { commentDraft }),
})

describe('Follow-up text protocol', () => {
  it('round-trips multiline selections, comments, reserved lines, and request text', () => {
    const selections = [
      item('a', 'first\n\nthird\n', '## Selection 2\n## My request:\n\\literal'),
      item('b', '中文\n> nested', '', ''),
    ]
    const request = 'Keep whitespace:  \n## Selection 4\n## My request:\n'
    expect(parseDisplayMessage(serializeMessage(selections, request))).toEqual({
      selections: [
        { selectedText: selections[0].selectedText, comment: selections[0].comment },
        { selectedText: selections[1].selectedText, comment: '' },
      ],
      request,
      format: 'multi-selection',
    })
  })

  it('serializes the latest unsaved Quick Comment into one prefix', () => {
    const selections = [item('a', 'source', 'saved', 'draft')]
    const prefix = serializePrefix(selections)
    expect(prefix).toContain('\n\ndraft\n\n')
    expect(prefix).not.toContain('## My request:')
    expect(serializePrefix(selections)).toBe(prefix)
    expect(parseDisplayMessage(serializeMessage(selections, 'request'))?.selections[0]?.comment).toBe('draft')
  })

  it('rejects malformed or incomplete messages without guessing', () => {
    const valid = serializeMessage([item('a', 'source', '')], '')
    expect(parseDisplayMessage(valid.replace('Selection 1', 'Selection 2'))).toBeNull()
    expect(parseDisplayMessage(valid.replace('> source', 'source'))).toBeNull()
    expect(parseDisplayMessage(`${valid}## Selection 9`)).toBeNull()
    expect(parseDisplayMessage('ordinary message')).toBeNull()
  })

  it('continues to recognize the legacy quote format', () => {
    expect(parseDisplayMessage('Regarding this in particular: old quote\n---------\nquestion', 'Regarding this in particular'))
      .toEqual({
        selections: [{ selectedText: 'old quote', comment: '' }],
        request: 'question',
        format: 'legacy-quote',
      })
  })

  it.each([
    'Regarding this', 'Referring to this in particular', '特指这段内容', '特指這段內容',
    '特にこれに関して', '특히 이 부분에 대하여', 'Bezugnehmend auf diesen Punkt im Besonderen',
    'En se référant à ceci en particulier', 'Refiriéndose a esto en particular',
    'Referindo-se a isto em particular',
  ])('recognizes persisted v1 prefix %s after switching the UI language', prefix => {
    expect(parseDisplayMessage(` ${prefix}: old quote \r\n\r\n second line \r\n --------- \r\n\r\nquestion\r\n`, 'different UI language'))
      .toEqual({
        selections: [{ selectedText: 'old quote\nsecond line', comment: '' }],
        request: 'question',
        format: 'legacy-quote',
      })
  })

  it('leaves unrelated or incomplete legacy messages unformatted and keeps request delimiters as body text', () => {
    expect(parseDisplayMessage('ordinary quote\n---------\nquestion')).toBeNull()
    expect(parseDisplayMessage('Regarding this: quote\ninline --------- text\nquestion')).toBeNull()
    expect(parseDisplayMessage('Regarding this: quote\n---------')).toBeNull()
    expect(parseDisplayMessage('Regarding this: \n---------\nquestion')).toBeNull()
    expect(parseDisplayMessage('Regarding this: quote\n---------\nquestion\n---------\n## Selection 1')?.request)
      .toBe('question\n---------\n## Selection 1')
  })

  it('normalizes CRLF and CR and preserves generated reserved and backslash lines', () => {
    const lines = [
      'plain', '\\starts with slash', '## Selection 1', '## My request:',
      '## Selection 77', '', 'tail\\',
    ]
    for (const separator of ['\n', '\r\n', '\r']) {
      const selectedText = lines.join(separator)
      const comment = ['## My request:', '\\literal', '', 'last', ''].join(separator)
      const request = ['request', '## Selection 9', '\\keep', ''].join(separator)
      const expected = { selectedText: selectedText.replace(/\r\n?/g, '\n'), comment: comment.replace(/\r\n?/g, '\n') }
      const parsed = parseDisplayMessage(serializeMessage([item('x', selectedText, comment)], request).replace(/\n/g, separator))
      expect(parsed?.selections).toEqual([expected])
      expect(parsed?.request).toBe(request.replace(/\r\n?/g, '\n'))
    }
  })

  it.each([1, 2])('accepts %i selections with an empty request when Gemini omits the final newline', count => {
    const selections = Array.from({ length: count }, (_, index) => item(`${index}`, `source ${index}`, `comment ${index}`))
    const raw = `${serializePrefix(selections)}## My request:`
    expect(parseDisplayMessage(raw)).toEqual({
      selections: selections.map(({ selectedText, comment }) => ({ selectedText, comment })),
      request: '',
      format: 'multi-selection',
    })
    expect(parseDisplayMessage(raw.replace('## My request:', ''))?.request).toBe('')
    expect(parseDisplayMessage(`${raw}inline request`)?.request).toBe('')
    expect(parseDisplayMessage(`${raw}inline request`)?.selections.at(-1)?.comment)
      .toBe(`comment ${count - 1}\n\n## My request:inline request`)
  })

  it.each(['', ' \t\n\n', '\r\n \r\n'])('omits the request heading for an empty body %j', request => {
    const selections = [item('a', 'source', 'comment\n\n')]
    const raw = serializeMessage(selections, request)
    expect(raw).toBe(serializePrefix(selections))
    expect(raw).not.toContain('## My request:')
    expect(parseDisplayMessage(raw)).toEqual({
      selections: [{ selectedText: 'source', comment: 'comment\n\n' }],
      request: '', format: 'multi-selection',
    })
  })

  it('adds exactly one newline after the heading and preserves the request body', () => {
    const selections = [item('a', 'source', '')]
    expect(serializeMessage(selections, '  request\n\nnext'))
      .toBe(`${serializePrefix(selections)}## My request:\n  request\n\nnext`)
    expect(serializeMessage([], 'ordinary request')).toBe('ordinary request')
  })

  it.each([1, 2])('parses %i selections without a request heading after Gemini trims trailing newlines', count => {
    for (const comment of ['', 'last comment', '## My request:\n\\literal']) {
      const selections = Array.from({ length: count }, (_, index) => item(`${index}`, `source ${index}`, comment))
      const raw = serializeMessage(selections, '').replace(/\n+$/, '')
      expect(parseDisplayMessage(raw)).toEqual({
        selections: selections.map(({ selectedText, comment }) => ({ selectedText, comment })),
        request: '', format: 'multi-selection',
      })
    }
  })

  it('preserves large request bodies', () => {
    const request = 'x'.repeat(20_000)
    expect(parseDisplayMessage(serializeMessage([item('long', 'source', '')], request))?.request).toBe(request)
  })
})
