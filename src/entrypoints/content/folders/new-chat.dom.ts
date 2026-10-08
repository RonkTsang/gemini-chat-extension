export function getAccountPath(pathname = location.pathname): string {
  return pathname.match(/^\/u\/\d+(?=\/|$)/u)?.[0] ?? ''
}

export function getRouteChatId(pathname = location.pathname): string | undefined {
  return pathname.replace(/^\/u\/\d+(?=\/)/u, '').match(/^\/app\/([a-f0-9]+)$/u)?.[1]
}

export function isOrdinaryNewChat(): boolean {
  const windows = document.querySelectorAll('chat-window')
  return location.pathname === `${getAccountPath()}/app`
    && windows.length === 1 && !windows[0].classList.contains('is-temporary-chat')
}

const FOLDER_LABEL_ANCHOR_SELECTORS = [
  'chat-window input-container > .input-area-container > input-area-v2',
  'chat-window input-container fieldset > input-area-v2',
] as const

/** Current Gemini places fieldset inside input-area-v2; retain the earlier contract. */
export function resolveFolderLabelAnchor(): HTMLElement | null {
  for (const selector of FOLDER_LABEL_ANCHOR_SELECTORS) {
    const candidates = document.querySelectorAll<HTMLElement>(selector)
    if (candidates.length > 1) return null
    if (candidates.length === 1) return candidates[0]
  }
  return null
}

export function isBlankComposerReady(): boolean {
  const anchor = resolveFolderLabelAnchor()
  const editors = anchor?.querySelectorAll<HTMLElement>('rich-textarea [contenteditable="true"][role="textbox"]')
  return isOrdinaryNewChat() && Boolean(editors?.length === 1)
    && document.querySelectorAll('chat-window user-query').length === 0
}

export function resolveCreatedChatTitle(chatId: string): string | undefined {
  const path = `${getAccountPath()}/app/${chatId}`
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('bard-sidenav gem-nav-list-item[data-test-id="conversation"] > a[href]'))
    .filter((link) => new URL(link.href, location.origin).pathname === path)
  if (links.length !== 1) return undefined
  const title = links[0].getAttribute('aria-label')?.trim()
  return title && title.length <= 500 ? title : undefined
}
