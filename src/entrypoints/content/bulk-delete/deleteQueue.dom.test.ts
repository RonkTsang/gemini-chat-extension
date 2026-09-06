import { afterEach, describe, expect, it } from 'vitest'
import {
  ACTION_MENU_TRIGGER_SELECTOR,
  CONVERSATION_LINK_SELECTOR,
  CONVERSATION_ROW_SELECTOR,
  findActionMenuButton,
  findConversationRowByKey,
} from './deleteQueue.dom'

function conversationRow(
  key: string,
  actions = '',
  conversationHrefs = [key],
): string {
  return `
    <gem-nav-list-item
      data-test-id="conversation"
      data-gpk-conversation-key="${key}"
    >
      ${conversationHrefs.map(href => `<a href="${href}">Conversation</a>`).join('')}
      ${actions}
    </gem-nav-list-item>
  `
}

function actionTrigger(buttonAttributes = ''): string {
  return `
    <div class="hovered-trailing-content">
      <gem-icon-button
        data-test-id="actions-menu-button"
        aria-haspopup="menu"
      >
        <button type="button" ${buttonAttributes}>Actions</button>
      </gem-icon-button>
    </div>
  `
}

describe('bulk delete queue DOM resolvers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uses direct, complete selectors for the current DOM contract', () => {
    expect(CONVERSATION_ROW_SELECTOR).toBe(
      'gem-nav-list-item[data-test-id="conversation"][data-gpk-conversation-key]',
    )
    expect(ACTION_MENU_TRIGGER_SELECTOR).toBe(
      'gem-icon-button[data-test-id="actions-menu-button"][aria-haspopup="menu"]',
    )
    expect(CONVERSATION_LINK_SELECTOR).toBe(':scope > a[href^="/app/"]')
  })

  it('resolves a normal relative conversation href', () => {
    document.body.innerHTML = conversationRow('/app/target', actionTrigger())

    expect(findConversationRowByKey('/app/target')).toBe(
      document.querySelector('gem-nav-list-item'),
    )
  })

  it('rejects a stale dataset key when its native link now targets another conversation', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      actionTrigger(),
      ['/app/reused-row'],
    )

    expect(findConversationRowByKey('/app/target')).toBeNull()
  })

  it('rejects a row with multiple native conversation links', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      actionTrigger(),
      ['/app/target', '/app/other'],
    )

    expect(findConversationRowByKey('/app/target')).toBeNull()
  })

  it('resolves a hidden target row action without choosing a visible adjacent row action', () => {
    document.body.innerHTML = `
      ${conversationRow('/app/target', actionTrigger('style="display: none"'))}
      ${conversationRow('/app/adjacent', actionTrigger())}
    `

    const targetRow = findConversationRowByKey('/app/target')!
    const actionButton = findActionMenuButton(targetRow)

    expect(actionButton).toBe(targetRow.querySelector('button'))
    expect(actionButton).not.toBe(
      findConversationRowByKey('/app/adjacent')?.querySelector('button'),
    )
  })

  it('does not depend on the action wrapper class name', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      actionTrigger().replace('hovered-trailing-content', 'renamed-action-wrapper'),
    )

    const targetRow = findConversationRowByKey('/app/target')!

    expect(findActionMenuButton(targetRow)).toBe(targetRow.querySelector('button'))
  })

  it('finds the row-scoped trigger after Gemini adds another wrapper', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      `<div class="new-wrapper">${actionTrigger()}</div>`,
    )

    const targetRow = findConversationRowByKey('/app/target')!

    expect(findActionMenuButton(targetRow)).toBe(targetRow.querySelector('button'))
  })

  it('does not scan parent or sibling elements for an action trigger', () => {
    document.body.innerHTML = `
      <div class="parent-with-action">
        ${actionTrigger()}
        ${conversationRow('/app/target')}
      </div>
      ${conversationRow('/app/sibling', actionTrigger())}
    `

    const targetRow = findConversationRowByKey('/app/target')!

    expect(findActionMenuButton(targetRow)).toBeNull()
  })

  it('rejects a row with duplicate action triggers', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      `${actionTrigger()}${actionTrigger()}`,
    )

    expect(findActionMenuButton(findConversationRowByKey('/app/target')!)).toBeNull()
  })

  it('resolves the current replacement row by conversation key after a redraw', () => {
    document.body.innerHTML = conversationRow('/app/target', actionTrigger())
    const originalRow = findConversationRowByKey('/app/target')!
    const replacement = document.createElement('gem-nav-list-item')
    replacement.dataset.testId = 'conversation'
    replacement.dataset.gpkConversationKey = '/app/target'
    replacement.innerHTML = `<a href="/app/target">Conversation</a>${actionTrigger()}`
    originalRow.replaceWith(replacement)

    const currentRow = findConversationRowByKey('/app/target')

    expect(currentRow).toBe(replacement)
    expect(currentRow).not.toBe(originalRow)
    expect(findActionMenuButton(currentRow!)).toBe(
      replacement.querySelector('button'),
    )
  })

  it('rejects duplicate conversation keys', () => {
    document.body.innerHTML = `
      ${conversationRow('/app/duplicate', actionTrigger())}
      ${conversationRow('/app/duplicate', actionTrigger())}
    `

    expect(findConversationRowByKey('/app/duplicate')).toBeNull()
  })

  it('rejects a disabled action button', () => {
    document.body.innerHTML = conversationRow(
      '/app/target',
      actionTrigger('disabled'),
    )

    expect(findActionMenuButton(findConversationRowByKey('/app/target')!)).toBeNull()
  })
})
