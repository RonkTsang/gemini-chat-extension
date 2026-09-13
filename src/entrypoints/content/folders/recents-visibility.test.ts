import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  snapshot: {
    identity: { status: 'unavailable', reason: 'surface-not-ready' as const },
  } as any,
  listener: undefined as (() => void) | undefined,
}))

vi.mock('./runtime', () => ({
  folderRuntime: {
    getSnapshot: () => state.snapshot,
    subscribe: (listener: () => void) => { state.listener = listener; return () => { state.listener = undefined } },
  },
}))

import { FolderRecentsVisibilityController } from './recents-visibility'

function appendConversation(chatId: string, pinned = false): HTMLElement {
  const row = document.createElement('gem-nav-list-item')
  row.setAttribute('data-test-id', 'conversation')
  if (pinned) row.setAttribute('data-pinned', 'true')
  const link = document.createElement('a')
  link.href = `/app/${chatId}`
  link.textContent = chatId
  row.append(link)
  document.querySelector('expandable-section')!.append(row)
  return row
}

afterEach(() => {
  document.body.replaceChildren()
  history.replaceState({}, '', '/')
  state.listener = undefined
})

describe('FolderRecentsVisibilityController', () => {
  it('only hides organized, non-current, non-pinned rows and restores them on stop', () => {
    history.replaceState({}, '', '/app/current')
    document.body.innerHTML = '<bard-sidenav role="navigation"><expandable-section data-test-id="chats-expandable-section"></expandable-section></bard-sidenav>'
    const organized = appendConversation('organized')
    const current = appendConversation('current')
    const pinned = appendConversation('pinned', true)
    state.snapshot = {
      identity: { status: 'available', identity: { source: 'observed', accountScopeId: 'account-scope-0001' } },
      projection: { settings: { enabled: true, hideOrganizedChats: true }, memberships: [{ chatId: 'organized' }, { chatId: 'current' }, { chatId: 'pinned' }] },
    }
    const controller = new FolderRecentsVisibilityController()
    controller.start()
    expect(organized.getAttribute('data-gpk-folders-recents-hidden')).toBe('true')
    expect(current.hasAttribute('data-gpk-folders-recents-hidden')).toBe(false)
    expect(pinned.hasAttribute('data-gpk-folders-recents-hidden')).toBe(false)
    controller.stop()
    expect(organized.hasAttribute('data-gpk-folders-recents-hidden')).toBe(false)
    expect(organized.style.display).toBe('')
  })

  it('fails closed and restores native rows when identity becomes manual or unavailable', async () => {
    document.body.innerHTML = '<bard-sidenav role="navigation"><expandable-section data-test-id="chats-expandable-section"></expandable-section></bard-sidenav>'
    const row = appendConversation('organized')
    state.snapshot = {
      identity: { status: 'available', identity: { source: 'observed', accountScopeId: 'account-scope-0001' } },
      projection: { settings: { enabled: true, hideOrganizedChats: true }, memberships: [{ chatId: 'organized' }] },
    }
    const controller = new FolderRecentsVisibilityController()
    controller.start()
    expect(row.style.display).toBe('none')
    state.snapshot = { identity: { status: 'available', identity: { source: 'manual-confirmed', accountScopeId: 'account-scope-0001' } } }
    state.listener?.()
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    expect(row.style.display).toBe('')
    controller.stop()
  })
})
