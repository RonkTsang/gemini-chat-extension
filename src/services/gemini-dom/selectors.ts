export const geminiDomSelectors = {
  identity: {
    globalHeader: ['#gb'],
    activeAccountLink: ['a[href*="accounts.google.com/SignOutOptions"][aria-label]'],
    activeAccountAvatar: ['img[src]'],
  },
  sideNav: {
    root: ['bard-sidenav[role="navigation"]', 'bard-sidenav'],
    chatsSection: [
      'expandable-section[data-test-id="chats-expandable-section"]',
      'expandable-section[storagekey="chats"]',
    ],
    conversationLink: ['a[href^="/app/"]', 'a[href*="gemini.google.com/app/"]'],
    conversationTitle: ['span.title-text'],
    activeConversationRow: ['gem-nav-list-item[data-test-id="conversation"].always-show-hovered-trailing-content'],
    activeConversationMenuTrigger: ['[aria-haspopup="menu"][aria-controls]'],
    openConversationActionsMenu: ['[role="menu"].conversation-actions-menu'],
  },
} as const

export function queryFirstMatchingElement(
  roots: readonly ParentNode[],
  selectors: readonly string[],
): Element | null {
  for (const root of roots) {
    for (const selector of selectors) {
      const candidate = root.querySelector(selector)
      if (candidate) {
        return candidate
      }
    }
  }
  return null
}
