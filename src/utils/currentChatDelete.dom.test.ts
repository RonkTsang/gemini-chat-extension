import { afterEach, describe, expect, it } from 'vitest'
import {
  findCurrentChatActionButton,
  findCurrentChatActionTrigger,
  findCurrentChatDeleteConfirmButton,
  findCurrentChatDeleteMenuItem,
  isCurrentChatPath,
} from './currentChatDelete.dom'

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetParent', { configurable: true, value: document.body })
  element.getBoundingClientRect = () => new DOMRect(0, 0, 24, 24)
}

describe('current chat deletion DOM contract', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uses technical Gemini attributes instead of visible copy', () => {
    document.body.innerHTML = `
      <gem-icon-button cdkoverlayorigin gemmenutrigger fonticonname="more_vert" theme="lm" aria-controls="chat-actions">
        <button type="button"></button>
      </gem-icon-button>
      <gem-menu id="chat-actions" role="menu" data-visible="true">
        <gem-menu-item role="menuitem" value="delete" leadingicon="delete" data-test-id="delete-button"></gem-menu-item>
      </gem-menu>
      <mat-dialog-container role="dialog">
        <message-dialog>
          <h1 mat-dialog-title>Localized title</h1>
          <mat-dialog-actions>
            <gem-button cdkfocusinitial><button type="button">Localized action</button></gem-button>
          </mat-dialog-actions>
        </message-dialog>
      </mat-dialog-container>
    `

    document.querySelectorAll<HTMLElement>('gem-icon-button, button, gem-menu, gem-menu-item, mat-dialog-container')
      .forEach(makeVisible)

    const trigger = findCurrentChatActionTrigger()
    expect(trigger).not.toBeNull()
    expect(findCurrentChatActionButton(trigger!)).not.toBeNull()
    expect(findCurrentChatDeleteMenuItem(document.querySelector('gem-menu')!)).not.toBeNull()
    expect(findCurrentChatDeleteConfirmButton(document.querySelector('[role="dialog"]')!)).not.toBeNull()
  })

  it('only accepts concrete conversation routes', () => {
    expect(isCurrentChatPath('/app/21ba594787bdf800')).toBe(true)
    expect(isCurrentChatPath('/gem/8064a1da0457/1675c897fedd575c')).toBe(true)
    expect(isCurrentChatPath('/app')).toBe(false)
    expect(isCurrentChatPath('/gem/8064a1da0457')).toBe(false)
    expect(isCurrentChatPath('/gems/view')).toBe(false)
  })
})
