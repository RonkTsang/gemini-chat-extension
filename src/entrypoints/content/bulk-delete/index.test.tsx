import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupChatCheckboxes,
  ensureBulkMenu,
  ensureEntryMount,
  findChatHeader,
  getChatRows,
  isPinnedChatRow,
  reconcileChatCheckboxes,
  removeBulkMenu,
  shouldIgnoreBulkDeleteMutations,
  updateBulkMenu,
} from './dom'
import { __bulkDeleteTestApi, stopBulkDelete } from './index'

vi.mock('@/utils/i18n', () => ({
  t: (id: string, substitutions?: string | string[]) => {
    if (id === 'bulkDelete.deleteSelected') {
      const count = Array.isArray(substitutions) ? substitutions[0] : substitutions
      return `Delete (${count})`
    }
    const map: Record<string, string> = {
      'bulkDelete.selectRecent': `Select ${substitutions} recent`,
      'bulkDelete.selectUnpinned': `Select ${substitutions} unpinned`,
      'bulkDelete.excludePinned': 'Exclude pinned',
      'bulkDelete.change': 'Change',
      'bulkDelete.deselectPinned': 'Deselect pinned',
      'bulkDelete.deleteIdle': 'Delete (0)',
      'bulkDelete.loading': 'Loading...',
      'bulkDelete.selectConversation': 'Select conversation',
      'bulkDelete.deselectAll': 'Deselect all',
    }
    return map[id] ?? id
  },
}))

const defaultMenuOptions = {
  loading: false,
  deleting: false,
  recentLimit: 50,
  excludePinned: false,
  selectedPinnedCount: 0,
}

function renderSidenav(count = 3): void {
  const items = Array.from({ length: count }, (_, index) => {
    const id = String(index + 1).padStart(8, '0')
    return `
      <gem-nav-list-item data-test-id="conversation">
        <a href="/app/${id}" aria-label="Chat ${index + 1}">
          <span class="title-text">Chat ${index + 1}</span>
          <div class="mat-mdc-list-item-meta trailing-content"></div>
        </a>
        <div class="hovered-trailing-content">
          <gem-icon-button data-test-id="actions-menu-button" aria-haspopup="menu">
            <button aria-label="More options for Chat ${index + 1}"></button>
          </gem-icon-button>
        </div>
      </gem-nav-list-item>
    `
  }).join('')

  document.body.innerHTML = `
    <side-navigation-content>
      <div>
        <div>
          <infinite-scroller>
            <expandable-section storagekey="chats" data-test-id="chats-expandable-section">
              <button class="expandable-section-header" style="font-family: Google Sans Flex, Google Sans, Helvetica Neue, sans-serif;"><span>Chats</span></button>
              <div class="chat-history">${items}</div>
            </expandable-section>
          </infinite-scroller>
        </div>
      </div>
    </side-navigation-content>
  `
}

describe('bulk delete DOM helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    stopBulkDelete()
    cleanupChatCheckboxes()
    removeBulkMenu()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('injects the entry mount into the chats header without duplicates', () => {
    renderSidenav()
    const header = findChatHeader()
    expect(header).not.toBeNull()

    const first = ensureEntryMount(header!)
    const second = ensureEntryMount(header!)

    expect(first).toBe(second)
    expect(header!.querySelectorAll('[data-gpk-bulk-delete-entry-spacer]')).toHaveLength(1)
  })

  it('inserts and updates the bulk menu after the chats header', () => {
    renderSidenav()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent: vi.fn(),
      onRecentLimitChange: vi.fn(),
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })

    expect(header.nextElementSibling).toBe(menu)
    updateBulkMenu(menu, 3, defaultMenuOptions)

    const submit = menu.querySelector<HTMLButtonElement>('[data-gpk-bulk-delete-submit]')
    const deselectAll = menu.querySelector<HTMLButtonElement>('button[data-action="deselect-all"]')
    expect(submit?.textContent).toBe('Delete (3)')
    expect(submit?.disabled).toBe(false)
    expect(deselectAll?.textContent).toBe('Deselect all')
    expect(deselectAll?.hidden).toBe(false)
  })

  it('configures the next recent selection from the Change menu', () => {
    renderSidenav()
    const onSelectRecent = vi.fn()
    const onRecentLimitChange = vi.fn()
    const onExcludePinnedChange = vi.fn()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent,
      onRecentLimitChange,
      onExcludePinnedChange,
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })
    const change = menu.querySelector<HTMLButtonElement>('button[data-action="change-recent-limit"]')!
    const limitOption = menu.querySelector<HTMLButtonElement>('button[data-action="recent-limit-option"][data-limit="30"]')!
    const selectRecent = menu.querySelector<HTMLButtonElement>('button[data-action="select-recent"]')!
    const panel = menu.querySelector<HTMLElement>('[data-gpk-bulk-delete-limit-panel]')!
    const excludePinned = menu.querySelector<HTMLInputElement>('input[data-action="exclude-pinned"]')!

    expect(menu.querySelector('input[data-action="recent-limit"]')).toBeNull()
    change.click()
    expect(panel.hidden).toBe(false)
    limitOption.click()

    expect(onRecentLimitChange).toHaveBeenCalledWith(30)
    expect(panel.hidden).toBe(false)
    expect(onSelectRecent).not.toHaveBeenCalled()

    excludePinned.click()
    expect(onExcludePinnedChange).toHaveBeenCalledWith(true)

    selectRecent.click()

    expect(onSelectRecent).toHaveBeenCalledWith()
  })

  it('reveals the recent count control only after choosing Change', () => {
    renderSidenav()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent: vi.fn(),
      onRecentLimitChange: vi.fn(),
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })
    const change = menu.querySelector<HTMLButtonElement>('button[data-action="change-recent-limit"]')!
    const panel = menu.querySelector<HTMLElement>('[data-gpk-bulk-delete-limit-panel]')!

    expect(panel.hidden).toBe(true)
    change.click()
    expect(panel.hidden).toBe(false)
    expect(change.getAttribute('aria-expanded')).toBe('true')
  })

  it('selects the requested number of recent chats', async () => {
    renderSidenav(3)
    __bulkDeleteTestApi.enterBulkDeleteMode()

    __bulkDeleteTestApi.setRecentLimit(2)
    await __bulkDeleteTestApi.selectRecent()

    expect(document.querySelectorAll('.gpk-bulk-delete-checkbox:checked')).toHaveLength(2)
  })

  it('selects the requested number of unpinned chats when configured', async () => {
    renderSidenav(3)
    const rows = getChatRows()
    rows[0].link.querySelector('.trailing-content')?.insertAdjacentHTML('beforeend', `
      <mat-icon data-mat-icon-name="push_pin" fonticon="push_pin"></mat-icon>
    `)

    __bulkDeleteTestApi.enterBulkDeleteMode()
    __bulkDeleteTestApi.setRecentLimit(2)
    __bulkDeleteTestApi.setExcludePinned(true)
    await __bulkDeleteTestApi.selectRecent()

    const checkboxes = document.querySelectorAll<HTMLInputElement>('.gpk-bulk-delete-checkbox')
    const selectRecent = document.querySelector<HTMLButtonElement>('button[data-action="select-recent"]')!
    expect(checkboxes[0].checked).toBe(false)
    expect(checkboxes[1].checked).toBe(true)
    expect(checkboxes[2].checked).toBe(true)
    expect(selectRecent.textContent).toBe('Select 2 unpinned')
  })

  it('clears selected chats from the menu without exiting bulk delete mode', () => {
    renderSidenav()
    const header = findChatHeader()!
    __bulkDeleteTestApi.enterBulkDeleteMode()
    const menu = header.nextElementSibling as HTMLElement
    const checkbox = document.querySelector<HTMLInputElement>('.gpk-bulk-delete-checkbox')!

    checkbox.click()
    menu.querySelector<HTMLButtonElement>('button[data-action="deselect-all"]')?.click()

    expect(document.querySelector('[data-gpk-bulk-delete-menu]')).not.toBeNull()
    expect(document.querySelectorAll('.gpk-bulk-delete-checkbox:checked')).toHaveLength(0)
    expect(menu.querySelector<HTMLButtonElement>('button[data-action="deselect-all"]')?.hidden).toBe(true)
  })

  it('copies the page header font to the bulk menu', () => {
    renderSidenav()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent: vi.fn(),
      onRecentLimitChange: vi.fn(),
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })

    expect(menu.style.fontFamily).toBe(window.getComputedStyle(header).fontFamily)
  })

  it('does not rewrite the bulk menu when the state is unchanged', async () => {
    renderSidenav()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent: vi.fn(),
      onRecentLimitChange: vi.fn(),
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })
    updateBulkMenu(menu, 3, defaultMenuOptions)

    let mutationCount = 0
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length
    })
    observer.observe(menu, {
      attributes: true,
      childList: true,
      subtree: true,
    })

    updateBulkMenu(menu, 3, defaultMenuOptions)
    await Promise.resolve()
    observer.disconnect()

    expect(mutationCount).toBe(0)
  })

  it('marks bulk delete owned menu mutations as ignorable', async () => {
    renderSidenav()
    const header = findChatHeader()!
    const menu = ensureBulkMenu(header, {
      onSelectRecent: vi.fn(),
      onRecentLimitChange: vi.fn(),
      onDeselectPinned: vi.fn(),
      onDeselectAll: vi.fn(),
      onDelete: vi.fn(),
    })

    const records: MutationRecord[] = []
    const observer = new MutationObserver((mutations) => {
      records.push(...mutations)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    updateBulkMenu(menu, 3, defaultMenuOptions)
    await Promise.resolve()
    observer.disconnect()

    expect(records.length).toBeGreaterThan(0)
    expect(shouldIgnoreBulkDeleteMutations(records)).toBe(true)
  })

  it('injects checkboxes and prevents row navigation on checkbox click', () => {
    renderSidenav(1)
    const link = document.querySelector('a[href^="/app/"]')!
    const linkClick = vi.fn()
    link.addEventListener('click', linkClick)

    const selected = new Set<string>()
    const rows = reconcileChatCheckboxes(selected, (key, checked) => {
      checked ? selected.add(key) : selected.delete(key)
    })
    const checkbox = rows[0].checkbox!

    checkbox.click()

    expect(linkClick).not.toHaveBeenCalled()
    expect(selected.has('/app/00000001')).toBe(true)
  })

  it('collects unique chat rows and can select the latest 50', () => {
    renderSidenav(55)

    const rows = getChatRows()
    const selected = new Set(rows.slice(0, 50).map(row => row.key))
    reconcileChatCheckboxes(selected, vi.fn())

    expect(rows).toHaveLength(55)
    expect(document.querySelectorAll('.gpk-bulk-delete-checkbox:checked')).toHaveLength(50)
  })

  it('detects pinned rows from the native push_pin trailing icon', () => {
    renderSidenav(2)
    const rows = getChatRows()
    rows[0].link.querySelector('.trailing-content')?.insertAdjacentHTML('beforeend', `
      <mat-icon data-mat-icon-name="push_pin" fonticon="push_pin"></mat-icon>
    `)

    expect(isPinnedChatRow(rows[0].row)).toBe(true)
    expect(isPinnedChatRow(rows[1].row)).toBe(false)
  })

  it('deselects pinned chats from the current selection', async () => {
    renderSidenav(2)
    const header = findChatHeader()!
    const rows = getChatRows()
    rows[0].link.querySelector('.trailing-content')?.insertAdjacentHTML('beforeend', `
      <mat-icon data-mat-icon-name="push_pin" fonticon="push_pin"></mat-icon>
    `)

    __bulkDeleteTestApi.enterBulkDeleteMode()
    const menu = header.nextElementSibling as HTMLElement
    const checkboxes = document.querySelectorAll<HTMLInputElement>('.gpk-bulk-delete-checkbox')
    const deselectPinned = menu.querySelector<HTMLButtonElement>('button[data-action="deselect-pinned"]')!

    __bulkDeleteTestApi.setRecentLimit(2)
    await __bulkDeleteTestApi.selectRecent()

    expect(checkboxes[0].checked).toBe(true)
    expect(checkboxes[1].checked).toBe(true)
    expect(deselectPinned.hidden).toBe(false)

    deselectPinned.click()

    expect(checkboxes[0].checked).toBe(false)
    expect(checkboxes[1].checked).toBe(true)
    expect(deselectPinned.hidden).toBe(false)
    expect(deselectPinned.disabled).toBe(true)
  })
})
