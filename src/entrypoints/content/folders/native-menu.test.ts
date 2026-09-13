import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  snapshot: { identity: { status: 'available', identity: { accountScopeId: 'account-scope-0001' } }, projection: { settings: { enabled: true } } } as any,
  listener: undefined as (() => void) | undefined,
  openPicker: vi.fn(),
  closePicker: vi.fn(),
}))

vi.mock('./runtime', () => ({
  folderRuntime: {
    getSnapshot: () => state.snapshot,
    subscribe: (listener: () => void) => { state.listener = listener; return () => { state.listener = undefined } },
    openPicker: state.openPicker,
    closePicker: state.closePicker,
  },
}))

import { FolderNativeMenuBridge } from './native-menu'

function renderMenu(activeRows = 1): HTMLElement {
  const sideNav = document.createElement('bard-sidenav')
  sideNav.setAttribute('role', 'navigation')
  for (let index = 0; index < activeRows; index += 1) {
    const row = document.createElement('gem-nav-list-item')
    row.setAttribute('data-test-id', 'conversation')
    row.className = 'always-show-hovered-trailing-content'
    const link = document.createElement('a')
    link.href = `/app/chat-${index}`
    const title = document.createElement('span')
    title.className = 'title-text'
    title.textContent = `Chat title ${index}`
    link.append(title)
    const trigger = document.createElement('button')
    trigger.setAttribute('aria-haspopup', 'menu')
    trigger.setAttribute('aria-controls', 'conversation-actions')
    row.append(link, trigger)
    sideNav.append(row)
  }
  document.body.append(sideNav)
  const menu = document.createElement('div')
  menu.id = 'conversation-actions'
  menu.setAttribute('role', 'menu')
  menu.className = 'conversation-actions-menu'
  const item = document.createElement('button')
  item.setAttribute('role', 'menuitem')
  item.className = 'mat-mdc-menu-item'
  const itemText = document.createElement('span')
  itemText.className = 'mat-mdc-menu-item-text'
  const icon = document.createElement('gem-icon')
  icon.setAttribute('fonticonname', 'share_2')
  const iconGlyph = document.createElement('mat-icon')
  iconGlyph.setAttribute('data-mat-icon-name', 'share_2')
  iconGlyph.setAttribute('fonticon', 'share_2')
  icon.append(iconGlyph)
  const label = document.createElement('span')
  label.className = 'gem-menu-item-label'
  label.textContent = 'Native action'
  itemText.append(icon, label)
  item.append(itemText)
  menu.append(item)
  document.body.append(menu)
  return menu
}

afterEach(() => {
  document.body.replaceChildren()
  state.snapshot = { identity: { status: 'available', identity: { accountScopeId: 'account-scope-0001' } }, projection: { settings: { enabled: true } } }
  state.openPicker.mockReset()
  state.closePicker.mockReset()
  state.listener = undefined
})

describe('FolderNativeMenuBridge', () => {
  it('injects once only for a uniquely verified active row and aria-controls menu pair', () => {
    const menu = renderMenu()
    const bridge = new FolderNativeMenuBridge()
    bridge.start()
    expect(menu.querySelectorAll('[data-gpk-folder-menu-entry]')).toHaveLength(1)
    expect(menu.querySelectorAll('[data-gpk-folder-menu-separator]')).toHaveLength(1)
    ;(menu.querySelector('[data-gpk-folder-menu-entry]') as HTMLElement).click()
    expect(state.openPicker).toHaveBeenCalledWith(
      'chat-0',
      expect.anything(),
      expect.stringMatching(/^membership-add-/u),
      'Chat title 0',
    )
    bridge.stop()
    expect(menu.querySelector('[data-gpk-folder-menu-entry]')).toBeNull()
  })

  it('clones the native menu item structure so the injected action keeps Gemini alignment', () => {
    const menu = renderMenu()
    const bridge = new FolderNativeMenuBridge()
    bridge.start()

    const entry = menu.querySelector<HTMLElement>('[data-gpk-folder-menu-entry]')!
    expect(entry.tagName).toBe('BUTTON')
    expect(entry.className).toBe('mat-mdc-menu-item')
    expect(entry.querySelector('.gem-menu-item-label')?.textContent).toBe('Add to Folder')
    expect(entry.querySelector('gem-icon')?.getAttribute('fonticonname')).toBe('folder')
    expect(entry.querySelector('mat-icon')?.getAttribute('data-mat-icon-name')).toBe('folder')
    bridge.stop()
  })

  it('does not inject when more than one active row could claim the native menu', () => {
    const menu = renderMenu(2)
    const bridge = new FolderNativeMenuBridge()
    bridge.start()
    expect(menu.querySelector('[data-gpk-folder-menu-entry]')).toBeNull()
    bridge.stop()
  })
})
