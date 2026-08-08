import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCurrentChatDeleteConfirmation } from './currentChatDelete'

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', { configurable: true, value: document.body })
  element.getBoundingClientRect = () => new DOMRect(0, 0, 24, 24)
}

function makeDeleteFlow(): { confirmButton: HTMLButtonElement; confirmClick: ReturnType<typeof vi.fn> } {
  document.body.innerHTML = `
    <gem-icon-button cdkoverlayorigin gemmenutrigger fonticonname="more_vert" theme="lm" aria-controls="conversation-actions">
      <button type="button"></button>
    </gem-icon-button>
  `

  const trigger = document.querySelector<HTMLElement>('gem-icon-button')!
  const triggerButton = trigger.querySelector<HTMLButtonElement>('button')!
  makeVisible(trigger)
  makeVisible(triggerButton)

  const confirmClick = vi.fn()
  triggerButton.addEventListener('click', () => {
    const menu = document.createElement('gem-menu')
    menu.id = 'conversation-actions'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('data-visible', 'true')
    const deleteMenuItem = document.createElement('gem-menu-item')
    deleteMenuItem.setAttribute('role', 'menuitem')
    deleteMenuItem.setAttribute('value', 'delete')
    deleteMenuItem.setAttribute('leadingicon', 'delete')
    deleteMenuItem.setAttribute('data-test-id', 'delete-button')
    menu.append(deleteMenuItem)
    document.body.append(menu)
    makeVisible(menu)
    makeVisible(deleteMenuItem)

    deleteMenuItem.addEventListener('click', () => {
      const dialog = document.createElement('mat-dialog-container')
      dialog.setAttribute('role', 'dialog')
      dialog.innerHTML = `
        <message-dialog>
          <mat-dialog-actions>
            <gem-button cdkfocusinitial><button type="button"></button></gem-button>
          </mat-dialog-actions>
        </message-dialog>
      `
      document.body.append(dialog)
      const confirmButton = dialog.querySelector<HTMLButtonElement>('button')!
      makeVisible(dialog)
      makeVisible(confirmButton)
      confirmButton.addEventListener('click', confirmClick)
    })
  })

  return {
    get confirmButton() {
      return document.querySelector<HTMLElement>('[role="dialog"] button') as HTMLButtonElement
    },
    confirmClick,
  }
}

describe('openCurrentChatDeleteConfirmation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/app/test-conversation')
  })

  it('opens Gemini confirmation and focuses Delete without confirming it', async () => {
    window.history.replaceState({}, '', '/app/test-conversation')
    const flow = makeDeleteFlow()

    await expect(openCurrentChatDeleteConfirmation()).resolves.toBe(true)

    expect(document.activeElement).toBe(flow.confirmButton)
    expect(flow.confirmClick).not.toHaveBeenCalled()
  })

  it('opens Gemini confirmation from a concrete Gem conversation route', async () => {
    window.history.replaceState({}, '', '/gem/8064a1da0457/1675c897fedd575c')
    const flow = makeDeleteFlow()

    await expect(openCurrentChatDeleteConfirmation()).resolves.toBe(true)

    expect(document.activeElement).toBe(flow.confirmButton)
    expect(flow.confirmClick).not.toHaveBeenCalled()
  })

  it('does nothing outside a concrete conversation route', async () => {
    window.history.replaceState({}, '', '/app')
    const flow = makeDeleteFlow()

    await expect(openCurrentChatDeleteConfirmation()).resolves.toBe(false)
    expect(flow.confirmClick).not.toHaveBeenCalled()
  })

  it('does nothing when a dialog is already visible', async () => {
    window.history.replaceState({}, '', '/app/test-conversation')
    const flow = makeDeleteFlow()
    const existingDialog = document.createElement('div')
    existingDialog.setAttribute('role', 'dialog')
    document.body.append(existingDialog)
    makeVisible(existingDialog)

    await expect(openCurrentChatDeleteConfirmation()).resolves.toBe(false)
    expect(flow.confirmClick).not.toHaveBeenCalled()
  })
})
