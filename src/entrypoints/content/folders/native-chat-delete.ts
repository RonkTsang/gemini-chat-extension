import { deleteConversationRows } from '@/entrypoints/content/bulk-delete/deleteQueue'
import { geminiApi } from '@/services/gemini-api'
import { geminiDomSelectors, queryFirstMatchingElement } from '@/services/gemini-dom/selectors'

function chatIdFromLink(link: HTMLAnchorElement): string | undefined {
  const match = new URL(link.href, window.location.origin).pathname.match(/^\/app\/([^/?#]+)$/u)
  return match?.[1]
}

/**
 * Deletes a real Gemini chat through Gemini's authenticated internal RPC.
 * When the RPC runtime cannot send a request at all, use the existing native
 * menu adapter as a compatibility fallback. The caller owns Folder indexes and
 * updates them only after this function reports Gemini success.
 */
export async function deleteGeminiChat(chatId: string): Promise<void> {
  const result = await geminiApi.conversations.deleteChat({
    chat_id: chatId,
  })
  if (result.ok) return

  // A not-sent outcome cannot have changed Gemini state, so falling back is
  // safe. Unknown/rejected outcomes must not be retried through the menu:
  // Gemini may already have applied the destructive request.
  if (result.outcome !== 'not-sent') {
    console.error('[Folders][delete-chat] RPC deletion was not confirmed; native fallback is unsafe', {
      chatId,
      code: result.code,
      outcome: result.outcome,
      currentPath: window.location.pathname,
    })
    throw new Error(`Gemini chat deletion was not confirmed (${result.code})`)
  }

  console.warn('[Folders][delete-chat] RPC request was not sent; attempting native menu fallback', {
    chatId,
    code: result.code,
    currentPath: window.location.pathname,
  })
  await deleteGeminiChatViaNativeMenu(chatId)
}

async function deleteGeminiChatViaNativeMenu(chatId: string): Promise<void> {
  const sideNav = queryFirstMatchingElement([document], geminiDomSelectors.sideNav.root)
  if (!sideNav) {
    console.error('[Folders][delete-chat] Native fallback could not find the Gemini SideNav', {
      chatId,
      sideNavSelectors: geminiDomSelectors.sideNav.root,
      currentPath: window.location.pathname,
    })
    throw new Error('Gemini conversation list is unavailable')
  }

  const conversationLinks = [...new Set(
    geminiDomSelectors.sideNav.conversationLink
      .flatMap((selector) => Array.from(sideNav.querySelectorAll<HTMLAnchorElement>(selector))),
  )]
  const matchingLinks = conversationLinks.filter((link) => chatIdFromLink(link) === chatId)
  const rows = [...new Set(
    matchingLinks
      .map((link) => link.closest<HTMLElement>('gem-nav-list-item[data-test-id="conversation"], [data-test-id="conversation"]'))
      .filter((row): row is HTMLElement => Boolean(row)),
  )]
  if (rows.length !== 1) {
    console.error('[Folders][delete-chat] Native fallback could not uniquely identify the Gemini chat row', {
      chatId,
      currentPath: window.location.pathname,
      renderedConversationLinkCount: conversationLinks.length,
      matchingConversationLinkCount: matchingLinks.length,
      matchingConversationRowCount: rows.length,
      conversationLinkSelectors: geminiDomSelectors.sideNav.conversationLink,
    })
    throw new Error('Gemini chat could not be uniquely confirmed for deletion')
  }

  // A user may be hiding organized Recents. Temporarily reveal only our own
  // visual override so Gemini's native action menu remains operable.
  const row = rows[0]
  const wasFolderHidden = row.getAttribute('data-gpk-folders-recents-hidden') === 'true'
  if (wasFolderHidden) row.style.removeProperty('display')
  const result = await deleteConversationRows([row])
  if (result.status !== 'completed' || result.succeeded !== 1) {
    if (wasFolderHidden) row.style.setProperty('display', 'none', 'important')
    throw new Error(result.status === 'failed' ? 'Gemini did not delete this chat' : 'Gemini chat deletion was cancelled')
  }
}
