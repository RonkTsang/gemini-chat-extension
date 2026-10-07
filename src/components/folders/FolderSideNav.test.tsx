import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  snapshot: {
    identity: { status: 'available', identity: { accountScopeId: 'account-1', email: 'user@example.com', selection: undefined as 'recent' | undefined } },
    loadingChatFolderIds: [] as string[],
    projection: {
      settings: { enabled: true, collapsedFolderIds: [] },
      folders: Array.from({ length: 6 }, (_, index) => ({
        id: `folder-${index}`, parentFolderId: '__root__', name: `Folder ${index}`,
        orderKey: String(index), iconKey: 'folder', colorValue: 'blue',
      })),
      memberships: [], chatReferences: [],
      chatCursors: {} as Record<string, string | undefined>,
    },
  },
  loadMoreChats: vi.fn(),
  setFolderCollapsed: vi.fn(),
  openEditDialog: vi.fn(),
}))
vi.mock('@/entrypoints/content/folders/runtime', () => ({
  folderRuntime: { subscribe: () => () => undefined, getSnapshot: () => runtime.snapshot, loadMoreChats: runtime.loadMoreChats, setFolderCollapsed: runtime.setFolderCollapsed, openEditDialog: runtime.openEditDialog },
}))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))
vi.mock('@/utils/chatActions', () => ({ openChatViaSpa: vi.fn() }))
vi.mock('@/components/ui/tooltip', () => ({ Tooltip: ({ children }: React.PropsWithChildren) => children }))
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children, 'data-gpk-folder-block': block, 'data-gpk-folder-icon': icon }: React.PropsWithChildren<{
    'data-gpk-folder-block'?: boolean
    'data-gpk-folder-icon'?: boolean
  }>) => <div data-gpk-folder-block={block} data-gpk-folder-icon={icon}>{children}</div>
  const Button = ({ children, onClick, onDoubleClick, 'aria-expanded': expanded, 'aria-label': label, disabled, color, 'data-gpk-folder-load-more-chats': loadMore, 'data-gpk-folder-account': account }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    onDoubleClick?: React.MouseEventHandler<HTMLButtonElement>
    'aria-expanded'?: boolean
    'aria-label'?: string
    disabled?: boolean
    color?: string
    'data-gpk-folder-load-more-chats'?: boolean
    'data-gpk-folder-account'?: boolean
  }>) => <button onClick={onClick} onDoubleClick={onDoubleClick} aria-expanded={expanded} aria-label={label} disabled={disabled} data-color={color} data-gpk-folder-load-more-chats={loadMore} data-gpk-folder-account={account}>{children}</button>
  return { Box, Button, HStack: Box, VStack: Box, Text: Box, IconButton: Button }
})

import { FolderSideNav } from './FolderSideNav'
import { eventBus } from '@/utils/eventbus'

describe('FolderSideNav folder preview', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    runtime.snapshot.identity.identity.selection = undefined
    runtime.snapshot.identity.status = 'available'
    runtime.snapshot.projection.chatCursors = {}
    runtime.snapshot.loadingChatFolderIds = []
    runtime.loadMoreChats.mockClear()
    runtime.setFolderCollapsed.mockReset().mockImplementation(() => new Promise(() => {}))
    runtime.openEditDialog.mockClear()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('keeps the header and settings accessible and opens manual email entry when identity is unavailable', () => {
    runtime.snapshot.identity.status = 'unavailable'
    const openSettings = vi.fn()
    const unsubscribe = eventBus.on('settings:open', openSettings)
    try {
      act(() => root.render(<FolderSideNav />))
      expect(container.textContent).toContain('Folders')
      expect(container.textContent).toContain('Folders are unavailable until your Gemini identity is confirmed.')
      expect(container.querySelectorAll('[data-gpk-folder-block]')).toHaveLength(0)
      expect(container.querySelector<HTMLButtonElement>('[aria-label="New folder"]')?.disabled).toBe(true)
      const settings = container.querySelector<HTMLButtonElement>('[aria-label="Folder settings"]')!
      act(() => settings.click())
      expect(openSettings).toHaveBeenLastCalledWith({ from: 'folders', open: true, module: 'folders' })
      const manualEmail = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Manual email')!
      act(() => manualEmail.click())
      expect(openSettings).toHaveBeenCalledTimes(2)
      expect(openSettings).toHaveBeenLastCalledWith({ from: 'folders', open: true, module: 'folders' })
    } finally {
      unsubscribe()
    }
  })

  it('keeps the folder list visible and opens account selection from the compact account icon', () => {
    runtime.snapshot.identity.identity.selection = 'recent'
    const openSettings = vi.fn()
    const unsubscribe = eventBus.on('settings:open', openSettings)
    try {
      act(() => root.render(<FolderSideNav />))
      expect(container.textContent).not.toContain('Using your last account')
      expect(container.textContent).not.toContain('user@example.com')
      expect(container.querySelectorAll('[data-gpk-folder-block]')).toHaveLength(5)
      const switchAccount = container.querySelector<HTMLButtonElement>('[data-gpk-folder-account]')!
      expect(switchAccount.getAttribute('aria-label')).toBe('Switch account: user@example.com')
      expect(switchAccount.querySelector('svg')?.getAttribute('width')).toBe('14')
      act(() => switchAccount.click())
      expect(openSettings).toHaveBeenCalledExactlyOnceWith({ from: 'folders', open: true, module: 'folders', params: { chooseAccount: true } })
    } finally {
      unsubscribe()
    }
  })

  it('does not show the extra account icon when identification succeeds', () => {
    act(() => root.render(<FolderSideNav />))
    expect(container.querySelector('[data-gpk-folder-account]')).toBeNull()
  })

  it('shows five folders, reveals the remaining folder, and collapses back to five', () => {
    act(() => root.render(<FolderSideNav />))
    const findButton = (label: string) => Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === label)

    expect(container.querySelectorAll('[data-gpk-folder-block]')).toHaveLength(5)
    expect(findButton('See more')).toBeDefined()

    act(() => findButton('See more')!.click())

    expect(container.querySelectorAll('[data-gpk-folder-block]')).toHaveLength(6)
    expect(container.textContent).toContain('Folder 5')
    expect(findButton('Show less')).toBeDefined()

    act(() => findButton('Show less')!.click())

    expect(container.querySelectorAll('[data-gpk-folder-block]')).toHaveLength(5)
    expect(findButton('See more')).toBeDefined()
  })
  it('renders a muted load-more entry only for a folder with another page and disables it while loading', () => {
    runtime.snapshot.projection.chatCursors = { 'folder-0': 'cursor-1' }
    act(() => root.render(<FolderSideNav />))
    const button = container.querySelector<HTMLButtonElement>('[data-gpk-folder-load-more-chats]')!
    expect(container.querySelectorAll('[data-gpk-folder-load-more-chats]')).toHaveLength(1)
    expect(button.dataset.color).toContain('--on-surface-variant')
    act(() => button.click())
    expect(runtime.loadMoreChats).toHaveBeenCalledExactlyOnceWith('folder-0')
    runtime.snapshot.loadingChatFolderIds = ['folder-0']
    act(() => root.render(<FolderSideNav />))
    expect(button.disabled).toBe(true)
    runtime.snapshot.projection.chatCursors = {}
    act(() => root.render(<FolderSideNav />))
    expect(container.querySelector('[data-gpk-folder-load-more-chats]')).toBeNull()
  })

  it('starts collapsing on the first title click before the double-click delay or save completes', () => {
    vi.useFakeTimers()
    act(() => root.render(<FolderSideNav />))
    const button = Array.from(container.querySelectorAll('button')).find((row) => row.textContent === 'Folder 0')!
    expect(button.getAttribute('aria-expanded')).toBe('true')
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(runtime.setFolderCollapsed).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(250))
    expect(runtime.setFolderCollapsed).toHaveBeenCalledExactlyOnceWith('folder-0', true)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('cancels the collapse preview and persistence when the title is double-clicked', () => {
    vi.useFakeTimers()
    act(() => root.render(<FolderSideNav />))
    const button = Array.from(container.querySelectorAll('button')).find((row) => row.textContent === 'Folder 0')!
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
    act(() => button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    act(() => vi.runAllTimers())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(runtime.setFolderCollapsed).not.toHaveBeenCalled()
    expect(runtime.openEditDialog).toHaveBeenCalledExactlyOnceWith('folder-0')
  })

  it('collapses immediately when the icon is clicked, without waiting for double-click detection', () => {
    act(() => root.render(<FolderSideNav />))
    const button = Array.from(container.querySelectorAll('button')).find((row) => row.textContent === 'Folder 0')!
    act(() => button.querySelector('[data-gpk-folder-icon]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(runtime.setFolderCollapsed).toHaveBeenCalledExactlyOnceWith('folder-0', true)
  })

  it('shows a failed expansion save beside Folders and clears the preview', async () => {
    runtime.setFolderCollapsed.mockRejectedValueOnce(new Error('This change was not saved.'))
    act(() => root.render(<FolderSideNav />))
    const button = Array.from(container.querySelectorAll('button')).find((row) => row.textContent === 'Folder 0')!
    await act(async () => button.querySelector('[data-gpk-folder-icon]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
    expect(container.textContent).toContain('This change was not saved.')
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

})
