import { ChakraProvider, EnvironmentProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  listeners: new Set<() => void>(), updateFolder: vi.fn(), closeDialog: vi.fn(),
  snapshot: { dialog: { kind: 'edit', folderId: 'folder-1', expectedRevision: 'opened-revision' },
    projection: { folders: [{ id: 'folder-1', name: 'Original', iconKey: 'folder', colorValue: 'neutral' }] } },
}))
vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: {
  getSnapshot: () => runtime.snapshot,
  subscribe: (listener: () => void) => { runtime.listeners.add(listener); return () => runtime.listeners.delete(listener) },
  updateFolder: runtime.updateFolder, closeDialog: runtime.closeDialog,
} }))
vi.mock('@/assets/tips-and-update.svg?react', () => ({ default: () => null }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))
vi.mock('@/components/folders/FolderAppearancePicker', () => ({ FolderAppearancePicker: () => null }))

import { system } from '@/components/ui/system'
import { FolderDialogs } from './FolderDialogs'

let host: HTMLDivElement
let shadow: ShadowRoot
let root: Root
beforeEach(async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  runtime.snapshot = { dialog: { kind: 'edit', folderId: 'folder-1', expectedRevision: 'opened-revision' },
    projection: { folders: [{ id: 'folder-1', name: 'Original', iconKey: 'folder', colorValue: 'neutral' }] } }
  host = document.createElement('div'); shadow = host.attachShadow({ mode: 'open' }); document.body.append(host)
  root = createRoot(shadow)
  await act(async () => root.render(<EnvironmentProvider value={() => shadow}><ChakraProvider value={system}><FolderDialogs /></ChakraProvider></EnvironmentProvider>))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it.each(['changed', 'deleted'])('keeps the edit draft and original guard after a remote item is %s', async (change) => {
  const input = shadow.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'My draft')
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })
  await act(async () => {
    runtime.snapshot = { ...runtime.snapshot, projection: { folders: change === 'deleted' ? [] : [{ id: 'folder-1', name: 'Synced value', iconKey: 'folder', colorValue: 'neutral' }] } }
    runtime.listeners.forEach((listener) => listener())
  })
  expect(shadow.querySelector('input')!.value).toBe('My draft')
  runtime.updateFolder.mockRejectedValueOnce(new Error('This item changed while you were editing. Your draft was kept.'))
  const save = [...shadow.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Save')!
  await act(async () => save.click())
  expect(runtime.updateFolder).toHaveBeenCalledExactlyOnceWith('folder-1', { name: 'My draft', expectedRevision: 'opened-revision' })
  expect(shadow.querySelector('input')!.value).toBe('My draft')
  expect(shadow.textContent).toContain('Your draft was kept')
  expect(runtime.closeDialog).not.toHaveBeenCalled()
})
