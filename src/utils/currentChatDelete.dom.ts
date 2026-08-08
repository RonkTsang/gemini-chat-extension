import { isVisibleElement } from './geminiDom'

export const CURRENT_CHAT_PATH_PATTERN = /^(?:\/app\/[^/]+|\/gem\/[^/]+\/[^/]+)\/?$/

const CURRENT_CHAT_ACTION_TRIGGER_SELECTOR = [
  'top-bar-actions conversation-actions-icon > gem-icon-button',
  '[gemmenutrigger]',
  '[aria-controls]',
].join('')

const CURRENT_CHAT_DELETE_MENU_ITEM_SELECTOR = [
  'gem-menu-item[role="menuitem"][value="delete"]',
  'gem-menu-item[role="menuitem"][leadingicon="delete"]',
  'gem-menu-item[role="menuitem"][data-test-id="delete-button"]',
].join(', ')

const CURRENT_CHAT_CONFIRM_BUTTON_SELECTOR = [
  'message-dialog',
  'mat-dialog-actions',
  'gem-button[cdkfocusinitial]',
  'button:not([disabled])',
].join(' ')

export function isCurrentChatPath(pathname: string): boolean {
  return CURRENT_CHAT_PATH_PATTERN.test(pathname)
}

export function findCurrentChatActionTrigger(root: ParentNode = document): HTMLElement | null {
  return findOnlyVisible(root.querySelectorAll<HTMLElement>(CURRENT_CHAT_ACTION_TRIGGER_SELECTOR))
}

export function findCurrentChatActionButton(trigger: HTMLElement): HTMLButtonElement | null {
  const button = trigger.querySelector<HTMLButtonElement>('button:not([disabled])')
  return isVisibleElement(button) ? button : null
}

export function findCurrentChatDeleteMenuItem(menu: ParentNode): HTMLElement | null {
  return findOnlyVisible(menu.querySelectorAll<HTMLElement>(CURRENT_CHAT_DELETE_MENU_ITEM_SELECTOR))
}

export function findCurrentChatDeleteConfirmButton(dialog: ParentNode): HTMLButtonElement | null {
  const button = dialog.querySelector<HTMLButtonElement>(CURRENT_CHAT_CONFIRM_BUTTON_SELECTOR)
  return isVisibleElement(button) ? button : null
}

function findOnlyVisible(elements: NodeListOf<HTMLElement>): HTMLElement | null {
  const visibleElements = Array.from(elements).filter(isVisibleElement)
  return visibleElements.length === 1 ? visibleElements[0] : null
}
