import { geminiDomSelectors, queryFirstMatchingElement } from '@/services/gemini-dom/selectors'
import { tt } from '@/utils/i18n'
import { createFolderTraceId, logFolderTrace } from '@/utils/folderTrace'
import {
  chatIdFromConversationLink,
  chatTitleFromConversationLink,
} from './conversation-metadata'
import { folderRuntime } from './runtime'

const ENTRY_SELECTOR = '[data-gpk-folder-menu-entry]'
const SEPARATOR_SELECTOR = '[data-gpk-folder-menu-separator]'

function uniqueMatches(root: ParentNode, selectors: readonly string[]): Element[] {
  return [...new Set(selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector))))]
}

export class FolderNativeMenuBridge {
  private observer?: MutationObserver
  private unsubscribeRuntime?: () => void
  private running = false
  private queued = false

  start(): void {
    if (this.running) return
    this.running = true
    this.observer = new MutationObserver(() => this.queueReconcile())
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-controls', 'class'] })
    this.unsubscribeRuntime = folderRuntime.subscribe(() => this.queueReconcile())
    this.reconcile()
  }

  stop(): void {
    this.running = false
    this.observer?.disconnect()
    this.observer = undefined
    this.unsubscribeRuntime?.()
    this.unsubscribeRuntime = undefined
    this.removeInjectedNodes()
    folderRuntime.closePicker()
  }

  private queueReconcile(): void {
    if (!this.running || this.queued) return
    this.queued = true
    queueMicrotask(() => this.reconcile())
  }

  private reconcile(): void {
    this.queued = false
    if (!this.running) return
    const runtimeState = folderRuntime.getSnapshot()
    if (
      runtimeState.identity.status !== 'available'
      || !runtimeState.projection?.settings.enabled
    ) {
      return this.closePickerAndRemoveInjectedNodes()
    }
    const sideNav = queryFirstMatchingElement([document], geminiDomSelectors.sideNav.root)
    if (!sideNav) return this.closePickerAndRemoveInjectedNodes()
    const rows = uniqueMatches(sideNav, geminiDomSelectors.sideNav.activeConversationRow)
    if (rows.length !== 1) return this.closePickerAndRemoveInjectedNodes()
    const row = rows[0]
    const links = uniqueMatches(row, geminiDomSelectors.sideNav.conversationLink) as HTMLAnchorElement[]
    const triggers = uniqueMatches(row, geminiDomSelectors.sideNav.activeConversationMenuTrigger) as HTMLElement[]
    if (links.length !== 1 || triggers.length !== 1) return this.closePickerAndRemoveInjectedNodes()
    const chatId = chatIdFromConversationLink(links[0])
    const cachedTitle = chatTitleFromConversationLink(links[0])
    const menuId = triggers[0].getAttribute('aria-controls')
    const menus = uniqueMatches(document, geminiDomSelectors.sideNav.openConversationActionsMenu)
      .filter((menu) => menu.id === menuId && menu.isConnected)
    if (!chatId || !menuId || menus.length !== 1) return this.closePickerAndRemoveInjectedNodes()
    const menu = menus[0] as HTMLElement
    const menuItems = uniqueMatches(menu, ['[role="menuitem"]'])
    const parent = menuItems[0]?.parentElement
    if (!parent || !menuItems.length || menuItems.some((item) => item.parentElement !== parent)) {
      return this.closePickerAndRemoveInjectedNodes()
    }
    this.inject(parent, menuItems[0] as HTMLElement, chatId, cachedTitle)
  }

  private inject(
    container: HTMLElement,
    nativeMenuItem: HTMLElement,
    chatId: string,
    cachedTitle?: string,
  ): void {
    const existing = container.querySelector(`:scope > ${ENTRY_SELECTOR}`) as HTMLElement | null
    if (existing) {
      existing.dataset.gpkFolderChatId = chatId
      existing.dataset.gpkFolderChatTitle = cachedTitle ?? ''
      return
    }
    this.removeInjectedNodes()
    const separator = document.createElement('div')
    separator.setAttribute('data-gpk-folder-menu-separator', '')
    separator.setAttribute('role', 'separator')
    // Clone an item from this menu rather than recreating its styles. Gemini's
    // menu classes and inner layout are runtime-owned and change independently
    // of the extension.
    const entry = nativeMenuItem.cloneNode(true) as HTMLElement
    entry.removeAttribute('data-test-id')
    entry.removeAttribute('jslog')
    entry.setAttribute('data-gpk-folder-menu-entry', '')
    entry.setAttribute('role', 'menuitem')
    entry.setAttribute('tabindex', '-1')
    entry.setAttribute('aria-haspopup', 'menu')
    entry.setAttribute('aria-expanded', 'false')
    entry.dataset.gpkFolderChatId = chatId
    entry.dataset.gpkFolderChatTitle = cachedTitle ?? ''
    const label = entry.querySelector<HTMLElement>('.gem-menu-item-label')
    if (label) label.textContent = tt('folders_add_to_folder', 'Add to Folder')
    else entry.replaceChildren(tt('folders_add_to_folder', 'Add to Folder'))
    entry.querySelector<HTMLElement>('gem-icon')?.setAttribute('fonticonname', 'folder')
    entry.querySelector<HTMLElement>('mat-icon')?.setAttribute('data-mat-icon-name', 'folder')
    entry.querySelector<HTMLElement>('mat-icon')?.setAttribute('fonticon', 'folder')
    const openPicker = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const currentChatId = entry.dataset.gpkFolderChatId
      if (!currentChatId) return
      const currentCachedTitle = entry.dataset.gpkFolderChatTitle || undefined
      const traceId = createFolderTraceId()
      logFolderTrace(traceId, 'native-menu.open-picker', {
        chatId: currentChatId,
        cachedTitleFound: Boolean(currentCachedTitle),
      })
      entry.setAttribute('aria-expanded', 'true')
      folderRuntime.openPicker(
        currentChatId,
        entry.getBoundingClientRect(),
        traceId,
        currentCachedTitle,
      )
    }
    entry.addEventListener('pointerdown', (event) => {
      openPicker(event)
    })
    entry.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      // Pointer activation already opened on pointerdown so Gemini cannot
      // remove its native menu before the picker anchors. A detail of zero is
      // keyboard/programmatic activation and still needs to open here.
      if (event.detail === 0) openPicker(event)
    })
    container.append(separator, entry)
  }

  private closePickerAndRemoveInjectedNodes(): void {
    folderRuntime.closePicker()
    this.removeInjectedNodes()
  }

  private removeInjectedNodes(): void {
    document.querySelectorAll(`${ENTRY_SELECTOR}, ${SEPARATOR_SELECTOR}`).forEach((node) => node.remove())
  }
}
