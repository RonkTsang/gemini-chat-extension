// Design experiment only. This file is not extension implementation code.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'

const header = '# Selected text:\n\n'
const requestHeader = '## My request:'
const reserved = line => /^## Selection [1-9]\d*$/.test(line) || line === requestHeader
const escapeLine = line => line.startsWith('\\') || reserved(line) ? `\\${line}` : line
const unescapeLine = line => line.startsWith('\\\\') || (line.startsWith('\\') && reserved(line.slice(1)))
  ? line.slice(1) : line

function serialize(items, request) {
  const blocks = items.map((item, index) => {
    const quote = item.text.split('\n').map(line => line ? `> ${line}` : '>').join('\n')
    const comment = item.comment.split('\n').map(escapeLine).join('\n')
    return `## Selection ${index + 1}\n${quote}\n\n${comment}\n\n`
  }).join('')
  return header + blocks + requestHeader + '\n' + request
}

function parse(raw) {
  if (!raw.startsWith(header)) return null
  const lines = raw.slice(header.length).split('\n')
  const items = []
  let cursor = 0
  while (lines[cursor] === `## Selection ${items.length + 1}`) {
    cursor++
    const quote = []
    while (lines[cursor] === '>' || lines[cursor]?.startsWith('> ')) {
      quote.push(lines[cursor] === '>' ? '' : lines[cursor].slice(2))
      cursor++
    }
    if (!quote.length || lines[cursor++] !== '') return null
    const comment = []
    while (cursor < lines.length && !reserved(lines[cursor])) comment.push(lines[cursor++])
    // Remove one framing blank line; remaining blanks belong to the comment.
    if (!comment.length || comment.at(-1) !== '') return null
    items.push({ text: quote.join('\n'), comment: comment.slice(0, -1).map(unescapeLine).join('\n') })
  }
  if (!items.length || lines[cursor++] !== requestHeader) return null
  return { items, request: lines.slice(cursor).join('\n') }
}

let checks = 0
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const texts = ['alpha', 'a\n\nb\n', '> nested\n## Selection 2', '中文 😀', 'x'.repeat(5000)]
const comments = ['', 'comment', '\n', 'a\n\n', '## Selection 2\n## My request:', '\\## My request:\n\\\\literal', '> comment quote\n\n# heading']
for (const text of texts) for (const comment of comments) {
  const items = [{ text, comment }, { text: 'second', comment: '' }]
  const request = 'Keep this:\n## Selection 3\n## My request:\n'
  equal(parse(serialize(items, request)), { items, request })
}
const valid = serialize([{ text: 'x', comment: 'y' }], '')
equal(valid, '# Selected text:\n\n## Selection 1\n> x\n\ny\n\n## My request:\n')
equal(parse('# Selected text:\n\n## Selection 1\n> a\n>\n> b\n\n\\## My request:\n\n## My request:\nquestion'), {
  items: [{ text: 'a\n\nb', comment: '## My request:' }], request: 'question',
})
equal(parse(valid)?.request, '')
for (const invalid of ['hello', valid.replace('Selection 1', 'Selection 2'), valid.replace('> x', 'x'), valid.replace(requestHeader, '## Request:'), valid.replace('# Selected text:', '# selected text:')]) {
  equal(parse(invalid), null)
}
equal(parse('# Selected text:\n\n## My request:\nx'), null)
equal(parse(valid.replace('y\n\n## My request:', 'y\n## My request:')), null)
equal(parse(serialize([{ text: 'a', comment: '' }, { text: 'b', comment: '' }], '').replace('Selection 2', 'Selection 3')), null)
equal(parse(serialize([{ text: 'a', comment: '' }], '  request\n\n'))?.request, '  request\n\n')

// Confirm scoped resolver contracts on the repository's captured fixtures.
const window = new Window()
const document = window.document
document.body.innerHTML = readFileSync(new URL('../../dom/input.html', import.meta.url), 'utf8')
equal(document.querySelectorAll('chat-window rich-textarea .ql-editor.textarea.new-input-ui[contenteditable="true"]').length, 1)
const editor = document.querySelector('chat-window rich-textarea .ql-editor')
const prefix = document.createElement('p')
prefix.dataset.gpkFollowPrefix = ''
prefix.hidden = true
prefix.textContent = valid
editor.prepend(prefix)
equal([...editor.children].filter(node => node !== prefix).map(node => node.textContent).join('\n'), 'line-1\nline-2')
equal(prefix.textContent, valid)
document.body.innerHTML = readFileSync(new URL('../../dom/origianl-chat.html', import.meta.url), 'utf8')
equal(document.querySelectorAll('user-query').length > 0, true)
equal([...document.querySelectorAll('user-query')].every(query => query.querySelectorAll('.query-text').length === 1), true)
equal([...document.querySelectorAll('user-query')].every(query => query.querySelectorAll('p.query-text-line').length > 0), true)

// Snapshot acknowledgement cannot delete an item edited after send preparation.
const sent = [{ id: 'a', revision: 1 }, { id: 'b', revision: 1 }]
const current = [{ id: 'a', revision: 2 }, { id: 'b', revision: 1 }, { id: 'c', revision: 1 }]
equal(current.filter(item => !sent.some(old => old.id === item.id && old.revision === item.revision)), [current[0], current[2]])
console.log(`PASS: ${checks} protocol, fixture and snapshot assertions. Gemini submission is not tested.`)
await window.happyDOM.close()
