import { geminiDomSelectors } from '@/services/gemini-dom/selectors'

export function chatIdFromConversationLink(link: HTMLAnchorElement): string | undefined {
  const match = new URL(link.href, window.location.origin).pathname.match(/^\/app\/([^/?#]+)$/u)
  return match?.[1]
}

function normalizeChatTitle(value: string | null | undefined): string | undefined {
  const normalized = value?.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  return normalized && normalized.length <= 500 ? normalized : undefined
}

export function chatTitleFromConversationLink(link: HTMLAnchorElement): string | undefined {
  for (const selector of geminiDomSelectors.sideNav.conversationTitle) {
    const matches = Array.from(link.querySelectorAll(selector))
      .map((element) => normalizeChatTitle(element.textContent))
      .filter((title): title is string => Boolean(title))
    const uniqueTitles = [...new Set(matches)]
    if (uniqueTitles.length === 1) return uniqueTitles[0]
    if (uniqueTitles.length > 1) return undefined
  }
  return normalizeChatTitle(link.getAttribute('aria-label'))
}
