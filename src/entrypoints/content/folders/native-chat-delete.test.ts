import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteChat, deleteConversationRows } = vi.hoisted(() => ({
  deleteChat: vi.fn(),
  deleteConversationRows: vi.fn(),
}))

vi.mock('@/services/gemini-api', () => ({
  geminiApi: {
    conversations: { deleteChat },
  },
}))

vi.mock('@/entrypoints/content/bulk-delete/deleteQueue', () => ({
  deleteConversationRows,
}))

vi.mock('@/services/gemini-dom/selectors', () => ({
  geminiDomSelectors: {
    sideNav: {
      root: ['bard-sidenav'],
      conversationLink: ['a[href^="/app/"]'],
    },
  },
  queryFirstMatchingElement: (roots: ParentNode[], selectors: string[]) => {
    for (const root of roots) {
      for (const selector of selectors) {
        const match = root.querySelector(selector)
        if (match) return match
      }
    }
    return null
  },
}))

import { deleteGeminiChat } from './native-chat-delete'

describe('deleteGeminiChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('passes the Folder route ID to the Gemini API boundary', async () => {
    deleteChat.mockResolvedValue({ ok: true, data: { accepted: true } })

    await deleteGeminiChat('c09e5b4c22792c37')

    expect(deleteChat).toHaveBeenCalledWith({
      chat_id: 'c09e5b4c22792c37',
    })
    expect(deleteConversationRows).not.toHaveBeenCalled()
  })

  it('uses the native menu only when the RPC request was not sent', async () => {
    deleteChat.mockResolvedValue({
      ok: false,
      code: 'runtime_parameters_unavailable',
      outcome: 'not-sent',
    })
    deleteConversationRows.mockResolvedValue({ status: 'completed', succeeded: 1 })
    document.body.innerHTML = `
      <bard-sidenav>
        <div data-test-id="conversation"><a href="/app/c_c09e5b4c22792c37">Chat</a></div>
      </bard-sidenav>
    `

    await deleteGeminiChat('c_c09e5b4c22792c37')

    expect(deleteConversationRows).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unknown RPC outcome through the native menu', async () => {
    deleteChat.mockResolvedValue({
      ok: false,
      code: 'timeout',
      outcome: 'unknown',
    })

    await expect(deleteGeminiChat('c_c09e5b4c22792c37'))
      .rejects.toThrow('Gemini chat deletion was not confirmed (timeout)')

    expect(deleteConversationRows).not.toHaveBeenCalled()
  })

  it('logs native-list diagnostics when an unsent RPC fallback cannot find the chat', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    deleteChat.mockResolvedValue({
      ok: false,
      code: 'runtime_parameters_unavailable',
      outcome: 'not-sent',
    })
    document.body.innerHTML = '<bard-sidenav></bard-sidenav>'

    try {
      await expect(deleteGeminiChat('c_c09e5b4c22792c37'))
        .rejects.toThrow('Gemini chat could not be uniquely confirmed for deletion')

      expect(errorSpy).toHaveBeenCalledWith(
        '[Folders][delete-chat] Native fallback could not uniquely identify the Gemini chat row',
        expect.objectContaining({
          chatId: 'c_c09e5b4c22792c37',
          renderedConversationLinkCount: 0,
          matchingConversationLinkCount: 0,
          matchingConversationRowCount: 0,
        }),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})
