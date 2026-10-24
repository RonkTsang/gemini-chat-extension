export type SelectionItem = {
  id: string
  revision: number
  selectedText: string
  comment: string
  commentDraft?: string
  anchor?: QuoteAnchor
}

export type QuoteAnchor = {
  quoteId: string
  conversationId: string
  sourceMessageId: string
  selectedText: string
  startOffset: number
  endOffset: number
  prefix: string
  suffix: string
}

export type ParsedMessage = {
  selections: Array<{ selectedText: string; comment: string }>
  request: string
  format: 'multi-selection' | 'legacy-quote'
}

export const MAX_SELECTIONS = 10
export const SELECTION_HEADER = '# Selected text:\n\n'
export const REQUEST_HEADER = '## My request:'

// Persisted v1 message prefixes, independent of the current UI language.
export const LEGACY_QUOTE_PREFIXES = [
  'Regarding this',
  'Referring to this in particular',
  '特指这段内容',
  '特指這段內容',
  '特にこれに関して',
  '특히 이 부분에 대하여',
  'Bezugnehmend auf diesen Punkt im Besonderen',
  'En se référant à ceci en particulier',
  'Refiriéndose a esto en particular',
  'Referindo-se a isto em particular',
] as const

const isReservedCommentLine = (line: string) =>
  /^## Selection [1-9]\d*$/.test(line) || line === REQUEST_HEADER

function escapeCommentLine(line: string): string {
  return line.startsWith('\\') || isReservedCommentLine(line) ? `\\${line}` : line
}

function unescapeCommentLine(line: string): string {
  if (line.startsWith('\\\\')) return line.slice(1)
  if (line.startsWith('\\') && isReservedCommentLine(line.slice(1))) return line.slice(1)
  return line
}

function quoteText(text: string): string {
  return text.split('\n').map(line => line ? `> ${line}` : '>').join('\n')
}

export function effectiveComment(item: Pick<SelectionItem, 'comment' | 'commentDraft'>): string {
  return normalizeLineEndings(item.commentDraft ?? item.comment)
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export function serializePrefix(items: readonly SelectionItem[]): string {
  if (items.length === 0) return ''

  const blocks = items.map((item, index) => {
    const comment = effectiveComment(item).split('\n').map(escapeCommentLine).join('\n')
    return `## Selection ${index + 1}\n${quoteText(normalizeLineEndings(item.selectedText))}\n\n${comment}\n\n`
  }).join('')

  return `${SELECTION_HEADER}${blocks}${REQUEST_HEADER}\n`
}

export function serializeMessage(items: readonly SelectionItem[], request: string): string {
  return `${serializePrefix(items)}${normalizeLineEndings(request)}`
}

function parseMultiSelectionMessage(raw: string): ParsedMessage | null {
  raw = normalizeLineEndings(raw)
  if (!raw.startsWith(SELECTION_HEADER)) return null

  const lines = raw.slice(SELECTION_HEADER.length).split('\n')
  const selections: ParsedMessage['selections'] = []
  let cursor = 0

  while (lines[cursor] === `## Selection ${selections.length + 1}`) {
    cursor += 1
    const quotedLines: string[] = []
    while (cursor < lines.length && (lines[cursor] === '>' || lines[cursor].startsWith('> '))) {
      quotedLines.push(lines[cursor] === '>' ? '' : lines[cursor].slice(2))
      cursor += 1
    }
    if (quotedLines.length === 0 || lines[cursor] !== '') return null
    cursor += 1

    const commentLines: string[] = []
    while (cursor < lines.length && !isReservedCommentLine(lines[cursor])) {
      commentLines.push(lines[cursor])
      cursor += 1
    }
    // Each block has exactly two framing newlines after the comment.
    if (commentLines.length === 0 || commentLines.at(-1) !== '') return null
    commentLines.pop()

    selections.push({
      selectedText: quotedLines.join('\n'),
      comment: commentLines.map(unescapeCommentLine).join('\n'),
    })
  }

  // Gemini omits the final empty paragraph when a message only contains selection comments.
  if (selections.length === 0 || lines[cursor] !== REQUEST_HEADER) return null
  return {
    selections,
    request: lines.slice(cursor + 1).join('\n'),
    format: 'multi-selection',
  }
}

export function parseLegacyQuote(raw: string, legacyPrefix: string): ParsedMessage | null {
  const lines = normalizeLineEndings(raw).split('\n')
  const firstLine = lines[0].trim()
  const prefix = [legacyPrefix, ...LEGACY_QUOTE_PREFIXES]
    .find(candidate => candidate && firstLine.startsWith(`${candidate}:`))
  if (!prefix) return null
  const separatorIndex = lines.findIndex(line => line.trim() === '---------')
  if (separatorIndex <= 0 || separatorIndex >= lines.length - 1) return null

  // Match the v1 display rules: tolerate template whitespace and blank quote rows.
  const quote = [firstLine.slice(prefix.length + 1), ...lines.slice(1, separatorIndex)]
    .map(line => line.trim()).filter(Boolean).join('\n')
  const request = lines.slice(separatorIndex + 1).join('\n').trim()
  if (!quote) return null
  return { selections: [{ selectedText: quote, comment: '' }], request, format: 'legacy-quote' }
}

export function parseDisplayMessage(raw: string, legacyPrefix = ''): ParsedMessage | null {
  return parseMultiSelectionMessage(raw) ?? parseLegacyQuote(raw, legacyPrefix)
}
