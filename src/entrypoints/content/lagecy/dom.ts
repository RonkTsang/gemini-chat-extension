const CHAT_HISTORY_SELECTOR = '#chat-history infinite-scroller[data-test-id="chat-history-container"]'
const OUTLINE_QUERY_SELECTOR = 'user-query'
const OUTLINE_CONTENT_SELECTOR = `${OUTLINE_QUERY_SELECTOR}, model-response, ${CHAT_HISTORY_SELECTOR}`

export function isOutlineChatWindow(chatWindow: Element, pathname: string): boolean {
  return pathname !== '/images' && pathname !== '/images/' &&
    chatWindow.closest('discovery-images-page') === null
}

export function resolveOutlineScroller(chatWindow: HTMLElement): HTMLElement | undefined {
  const scrollers = chatWindow.querySelectorAll<HTMLElement>(CHAT_HISTORY_SELECTOR)
  return scrollers.length === 1 ? scrollers[0] : undefined
}

export function readOutlineQueries(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(OUTLINE_QUERY_SELECTOR))
}

export function containsOutlineContent(node: Node): boolean {
  return node instanceof Element && (
    node.matches(OUTLINE_CONTENT_SELECTOR) || node.querySelector(OUTLINE_CONTENT_SELECTOR) !== null
  )
}

export function getOutlineScrollEnd(scroller: HTMLElement): number {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
}

function getOutlineReadingLine(scroller: HTMLElement): number {
  const paddingTop = Number.parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0
  return scroller.getBoundingClientRect().top + scroller.clientTop + paddingTop
}

export function findCurrentOutlineQuery(scroller: HTMLElement, queries: readonly HTMLElement[]): number {
  if (queries.length < 2) return 0

  if (scroller.scrollTop > 0 && scroller.scrollTop >= getOutlineScrollEnd(scroller) - 1) {
    return queries.length - 1
  }

  // One pixel allows for subpixel rounding when a prompt lands at the reading line.
  const readingLine = getOutlineReadingLine(scroller) + 1
  for (let index = queries.length - 1; index > 0; index--) {
    if (queries[index].getBoundingClientRect().top <= readingLine) return index
  }
  return 0
}

export function getOutlineQueryScrollTop(scroller: HTMLElement, query: HTMLElement): number {
  const marginTop = Number.parseFloat(getComputedStyle(query).scrollMarginTop) || 0
  const top = scroller.scrollTop + query.getBoundingClientRect().top - getOutlineReadingLine(scroller) - marginTop
  return Math.max(0, Math.min(top, getOutlineScrollEnd(scroller)))
}

function outlineScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

export function scrollOutlineTo(scroller: HTMLElement, top: number, behavior = outlineScrollBehavior()): void {
  scroller.scrollTo({ top, behavior })
}

export function scrollToOutlineQuery(chatWindow: HTMLElement, query: HTMLElement): void {
  const scroller = resolveOutlineScroller(chatWindow)
  if (scroller?.contains(query)) {
    scrollOutlineTo(scroller, getOutlineQueryScrollTop(scroller, query))
    return
  }
  query.scrollIntoView({ behavior: outlineScrollBehavior(), block: 'start' })
}

export function readSubmittedQuoteText(userQuery: Element): string {
  const quotes = userQuery.querySelectorAll('.submitted-quote-in-query')
  return quotes.length === 1 ? quotes[0].textContent?.trim() ?? '' : ''
}
