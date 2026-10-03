import { describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock('@/integrations/gemini-rpc/client', () => ({
  geminiRpcClient: { execute },
}))

import { deleteChat, renameChat } from './conversations'

describe('deleteChat', () => {
  it('converts a route chat_id to Gemini’s internal conversation resource ID', async () => {
    execute.mockResolvedValue({ ok: true, data: { accepted: true } })

    await deleteChat({ chat_id: '238396412f2123a2' })

    expect(execute).toHaveBeenCalledWith(
      'conversation.delete',
      { conversationId: 'c_238396412f2123a2' },
      undefined,
    )
  })

  it('does not duplicate an existing conversation resource prefix', async () => {
    execute.mockResolvedValue({ ok: true, data: { accepted: true } })

    await deleteChat({ chat_id: 'c_c09e5b4c22792c37' })

    expect(execute).toHaveBeenLastCalledWith(
      'conversation.delete',
      { conversationId: 'c_c09e5b4c22792c37' },
      undefined,
    )
  })
})

describe('renameChat', () => {
  it.each(['e314bf90da4c7254', 'c_e314bf90da4c7254'])(
    'normalizes chat_id %s and forwards the title, signal, and result',
    async (chat_id) => {
      const options = { signal: new AbortController().signal }
      const result = {
        ok: true,
        data: { accepted: true, conversationId: 'c_e314bf90da4c7254', title: '新标题 "test"' },
      }
      execute.mockResolvedValue(result)

      await expect(renameChat({ chat_id, title: '新标题 "test"' }, options)).resolves.toEqual(result)
      expect(execute).toHaveBeenLastCalledWith(
        'conversation.rename',
        { conversationId: 'c_e314bf90da4c7254', title: '新标题 "test"' },
        options,
      )
    },
  )

  it('preserves unknown outcomes so callers can verify state before retrying', async () => {
    const failure = { ok: false, code: 'timeout', outcome: 'unknown' }
    execute.mockResolvedValue(failure)

    await expect(renameChat({ chat_id: 'e314bf90da4c7254', title: 'New title' }))
      .resolves.toEqual(failure)
  })
})
