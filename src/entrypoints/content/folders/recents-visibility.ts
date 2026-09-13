import { geminiDomSelectors, queryFirstMatchingElement } from '@/services/gemini-dom/selectors'
import { folderRuntime } from './runtime'

const HIDDEN_ATTRIBUTE = 'data-gpk-folders-recents-hidden'
const PREVIOUS_DISPLAY_ATTRIBUTE = 'data-gpk-folders-previous-display'
const PREVIOUS_DISPLAY_PRIORITY_ATTRIBUTE = 'data-gpk-folders-previous-display-priority'

function uniqueMatches(root: ParentNode, selectors: readonly string[]): Element[] {
  return [...new Set(selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector))))]
}

function chatIdFromLink(link: HTMLAnchorElement): string | undefined {
  const match = new URL(link.href, window.location.origin).pathname.match(/^\/app\/([^/?#]+)$/u)
  return match?.[1]
}

function isPinned(row: Element): boolean {
  return Boolean(row.closest('[data-test-id*="pinned" i], [data-pinned="true"], [aria-label*="Pinned" i]'))
}

/**
 * Recents filtering is intentionally fail-closed. We touch rows only after a
 * complete, unique DOM interpretation; any uncertain state restores Gemini's
 * native list synchronously rather than leaving a chat inaccessible.
 */
export class FolderRecentsVisibilityController {
  private observer?: MutationObserver
  private unsubscribeRuntime?: () => void
  private running = false
  private queued = false

  start(): void {
    if (this.running) return
    this.running = true
    this.observer = new MutationObserver(() => this.queueReconcile())
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'aria-current', 'class'] })
    this.unsubscribeRuntime = folderRuntime.subscribe(() => this.queueReconcile())
    this.reconcile()
  }

  stop(): void {
    this.running = false
    this.observer?.disconnect()
    this.observer = undefined
    this.unsubscribeRuntime?.()
    this.unsubscribeRuntime = undefined
    this.restoreAll()
  }

  private queueReconcile(): void {
    if (!this.running || this.queued) return
    this.queued = true
    queueMicrotask(() => this.reconcile())
  }

  private reconcile(): void {
    this.queued = false
    if (!this.running) return
    const state = folderRuntime.getSnapshot()
    if (
      state.identity.status !== 'available'
      || state.identity.identity.source !== 'observed'
      || !state.projection?.settings.enabled
      || !state.projection.settings.hideOrganizedChats
      || state.error
    ) {
      this.restoreAll()
      return
    }

    const sideNav = queryFirstMatchingElement([document], geminiDomSelectors.sideNav.root)
    const chatsSection = sideNav && queryFirstMatchingElement([sideNav], geminiDomSelectors.sideNav.chatsSection)
    if (!sideNav || !chatsSection) {
      this.restoreAll()
      return
    }

    const links = uniqueMatches(chatsSection, geminiDomSelectors.sideNav.conversationLink) as HTMLAnchorElement[]
    const records = links.map((link) => ({
      link,
      chatId: chatIdFromLink(link),
      row: link.closest('gem-nav-list-item[data-test-id="conversation"], [data-test-id="conversation"]'),
    }))
    // A partial DOM interpretation is worse than no filtering: restore all.
    if (!records.length || records.some((record) => !record.chatId || !record.row)) {
      this.restoreAll()
      return
    }

    const organizedIds = new Set(state.projection.memberships.map((membership) => membership.chatId))
    const currentChatId = new URL(window.location.href).pathname.match(/^\/app\/([^/?#]+)$/u)?.[1]
    for (const record of records) {
      const isCurrent = record.chatId === currentChatId || record.link.getAttribute('aria-current') === 'page'
      const shouldHide = Boolean(record.chatId && organizedIds.has(record.chatId) && !isCurrent && !isPinned(record.row!))
      if (shouldHide) this.hide(record.row!)
      else this.restore(record.row!)
    }
  }

  private hide(row: Element): void {
    const element = row as HTMLElement
    if (row.getAttribute(HIDDEN_ATTRIBUTE) === 'true') {
      element.style.setProperty('display', 'none', 'important')
      return
    }
    element.setAttribute(PREVIOUS_DISPLAY_ATTRIBUTE, element.style.getPropertyValue('display'))
    element.setAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTRIBUTE, element.style.getPropertyPriority('display'))
    element.style.setProperty('display', 'none', 'important')
    element.setAttribute(HIDDEN_ATTRIBUTE, 'true')
  }

  private restore(row: Element): void {
    if (row.getAttribute(HIDDEN_ATTRIBUTE) !== 'true') return
    const element = row as HTMLElement
    const previous = element.getAttribute(PREVIOUS_DISPLAY_ATTRIBUTE) ?? ''
    const priority = element.getAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTRIBUTE) ?? ''
    if (previous) element.style.setProperty('display', previous, priority)
    else element.style.removeProperty('display')
    element.removeAttribute(HIDDEN_ATTRIBUTE)
    element.removeAttribute(PREVIOUS_DISPLAY_ATTRIBUTE)
    element.removeAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTRIBUTE)
  }

  private restoreAll(): void {
    document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}="true"]`).forEach((row) => this.restore(row))
  }
}
