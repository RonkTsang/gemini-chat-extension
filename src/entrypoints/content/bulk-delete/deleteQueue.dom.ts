export const CONVERSATION_ROW_SELECTOR =
  'gem-nav-list-item[data-test-id="conversation"][data-gpk-conversation-key]'

export const CONVERSATION_LINK_SELECTOR = ':scope > a[href^="/app/"]'

export const ACTION_MENU_TRIGGER_SELECTOR =
  'gem-icon-button[data-test-id="actions-menu-button"][aria-haspopup="menu"]'

export const ACTION_MENU_BUTTON_SELECTOR = ':scope > button:not([disabled])'

export function findConversationRowByKey(
  conversationKey: string,
  root: ParentNode = document,
): HTMLElement | null {
  const matches = Array.from(
    root.querySelectorAll<HTMLElement>(CONVERSATION_ROW_SELECTOR),
  ).filter((row) => {
    if (row.dataset.gpkConversationKey !== conversationKey) {
      return false
    }

    const links = row.querySelectorAll<HTMLAnchorElement>(CONVERSATION_LINK_SELECTOR)
    if (links.length !== 1) {
      return false
    }

    return new URL(links[0].getAttribute('href') ?? '', window.location.origin)
      .pathname === conversationKey
  })

  return matches.length === 1 ? matches[0] : null
}

export function findActionMenuButton(row: HTMLElement): HTMLButtonElement | null {
  if (!row.isConnected) {
    return null
  }

  const triggers = row.querySelectorAll<HTMLElement>(ACTION_MENU_TRIGGER_SELECTOR)
  if (triggers.length !== 1) {
    return null
  }

  const buttons = triggers[0].querySelectorAll<HTMLButtonElement>(
    ACTION_MENU_BUTTON_SELECTOR,
  )
  if (buttons.length !== 1 || !buttons[0].isConnected) {
    return null
  }

  return buttons[0]
}
