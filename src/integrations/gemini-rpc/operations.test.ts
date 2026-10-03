import { describe, expect, it } from 'vitest'

import { buildBatchExecuteRequest } from './main-world-runtime'
import { geminiOperations, parseRenameConversationResponse } from './operations'

const operation = geminiOperations['conversation.rename']
const conversationId = 'c_e314bf90da4c7254'

function response(payload: unknown, rpcId = 'MUAZcd'): string {
  const frame = JSON.stringify([
    ['wrb.fr', rpcId, JSON.stringify(payload), null, null, null, 'generic'],
    ['di', 259],
    ['af.httprm', 259, '2101339866136749116', 1],
  ])
  return `)]}'\n\n${frame.length}\n${frame}\n25\n[["e",4,null,null,247]]\n`
}

describe('conversation.rename', () => {
  it('builds the captured MUAZcd request using the current account and route', () => {
    window.history.replaceState({}, '', '/u/2/app/e314bf90da4c7254')
    const title = ' 中文 "quoted" & + title 😀 '
    const input = { conversationId, title }
    expect(operation.parseInput(input)).toEqual({ success: true, data: input })
    expect(operation.risk).toBe('write')

    const request = buildBatchExecuteRequest(operation, input, {
      at: 'test-token', fSid: '123456', bl: 'test-build',
      capturedAt: Date.now(), source: 'xhr',
    })
    const url = new URL(request.url)
    const form = new URLSearchParams(request.body)
    const fReq = JSON.parse(form.get('f.req') ?? '')

    expect(url.pathname).toBe('/u/2/_/BardChatUi/data/batchexecute')
    expect(url.searchParams.get('rpcids')).toBe('MUAZcd')
    expect(url.searchParams.get('source-path')).toBe('/u/2/app/e314bf90da4c7254')
    expect(fReq).toEqual([[['MUAZcd', JSON.stringify([
      null, [['title']], [conversationId, title],
    ]), null, 'generic']]])
  })

  it.each([
    null, [], {},
    { conversationId: 'e314bf90da4c7254', title: 'Title' },
    { conversationId: 'c_bad/id', title: 'Title' },
    { conversationId, title: '' },
    { conversationId, title: ' \n\t ' },
    { conversationId, title: 42 },
    { conversationId },
  ])('rejects invalid input %j before sending', (input) => {
    expect(operation.parseInput(input)).toEqual({ success: false })
  })

  it('parses the captured acknowledgement and exposes only ID and title', () => {
    const captured = response([null, [
      conversationId, 'TP-Link password', null, null, null,
      [1790769743, 423304000], null, null, null, 2,
    ]])
    expect(parseRenameConversationResponse(captured)).toEqual({
      accepted: true, conversationId, title: 'TP-Link password',
    })
  })

  it.each([
    [], [null], [null, []], [null, ['invalid-id', 'Title']],
    [null, [conversationId, null]], [null, [conversationId, '']],
  ].map((payload) => ({ payload })))('rejects malformed acknowledgement %j', ({ payload }) => {
    expect(() => parseRenameConversationResponse(response(payload))).toThrow()
  })

  it('rejects unrelated RPC frames and invalid JSON', () => {
    expect(() => parseRenameConversationResponse(response(
      [null, [conversationId, 'Title']], 'GzXR5e',
    ))).toThrow('Rename conversation RPC acknowledgement missing')
    expect(() => parseRenameConversationResponse(
      '[["wrb.fr","MUAZcd","not JSON"]]',
    )).toThrow()
    expect(() => parseRenameConversationResponse('')).toThrow()
  })
})
