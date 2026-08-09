import {
  getVisibleDialogs,
  waitForControlledMenu,
  waitForNewVisibleDialog,
} from './geminiDom'
import {
  findCurrentChatActionButton,
  findCurrentChatActionTrigger,
  findCurrentChatDeleteConfirmButton,
  findCurrentChatDeleteMenuItem,
  isCurrentChatPath,
} from './currentChatDelete.dom'

let openingDeleteConfirmation = false

export async function openCurrentChatDeleteConfirmation(): Promise<boolean> {
  if (
    openingDeleteConfirmation
    || !isCurrentChatPath(window.location.pathname)
    || getVisibleDialogs().length > 0
  ) {
    return false
  }

  const trigger = findCurrentChatActionTrigger()
  const actionButton = trigger ? findCurrentChatActionButton(trigger) : null
  if (!trigger || !actionButton) {
    return false
  }

  openingDeleteConfirmation = true
  const existingDialogs = new Set(getVisibleDialogs())

  try {
    actionButton.click()

    const menu = await waitForControlledMenu(trigger)
    if (!menu) {
      return false
    }

    const deleteMenuItem = findCurrentChatDeleteMenuItem(menu)
    if (!deleteMenuItem) {
      return false
    }

    deleteMenuItem.click()

    const dialog = await waitForNewVisibleDialog(existingDialogs)
    const confirmButton = dialog ? findCurrentChatDeleteConfirmButton(dialog) : null
    if (!confirmButton) {
      return false
    }

    confirmButton.focus({ preventScroll: true })
    return document.activeElement === confirmButton
  } finally {
    openingDeleteConfirmation = false
  }
}
