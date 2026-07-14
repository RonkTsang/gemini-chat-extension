import { t } from '@/utils/i18n'

export const CHAT_HEADER_SELECTOR = 'side-navigation-content > div > div > infinite-scroller > expandable-section[storagekey="chats"][data-test-id="chats-expandable-section"] > button.expandable-section-header'

const ENTRY_SPACER_ATTR = 'data-gpk-bulk-delete-entry-spacer'
const ENTRY_ROOT_ATTR = 'data-gpk-bulk-delete-entry-root'
const MENU_ATTR = 'data-gpk-bulk-delete-menu'
const ROW_ATTR = 'data-gpk-bulk-delete-row'
const CONTENT_ATTR = 'data-gpk-bulk-delete-content'
const CONVERSATION_KEY_ATTR = 'data-gpk-conversation-key'
const CHECKBOX_SELECTOR = '.gpk-bulk-delete-checkbox'
const LOAD_WARNING_SELECTOR = '#gpk-bulk-delete-load-warning'
const PROGRESS_OVERLAY_SELECTOR = '[data-gpk-bulk-delete-progress-overlay]'
export const STICKY_ACTION_BAR_ATTR = 'data-gpk-bulk-delete-sticky-action-bar'
const RECENT_LIMIT_OPTIONS = [10, 20, 30, 50] as const

const CHAT_LINK_SELECTORS = [
  'conversations-list a[href^="/app/"]',
  'conversations-list a[href*="gemini.google.com/app/"]',
  'chat-history a[href^="/app/"]',
  'chat-history a[href*="gemini.google.com/app/"]',
  '.chat-history a[href^="/app/"]',
  '.chat-history-scroll-container a[href^="/app/"]',
  'bard-sidenav-content a[href^="/app/"]',
  'side-navigation-v2 a[href^="/app/"]',
  'side-navigation-content a[href^="/app/"]',
  'gem-nav-list-item[data-test-id="conversation"] a[href^="/app/"]',
]

const CHAT_HISTORY_CONTAINER_SELECTORS = [
  'conversations-list',
  'chat-history',
  '.chat-history',
  '.chat-history-scroll-container',
  'bard-sidenav-content',
  'side-navigation-v2',
  'side-navigation-content',
  'div[role="list"]',
  '.conversations-container',
  '[data-test-id="conversations-list"]',
]

const SHOW_MORE_SELECTORS = [
  '.show-more-button',
  'button[data-test-id*="show-more"]',
  'button[aria-label*="more conversations" i]',
  'button[aria-label*="show more" i]',
]

const LOADING_HISTORY_SELECTORS = [
  '[data-test-id="loading-history-spinner"]',
]

const LOAD_FAILED_PATTERN = /couldn['’]?t load recent chats|try reloading this page/i
const EXCLUDED_APP_PATHS = new Set(['activity', 'apikey', 'extensions', 'gems', 'help', 'settings', 'signin', 'tasks'])

export interface ChatRow {
  key: string
  row: HTMLElement
  link: HTMLAnchorElement
  checkbox?: HTMLInputElement
}

export interface LoadRowsResult {
  completed: boolean
  reason?: 'scroller-not-found' | 'timeout' | 'gemini-load-failed'
}

export function findChatHeader(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(CHAT_HEADER_SELECTOR)
}

export function ensureEntryMount(header: HTMLElement): HTMLElement {
  const existing = header.querySelector<HTMLElement>(`[${ENTRY_ROOT_ATTR}]`)
  if (existing) {
    return existing
  }

  const spacer = document.createElement('div')
  spacer.setAttribute(ENTRY_SPACER_ATTR, 'true')

  const root = document.createElement('div')
  root.setAttribute(ENTRY_ROOT_ATTR, 'true')
  spacer.appendChild(root)
  header.appendChild(spacer)
  return root
}

export function removeEntryMount(root: HTMLElement): void {
  root.closest(`[${ENTRY_SPACER_ATTR}]`)?.remove()
}

export function findBulkMenu(header: HTMLElement): HTMLElement | null {
  const next = header.nextElementSibling
  if (next instanceof HTMLElement && next.hasAttribute(MENU_ATTR)) {
    return next
  }
  return null
}

export function ensureBulkMenu(
  header: HTMLElement,
  handlers: {
    onSelectRecent: () => void
    onRecentLimitChange: (limit: number) => void
    onDeselectPinned: () => void
    onDeselectAll: () => void
    onDelete: () => void
  },
): HTMLElement {
  const existing = findBulkMenu(header)
  if (existing) {
    return existing
  }

  const menu = document.createElement('div')
  menu.setAttribute(MENU_ATTR, 'true')
  syncMenuFont(menu, header)

  const recentRow = document.createElement('div')
  recentRow.setAttribute('data-gpk-bulk-delete-recent-row', 'true')

  const selectRecent = document.createElement('button')
  selectRecent.type = 'button'
  selectRecent.dataset.action = 'select-recent'
  selectRecent.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onSelectRecent()
  })

  const changeLimit = document.createElement('button')
  changeLimit.type = 'button'
  changeLimit.dataset.action = 'change-recent-limit'
  changeLimit.textContent = t('bulkDelete.change')
  changeLimit.setAttribute('aria-expanded', 'false')
  changeLimit.setAttribute('aria-haspopup', 'menu')

  const limitPanel = document.createElement('div')
  limitPanel.setAttribute('data-gpk-bulk-delete-limit-panel', 'true')
  limitPanel.setAttribute('role', 'menu')
  limitPanel.hidden = true

  RECENT_LIMIT_OPTIONS.forEach((limit) => {
    const option = document.createElement('button')
    option.type = 'button'
    option.dataset.action = 'recent-limit-option'
    option.dataset.limit = String(limit)
    option.textContent = String(limit)
    option.setAttribute('role', 'menuitemradio')
    option.setAttribute('aria-label', t('bulkDelete.selectRecent', String(limit)))
    option.addEventListener('click', () => {
      handlers.onRecentLimitChange(limit)
      limitPanel.hidden = true
      changeLimit.setAttribute('aria-expanded', 'false')
    })
    limitPanel.appendChild(option)
  })

  changeLimit.addEventListener('click', () => {
    const isOpen = !limitPanel.hidden
    limitPanel.hidden = isOpen
    changeLimit.setAttribute('aria-expanded', String(!isOpen))
  })

  const submit = document.createElement('button')
  submit.type = 'button'
  submit.setAttribute('data-gpk-bulk-delete-submit', 'true')
  submit.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onDelete()
  })

  const actionRow = document.createElement('div')
  actionRow.setAttribute('data-gpk-bulk-delete-action-row', 'true')

  const deselectPinned = document.createElement('button')
  deselectPinned.type = 'button'
  deselectPinned.dataset.action = 'deselect-pinned'
  deselectPinned.textContent = t('bulkDelete.deselectPinned')
  deselectPinned.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onDeselectPinned()
  })

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.dataset.action = 'deselect-all'
  cancel.textContent = t('bulkDelete.deselectAll')
  cancel.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onDeselectAll()
  })

  recentRow.append(selectRecent, changeLimit)
  actionRow.append(deselectPinned, cancel)
  menu.append(recentRow, limitPanel, actionRow, submit)
  header.insertAdjacentElement('afterend', menu)
  return menu
}

function syncMenuFont(menu: HTMLElement, header: HTMLElement): void {
  const fontFamily = window.getComputedStyle(header).fontFamily
  if (fontFamily) {
    menu.style.fontFamily = fontFamily
  }
}

export function removeBulkMenu(): void {
  document.querySelectorAll(`[${MENU_ATTR}]`).forEach(element => element.remove())
}

export function updateBulkMenu(menu: HTMLElement, selectedCount: number, options: {
  loading: boolean
  deleting: boolean
  recentLimit: number
  selectedPinnedCount: number
}): void {
  const selectRecent = menu.querySelector<HTMLButtonElement>('button[data-action="select-recent"]')
  const changeLimit = menu.querySelector<HTMLButtonElement>('button[data-action="change-recent-limit"]')
  const limitOptions = menu.querySelectorAll<HTMLButtonElement>('button[data-action="recent-limit-option"]')
  const actionRow = menu.querySelector<HTMLElement>('[data-gpk-bulk-delete-action-row]')
  const deselectPinned = menu.querySelector<HTMLButtonElement>('button[data-action="deselect-pinned"]')
  const deselectAll = menu.querySelector<HTMLButtonElement>('button[data-action="deselect-all"]')
  const submit = menu.querySelector<HTMLButtonElement>('[data-gpk-bulk-delete-submit]')
  const disabled = options.loading || options.deleting

  if (selectRecent) {
    setDisabled(selectRecent, disabled)
    setText(selectRecent, options.loading
      ? t('bulkDelete.loading')
      : t('bulkDelete.selectRecent', String(options.recentLimit)))
  }
  if (changeLimit) {
    setDisabled(changeLimit, disabled)
  }
  limitOptions.forEach((option) => {
    setDisabled(option, disabled)
    setAttribute(option, 'aria-checked', String(option.dataset.limit === String(options.recentLimit)))
  })
  if (actionRow) {
    setHidden(actionRow, selectedCount === 0)
  }
  if (deselectPinned) {
    setHidden(deselectPinned, selectedCount === 0)
    setDisabled(deselectPinned, disabled || options.selectedPinnedCount === 0)
  }
  if (deselectAll) {
    setHidden(deselectAll, selectedCount === 0)
    setDisabled(deselectAll, disabled)
  }
  if (submit) {
    setDisabled(submit, disabled || selectedCount === 0)
    setText(submit, selectedCount > 0 ? t('bulkDelete.deleteSelected', String(selectedCount)) : t('bulkDelete.deleteIdle'))
    toggleClass(submit, 'is-enabled', selectedCount > 0)
  }
}

function setDisabled(control: HTMLButtonElement, disabled: boolean): void {
  if (control.disabled !== disabled) {
    control.disabled = disabled
  }
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text
  }
}

function setAttribute(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value)
  }
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) {
    element.hidden = hidden
  }
}

function toggleClass(element: HTMLElement, className: string, force: boolean): void {
  if (element.classList.contains(className) !== force) {
    element.classList.toggle(className, force)
  }
}

function isBulkDeleteOwnedElement(element: Element): boolean {
  return element.matches([
    `[${ENTRY_SPACER_ATTR}]`,
    `[${ENTRY_ROOT_ATTR}]`,
    `[${MENU_ATTR}]`,
    CHECKBOX_SELECTOR,
    LOAD_WARNING_SELECTOR,
    PROGRESS_OVERLAY_SELECTOR,
    `[${STICKY_ACTION_BAR_ATTR}]`,
  ].join(','))
    || Boolean(element.closest([
      `[${ENTRY_SPACER_ATTR}]`,
      `[${MENU_ATTR}]`,
      CHECKBOX_SELECTOR,
      LOAD_WARNING_SELECTOR,
      PROGRESS_OVERLAY_SELECTOR,
      `[${STICKY_ACTION_BAR_ATTR}]`,
    ].join(',')))
}

function isBulkDeleteOwnedNode(node: Node): boolean {
  return node instanceof Element && isBulkDeleteOwnedElement(node)
}

function isBulkDeleteOwnedMutation(mutation: MutationRecord): boolean {
  if (mutation.target instanceof Element && isBulkDeleteOwnedElement(mutation.target)) {
    return true
  }

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]
  return changedNodes.length > 0 && changedNodes.every(isBulkDeleteOwnedNode)
}

export function shouldIgnoreBulkDeleteMutations(mutations: MutationRecord[]): boolean {
  return mutations.length > 0 && mutations.every(isBulkDeleteOwnedMutation)
}

function isValidConversationHref(href: string | null): boolean {
  if (!href) {
    return false
  }

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) {
      return false
    }
    const [section, conversationId] = url.pathname.split('/').filter(Boolean)
    return section === 'app'
      && Boolean(conversationId)
      && !EXCLUDED_APP_PATHS.has(conversationId.toLowerCase())
      && /^[a-z0-9_-]{8,}$/i.test(conversationId)
  } catch {
    return false
  }
}

function getConversationKey(link: HTMLAnchorElement): string | null {
  if (!isValidConversationHref(link.getAttribute('href'))) {
    return null
  }
  return new URL(link.getAttribute('href') ?? '', window.location.origin).pathname
}

function findRowForLink(link: HTMLAnchorElement): HTMLElement {
  const directRow = link.closest<HTMLElement>('gem-nav-list-item[data-test-id="conversation"], [data-test-id="conversation"], [data-conversation-id], .conversation-item, [role="listitem"], li')
  if (directRow) {
    return directRow
  }

  let candidate: HTMLElement = link
  let element: HTMLElement | null = link.parentElement
  while (element && element !== document.body) {
    if (element.matches('conversations-list, chat-history, .chat-history, .chat-history-scroll-container, bard-sidenav-content, side-navigation-v2, side-navigation-content')) {
      break
    }
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(item => isValidConversationHref(item.getAttribute('href')))
    if (links.length === 1) {
      candidate = element
    }
    element = element.parentElement
  }

  return candidate
}

export function getChatRows(root: ParentNode = document): ChatRow[] {
  const rows: ChatRow[] = []
  const seen = new Set<string>()

  const links = CHAT_LINK_SELECTORS.flatMap((selector) => Array.from(root.querySelectorAll<HTMLAnchorElement>(selector)))
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/app/"]').forEach(link => links.push(link))

  links.forEach((link) => {
    if (link.closest(`[${MENU_ATTR}], [${ENTRY_SPACER_ATTR}]`)) {
      return
    }

    const key = getConversationKey(link)
    if (!key || seen.has(key)) {
      return
    }

    seen.add(key)
    const row = findRowForLink(link)
    rows.push({
      key,
      row,
      link,
      checkbox: Array.from(row.querySelectorAll<HTMLInputElement>('.gpk-bulk-delete-checkbox'))
        .find(checkbox => checkbox.getAttribute(CONVERSATION_KEY_ATTR) === key),
    })
  })

  return rows
}

export function reconcileChatCheckboxes(selectedKeys: Set<string>, onChange: (key: string, selected: boolean) => void): ChatRow[] {
  const rows = getChatRows()

  rows.forEach((chatRow, index) => {
    chatRow.row.setAttribute(ROW_ATTR, 'true')
    chatRow.row.dataset.gpkConversationKey = chatRow.key
    chatRow.link.setAttribute(CONTENT_ATTR, 'true')

    let checkbox = chatRow.checkbox
    if (!checkbox) {
      checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'gpk-bulk-delete-checkbox'
      checkbox.setAttribute(CONVERSATION_KEY_ATTR, chatRow.key)
      checkbox.dataset.index = String(index)
      checkbox.setAttribute('aria-label', t('bulkDelete.selectConversation'))
      checkbox.addEventListener('pointerdown', event => event.stopPropagation())
      checkbox.addEventListener('mousedown', event => event.stopPropagation())
      checkbox.addEventListener('click', event => event.stopPropagation())
      checkbox.addEventListener('change', () => onChange(chatRow.key, Boolean(checkbox?.checked)))
      chatRow.row.insertBefore(checkbox, chatRow.row.firstChild)
    }

    checkbox.checked = selectedKeys.has(chatRow.key)
    chatRow.checkbox = checkbox
  })

  return rows
}

export function cleanupChatCheckboxes(): void {
  document.querySelectorAll(CHECKBOX_SELECTOR).forEach(element => element.remove())
  document.querySelectorAll(`[${ROW_ATTR}]`).forEach((element) => {
    element.removeAttribute(ROW_ATTR)
    delete (element as HTMLElement).dataset.gpkConversationKey
  })
  document.querySelectorAll(`[${CONTENT_ATTR}]`).forEach(element => element.removeAttribute(CONTENT_ATTR))
}

export function isPinnedChatRow(row: Element): boolean {
  if (row.querySelector('.trailing-content mat-icon[data-mat-icon-name="push_pin"], .trailing-content mat-icon[fonticon="push_pin"], mat-icon[data-mat-icon-name="push_pin"], mat-icon[fonticon="push_pin"]')) {
    return true
  }

  const link = row.querySelector<HTMLAnchorElement>('a[href^="/app/"]')
  const jslog = link?.getAttribute('jslog') ?? ''
  return /BardVeMetadataKey:.*\["c_[^"]+",null,1,/i.test(jslog.replace(/&quot;/g, '"'))
}

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && element.offsetParent !== null
}

function findFirstVisible(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (isVisibleElement(element) && !element.hasAttribute('disabled')) {
      return element
    }
  }
  return null
}

function hasLoadFailure(): boolean {
  const statusElements = document.querySelectorAll(['mat-snack-bar-container', '.mat-mdc-snack-bar-container', '[role="status"]', '[aria-live]'].join(','))
  return Array.from(statusElements).some(element => LOAD_FAILED_PATTERN.test(element.textContent ?? ''))
    || LOAD_FAILED_PATTERN.test(document.body.textContent ?? '')
}

function isScrollable(element: HTMLElement): boolean {
  return element instanceof HTMLElement && element.scrollHeight > element.clientHeight + 20
}

function scoreScroller(element: HTMLElement): number {
  if (!isScrollable(element)) {
    return Number.NEGATIVE_INFINITY
  }

  const chatLinkCount = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter(link => isValidConversationHref(link.getAttribute('href'))).length
  const containsConversationList = Boolean(element.querySelector('conversations-list, [data-test-id="conversations-list"]'))
  const inSidenav = Boolean(element.closest('bard-sidenav-content, side-navigation-v2, side-navigation-content, [role="navigation"]'))
  const inMainContent = Boolean(element.closest('chat-window, .main-content')) && !containsConversationList
  let score = 0
  if (containsConversationList) score += 1000
  score += Math.min(chatLinkCount, 200)
  if (element.matches('infinite-scroller')) score += 50
  if (inSidenav) score += 50
  if ((element.className || '').toString().includes('chat-history') && !containsConversationList) score -= 300
  if (inMainContent) score -= 500
  return score
}

export function findHistoryScroller(): HTMLElement | null {
  const header = findChatHeader()
  let ancestor: HTMLElement | null = header?.parentElement ?? null
  while (ancestor && ancestor !== document.body) {
    if (isScrollable(ancestor)) {
      return ancestor
    }
    const parent: HTMLElement | null = ancestor.parentElement
    ancestor = parent
  }

  let best: HTMLElement | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  CHAT_HISTORY_CONTAINER_SELECTORS.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const score = scoreScroller(element)
      if (score > bestScore) {
        best = element
        bestScore = score
      }
    })
  })
  return bestScore > 0 ? best : null
}

function scrollToBottom(scroller: HTMLElement): void {
  const top = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top, behavior: 'auto' })
  } else {
    scroller.scrollTop = top
  }
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      reject(new Error('aborted'))
    }, { once: true })
  })
}

async function waitForLoadingHidden(timeoutMs = 7000, signal?: AbortSignal): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      throw new Error('aborted')
    }
    const loading = LOADING_HISTORY_SELECTORS.some(selector => isVisibleElement(document.querySelector(selector)))
    if (!loading) {
      return
    }
    await wait(100, signal)
  }
}

export async function loadLatestChatRows(
  limit: number,
  selectedKeys: Set<string>,
  onChange: (key: string, selected: boolean) => void,
  signal?: AbortSignal,
  matchesRow: (row: ChatRow) => boolean = () => true,
): Promise<LoadRowsResult> {
  const scroller = findHistoryScroller()
  if (!scroller) {
    return { completed: false, reason: 'scroller-not-found' }
  }

  let previousCount = -1
  let stagnantRounds = 0
  const startedAt = Date.now()

  for (let round = 0; round < 24 && stagnantRounds < 3; round++) {
    if (Date.now() - startedAt > 30000) {
      return { completed: false, reason: 'timeout' }
    }

    const rows = reconcileChatCheckboxes(selectedKeys, onChange)
    if (rows.filter(matchesRow).length >= limit) {
      return { completed: true }
    }

    scrollToBottom(scroller)
    await wait(600, signal)
    await waitForLoadingHidden(7000, signal)

    if (hasLoadFailure()) {
      return { completed: false, reason: 'gemini-load-failed' }
    }

    const showMoreButton = findFirstVisible(SHOW_MORE_SELECTORS)
    if (showMoreButton) {
      showMoreButton.click()
      await wait(500, signal)
      await waitForLoadingHidden(7000, signal)
      if (hasLoadFailure()) {
        return { completed: false, reason: 'gemini-load-failed' }
      }
    }

    const nextRows = reconcileChatCheckboxes(selectedKeys, onChange)
    const nearBottom = Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 96
    if (nearBottom && nextRows.length === previousCount) {
      stagnantRounds++
    } else {
      stagnantRounds = 0
    }
    previousCount = nextRows.length
  }

  return { completed: true }
}

export function showLoadFailedWarning(): void {
  const existing = document.getElementById('gpk-bulk-delete-load-warning')
  existing?.remove()
  const warning = document.createElement('div')
  warning.id = 'gpk-bulk-delete-load-warning'
  warning.textContent = t('bulkDelete.loadFailed')
  warning.style.cssText = [
    'position: fixed',
    'top: 20px',
    'right: 20px',
    'max-width: 360px',
    'background: #fbbc04',
    'color: #202124',
    'padding: 12px 16px',
    'border-radius: 8px',
    'font-family: Google Sans, Roboto, Arial, sans-serif',
    'font-size: 14px',
    'font-weight: 500',
    'line-height: 1.35',
    'z-index: 2147483646',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.2)',
  ].join(';')
  document.body.appendChild(warning)
  window.setTimeout(() => warning.remove(), 5000)
}
