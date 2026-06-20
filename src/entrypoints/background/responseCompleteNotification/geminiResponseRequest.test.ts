import { describe, expect, it } from 'vitest'
import { classifyGeminiResponseRequest } from './geminiResponseRequest'

const BASE_BATCH_URL = 'https://gemini.google.com/_/BardChatUi/data/batchexecute'

describe('classifyGeminiResponseRequest', () => {
  it('classifies StreamGenerate requests', () => {
    expect(classifyGeminiResponseRequest(
      'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?rt=c',
    )).toEqual({ kind: 'stream-generate' })
  })

  it('classifies Deep Research polling regardless of query order', () => {
    expect(classifyGeminiResponseRequest(
      `${BASE_BATCH_URL}?source-path=%2Fapp%2Fc_123&rt=c&rpcids=kwDCne`,
    )).toEqual({
      kind: 'batchexecute',
      rpcId: 'kwDCne',
      conversationId: 'c_123',
    })
  })

  it('classifies conversation history retrieval', () => {
    expect(classifyGeminiResponseRequest(
      `${BASE_BATCH_URL}?rpcids=hNvQHb&source-path=/app/c_456`,
    )).toEqual({
      kind: 'batchexecute',
      rpcId: 'hNvQHb',
      conversationId: 'c_456',
    })
  })

  it('classifies other conversation-scoped RPCs', () => {
    expect(classifyGeminiResponseRequest(
      `${BASE_BATCH_URL}?rpcids=MUAZcd&source-path=%2Fapp%2Fc_123`,
    )).toEqual({
      kind: 'batchexecute',
      rpcId: 'MUAZcd',
      conversationId: 'c_123',
    })
  })

  it('rejects malformed, unrelated, and missing-conversation requests', () => {
    expect(classifyGeminiResponseRequest('invalid')).toEqual({ kind: 'other' })
    expect(classifyGeminiResponseRequest(
      `${BASE_BATCH_URL}?rpcids=kwDCne&source-path=%2Fmystuff`,
    )).toEqual({ kind: 'other' })
    expect(classifyGeminiResponseRequest(
      `${BASE_BATCH_URL}?rpcids=hNvQHb`,
    )).toEqual({ kind: 'other' })
  })
})
