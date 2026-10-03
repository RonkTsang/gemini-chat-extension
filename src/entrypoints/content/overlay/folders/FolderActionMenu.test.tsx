import { ChakraProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  openRenameChatDialog: vi.fn(),
  snapshot: {
    menu: {
      kind: 'chat', folderId: 'folder-1', chatId: 'e314bf90da4c7254', chatTitle: 'Current title',
      anchorRect: { top: 20, right: 100, bottom: 40, left: 20 },
    },
  },
}))
vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: {
  getSnapshot: () => state.snapshot, subscribe: () => () => undefined,
  openRenameChatDialog: state.openRenameChatDialog, closeMenu: vi.fn(),
} }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))

import { system } from '@/components/ui/system'
import { FolderActionMenu } from './FolderActionMenu'

let root: Root
let host: HTMLDivElement
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe('Folder chat more menu', () => {
  it('places Rename and its pen icon before a separator and opens the title editor', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<ChakraProvider value={system}><FolderActionMenu /></ChakraProvider>))
    const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual(['Rename', 'Remove from folder', 'Delete chat'])
    expect(items[0].querySelector('svg')).not.toBeNull()
    expect(items[0].nextElementSibling?.getAttribute('role')).toBe('separator')
    expect(items[0].nextElementSibling?.nextElementSibling).toBe(items[1])
    await act(async () => items[0].click())
    expect(state.openRenameChatDialog).toHaveBeenCalledExactlyOnceWith('folder-1', 'e314bf90da4c7254', 'Current title')
  })
})
