import { describe, expect, it } from 'vitest'
import { isStreamGenerateUrl, parseStreamGenerateFrame, parseStreamGenerateRequest, StreamGenerateDecoder } from './streamGenerate'

const frame = (id = 'c_abc123', title?: string) => JSON.stringify([
  ['wrb.fr', null, JSON.stringify([null, [id, 'r_123'], title ? { '11': [title] } : {}])],
])
const request = (conversation: unknown) => new URLSearchParams({
  'f.req': JSON.stringify([null, JSON.stringify([['Test prompt'], ['en'], conversation])]),
}).toString()

describe('StreamGenerate protocol parsers', () => {
  it('matches only the exact Gemini endpoint, including numeric account routes', () => {
    const path = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'
    expect(isStreamGenerateUrl(path)).toBe(true)
    expect(isStreamGenerateUrl(`https://gemini.google.com/u/2${path}?x=1`)).toBe(true)
    expect(isStreamGenerateUrl(`https://other.test${path}`)).toBe(false)
    expect(isStreamGenerateUrl(`${path}/other`)).toBe(false)
  })
  it('distinguishes a captured new conversation from an existing one and rejects unknown fields', () => {
    expect(parseStreamGenerateRequest(request(null))).toEqual({ conversationId: null, isNewConversation: true })
    expect(parseStreamGenerateRequest(request(['c_abc123', 'r_123']))).toEqual({ conversationId: 'c_abc123', isNewConversation: false })
    expect(parseStreamGenerateRequest(request([]))).toBeNull()
    expect(parseStreamGenerateRequest('f.req=invalid')).toBeNull()
  })
  it('extracts only structural conversation identity and the late title field', () => {
    expect(parseStreamGenerateFrame(frame('c_abc123', '  A title  '))).toEqual([{ conversationId: 'c_abc123', title: 'A title' }])
    expect(parseStreamGenerateFrame(JSON.stringify([['wrb.fr', 'other-rpc', JSON.stringify([null, ['c_abc123']])]]))).toEqual([])
    expect(parseStreamGenerateFrame(JSON.stringify([['wrb.fr', null, JSON.stringify(['answer mentions c_abc123', []])]]))).toEqual([])
  })
  it('decodes arbitrarily split frames without reparsing old response text', () => {
    const text = `)]}'\n\n${frame().length}\n${frame()}\n${frame('c_abc123', '标题')}\n`
    const decoder = new StreamGenerateDecoder()
    const results = Array.from(text).flatMap((character) => decoder.push(character))
    expect(results).toEqual([{ conversationId: 'c_abc123' }, { conversationId: 'c_abc123', title: '标题' }])
    expect(decoder.push('', true)).toEqual([])
  })
  it('accepts a complete final frame without a newline and recovers after oversized input', () => {
    const decoder = new StreamGenerateDecoder()
    expect(decoder.push('x'.repeat(2 * 1024 * 1024 + 1))).toEqual([])
    expect(decoder.push(`\n${frame()}`, true)).toEqual([{ conversationId: 'c_abc123' }])
    expect(new StreamGenerateDecoder().push(frame().slice(0, -1), true)).toEqual([])
  })
})
