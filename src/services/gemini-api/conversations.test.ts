import { describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock('@/integrations/gemini-rpc/client', () => ({
  geminiRpcClient: { execute },
}))

import { deleteChat } from './conversations'

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
