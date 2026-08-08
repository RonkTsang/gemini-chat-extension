import { afterEach, describe, expect, it } from 'vitest'
import { getVisibleDialogs, waitForControlledMenu, waitForNewVisibleDialog } from './geminiDom'

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', { configurable: true, value: document.body })
  element.getBoundingClientRect = () => new DOMRect(0, 0, 24, 24)
}

describe('Gemini DOM waits', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('waits for the menu controlled by the trigger instead of another visible menu', async () => {
    document.body.innerHTML = `
      <gem-icon-button aria-controls="conversation-actions"><button></button></gem-icon-button>
      <gem-menu id="unrelated" role="menu" data-visible="true"></gem-menu>
      <gem-menu id="conversation-actions" role="menu" data-visible="true"></gem-menu>
    `
    document.querySelectorAll<HTMLElement>('gem-icon-button, gem-menu').forEach(makeVisible)

    const menu = await waitForControlledMenu(document.querySelector<HTMLElement>('gem-icon-button')!, {
      timeoutMs: 1,
    })

    expect(menu?.id).toBe('conversation-actions')
  })

  it('returns only a dialog that appeared after the operation started', async () => {
    document.body.innerHTML = '<div role="dialog" id="existing"></div>'
    const existing = document.querySelector<HTMLElement>('[role="dialog"]')!
    makeVisible(existing)
    const knownDialogs = new Set(getVisibleDialogs())

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.id = 'new'
    document.body.append(dialog)
    makeVisible(dialog)

    await expect(waitForNewVisibleDialog(knownDialogs, { timeoutMs: 1 })).resolves.toBe(dialog)
  })
})
