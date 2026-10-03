import { ChakraProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FolderRuntimeState } from '@/entrypoints/content/folders/runtime'

const state = vi.hoisted(() => {
  const stamp = '0000000000001:000000:device'
  const timestamp = '2026-01-01T00:00:00.000Z'
  const snapshot: FolderRuntimeState = {
    identity: { status: 'available', identity: { email: 'user@example.com', accountScopeId: 'account-scope-0001', source: 'observed', resolvedAt: timestamp } },
    projection: {
      folders: [{ id: 'folder-1', accountScopeId: 'account-scope-0001', parentFolderId: '__root__', name: 'Folder', iconKey: 'folder', colorValue: 'neutral', orderKey: '1'.padStart(32, '0'), createdAt: timestamp, updatedAt: timestamp, versionStamp: stamp, fieldVersions: { name: stamp, iconKey: stamp, colorValue: stamp, position: stamp } }],
      memberships: ['regular', 'old-pin', 'new-pin'].map((chatId, index) => ({
        id: `membership-${index}`, accountScopeId: 'account-scope-0001', folderId: 'folder-1', chatId,
        orderKey: String(index + 1).padStart(32, '0'), createdAt: timestamp, updatedAt: timestamp,
        versionStamp: stamp, positionVersionStamp: stamp,
        pinnedOrderKey: index ? String(3 - index).padStart(32, '0') : undefined,
      })),
      chatReferences: ['regular', 'old-pin', 'new-pin'].map((chatId) => ({ accountScopeId: 'account-scope-0001', chatId, cachedTitle: chatId, createdAt: timestamp, updatedAt: timestamp, titleVersionStamp: stamp })),
      settings: { accountScopeId: 'account-scope-0001', enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: timestamp, settingsVersion: stamp, settingsPending: false },
    },
  }
  return { snapshot, openChatMenu: vi.fn(), closeMenu: vi.fn(), navigate: vi.fn(), moveMembership: vi.fn() }
})

vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: {
  getSnapshot: () => state.snapshot, subscribe: () => () => undefined,
  openChatMenu: state.openChatMenu, closeMenu: state.closeMenu, moveMembership: state.moveMembership,
} }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))
vi.mock('@/utils/chatActions', () => ({ openChatViaSpa: state.navigate }))
vi.mock('@/components/ui/tooltip', () => ({ Tooltip: ({ children }: React.PropsWithChildren) => children }))

import { system } from '@/components/ui/system'
import { FolderSideNav } from './FolderSideNav'

describe('Folder chat pin presentation', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    vi.clearAllMocks()
    state.snapshot = { ...state.snapshot, menu: undefined }
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = async () => { await act(async () => root.render(<ChakraProvider value={system}><FolderSideNav /></ChakraProvider>)) }

  it('renders pins in display order and shares the original menu button with the pin icon', async () => {
    await render()
    const rows = [...host.querySelectorAll<HTMLElement>('[data-gpk-folder-chat-row]')]
    expect(rows.map((row) => row.textContent)).toEqual(['new-pin', 'old-pin', 'regular'])
    expect(rows.map((row) => row.dataset.gpkFolderPinned)).toEqual(['true', 'true', 'false'])
    for (const row of rows) {
      const buttons = row.querySelectorAll('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0].querySelector('[data-gpk-folder-menu-icon] svg')).not.toBeNull()
      expect(Boolean(buttons[0].querySelector('[data-gpk-folder-pin-icon] svg'))).toBe(row.dataset.gpkFolderPinned === 'true')
    }
    const button = rows[0].querySelector('button')!
    expect(getComputedStyle(button.querySelector('[data-gpk-folder-pin-icon]')!).visibility).toBe('visible')
    expect(getComputedStyle(button.querySelector('[data-gpk-folder-menu-icon]')!).visibility).toBe('hidden')
    await act(async () => button.click())
    expect(state.openChatMenu).toHaveBeenCalledExactlyOnceWith('folder-1', 'new-pin', 'new-pin', button)
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('keeps the menu active on a pinned row until it closes', async () => {
    const anchorElement = document.createElement('button')
    state.snapshot = { ...state.snapshot, menu: { kind: 'chat', folderId: 'folder-1', chatId: 'new-pin', chatTitle: 'new-pin', anchorElement, anchorRect: anchorElement.getBoundingClientRect() } }
    await render()
    const row = host.querySelector<HTMLElement>('[data-gpk-folder-chat-row]')!
    const button = row.querySelector('button')!
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(getComputedStyle(button.querySelector('[data-gpk-folder-pin-icon]')!).visibility).toBe('hidden')
    expect(getComputedStyle(button.querySelector('[data-gpk-folder-menu-icon]')!).visibility).toBe('visible')
    await act(async () => button.click())
    expect(state.closeMenu).toHaveBeenCalledOnce()
    expect(state.openChatMenu).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('accepts drag reordering within the pin group and rejects dropping on ordinary chats', async () => {
    await render()
    const [newPin, oldPin, regular] = [...host.querySelectorAll<HTMLElement>('[data-gpk-folder-chat-row]')]
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    const drag = (target: HTMLElement, type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: -1 })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      act(() => target.dispatchEvent(event))
      return event
    }
    drag(oldPin, 'dragstart')
    expect(drag(regular, 'dragover').defaultPrevented).toBe(false)
    drag(regular, 'drop')
    expect(state.moveMembership).not.toHaveBeenCalled()
    expect(drag(newPin, 'dragover').defaultPrevented).toBe(true)
    drag(newPin, 'drop')
    expect(state.moveMembership).toHaveBeenCalledExactlyOnceWith('folder-1', 'old-pin', 'membership-2', undefined)
  })
})
