import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  buildBatchExecuteRequest,
  extractRuntimeParametersFromXHR,
  readWizRuntimeParameters,
} from './main-world-runtime'
import {
  geminiOperations,
  parseDeleteConversationResponse,
} from './operations'
import { defineGeminiOperation, type GeminiRuntimeParameters } from './types'

const runtimeParameters: GeminiRuntimeParameters = {
  at: 'at-token',
  fSid: '123456',
  bl: 'build-label',
  capturedAt: 100,
  source: 'xhr',
}

describe('Gemini RPC runtime parameters', () => {
  it('extracts an atomic snapshot from a batchexecute XHR', () => {
    const parameters = extractRuntimeParametersFromXHR(
      'https://gemini.google.com/_/BardChatUi/data/batchexecute?bl=build-label&f.sid=123456',
      'f.req=ignored&at=at-token',
      123,
    )

    expect(parameters).toEqual({
      at: 'at-token',
      fSid: '123456',
      bl: 'build-label',
      capturedAt: 123,
      source: 'xhr',
    })
  })

  it('rejects incomplete batchexecute request snapshots', () => {
    expect(extractRuntimeParametersFromXHR(
      'https://gemini.google.com/_/BardChatUi/data/batchexecute?bl=build-label',
      'at=at-token',
    )).toBeNull()
  })

  it('accepts a request scoped to a numbered Gemini account', () => {
    const parameters = extractRuntimeParametersFromXHR(
      'https://gemini.google.com/u/2/_/BardChatUi/data/batchexecute?bl=build-label&f.sid=123456',
      'at=at-token',
    )

    expect(parameters?.source).toBe('xhr')
  })

  it('reads configured WIZ fields without exposing the root to callers', () => {
    const parameters = readWizRuntimeParameters({
      WIZ_global_data: {
        SNlM0e: 'at-token',
        FdrFJe: 123456,
        cfb2h: 'build-label',
      },
    }, 456)

    expect(parameters).toEqual({
      at: 'at-token',
      fSid: '123456',
      bl: 'build-label',
      capturedAt: 456,
      source: 'wiz-global-data',
    })
  })
})

describe('buildBatchExecuteRequest', () => {
  it('builds an account-scoped form request from a verified operation definition', () => {
    window.history.replaceState({}, '', '/u/2/app')
    document.documentElement.lang = 'en-US'
    const operation = defineGeminiOperation({
      rpcId: 'testRpc',
      risk: 'read' as const,
      inputSchema: z.object({ pageToken: z.string().nullable() }),
      sourcePath: () => '/library',
      buildArgs: (input) => [input.pageToken],
      parseResponse: () => null,
    })

    const request = buildBatchExecuteRequest(operation, { pageToken: null }, runtimeParameters)
    const url = new URL(request.url)
    const form = new URLSearchParams(request.body)
    const fReq = JSON.parse(form.get('f.req') ?? '') as [[[string, string]]]

    expect(url.pathname).toBe('/u/2/_/BardChatUi/data/batchexecute')
    expect(url.searchParams.get('rpcids')).toBe('testRpc')
    expect(url.searchParams.get('source-path')).toBe('/u/2/library')
    expect(url.searchParams.get('bl')).toBe('build-label')
    expect(url.searchParams.get('f.sid')).toBe('123456')
    expect(url.searchParams.get('hl')).toBe('en')
    expect(form.get('at')).toBe('at-token')
    expect(fReq[0][0][0]).toBe('testRpc')
    expect(JSON.parse(fReq[0][0][1])).toEqual([null])
  })

  it('uses the active Gemini route for a delete operation source path', () => {
    window.history.replaceState({}, '', '/u/2/app/active-route-id')
    const operation = geminiOperations['conversation.delete']
    const request = buildBatchExecuteRequest(operation, {
      conversationId: 'c_a5cc61b9933a2743',
    }, runtimeParameters)
    const form = new URLSearchParams(request.body)
    const fReq = JSON.parse(form.get('f.req') ?? '') as [[[string, string]]]

    expect(new URL(request.url).searchParams.get('source-path')).toBe('/u/2/app/active-route-id')
    expect(new URL(request.url).searchParams.get('rpcids')).toBe('GzXR5e')
    expect(JSON.parse(fReq[0][0][1])).toEqual(['c_a5cc61b9933a2743'])
  })
})

describe('delete conversation response parsing', () => {
  it('accepts the captured GzXR5e acknowledgement frame', () => {
    const responseFrame = JSON.stringify([
      ['wrb.fr', 'GzXR5e', '[]', null, null, null, 'generic'],
      ['di', 510],
    ])
    const response = `)]}'\n${responseFrame.length}\n${responseFrame}`

    expect(parseDeleteConversationResponse(response)).toEqual({ accepted: true })
  })

  it('accepts a nested acknowledgement without depending on frame lengths', () => {
    const responseFrame = JSON.stringify([[[
      'wrb.fr',
      'GzXR5e',
      '[]',
      null,
      null,
      null,
      'generic',
    ]]])
    const response = `)]}'\n999999\n${responseFrame}\ntrailing metadata`

    expect(parseDeleteConversationResponse(response)).toEqual({ accepted: true })
  })

  it('rejects a response without the GzXR5e acknowledgement', () => {
    const responseFrame = JSON.stringify([
      ['wrb.fr', 'qWymEb', '[]', null, null, null, 'generic'],
    ])
    const response = `)]}'\n${responseFrame.length}\n${responseFrame}`

    expect(() => parseDeleteConversationResponse(response)).toThrow(
      'Delete conversation RPC acknowledgement missing',
    )
  })
})
