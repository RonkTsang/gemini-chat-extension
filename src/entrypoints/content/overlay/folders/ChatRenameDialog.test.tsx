import { ChakraProvider, EnvironmentProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ renameChat: vi.fn(), closeDialog: vi.fn() }))
vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: runtime }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))

import { system } from '@/components/ui/system'
import { ChatRenameDialog } from './ChatRenameDialog'

let host: HTMLDivElement
let shadow: ShadowRoot
let root: Root
const dialog = { kind: 'rename-chat' as const, folderId: 'folder-1', chatId: 'e314bf90da4c7254', chatTitle: 'Original title' }

function saveButton(): HTMLButtonElement {
  return [...shadow.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Save')!
}

async function enterTitle(value: string): Promise<void> {
  const input = shadow.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })
}

describe('Chat rename overlay', () => {
  beforeEach(async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    runtime.renameChat.mockResolvedValue(undefined)
    host = document.createElement('div')
    shadow = host.attachShadow({ mode: 'open' })
    document.body.append(host)
    root = createRoot(shadow)
    await act(async () => root.render(
      <EnvironmentProvider value={() => shadow}>
        <ChakraProvider value={system}>
          <ChatRenameDialog dialog={dialog} />
        </ChakraProvider>
      </EnvironmentProvider>,
    ))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders the prefilled input and top-right close control inside the Shadow DOM', async () => {
    expect(shadow.querySelector('[role="dialog"]')).not.toBeNull()
    expect(shadow.textContent).toContain('Rename')
    expect(shadow.querySelector('input')?.value).toBe('Original title')
    expect(shadow.querySelector('input')?.getAttribute('aria-label')).toBe('Chat title')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const close = shadow.querySelector<HTMLButtonElement>('[data-part="close-trigger"]')!
    expect(close).not.toBeNull()
    await act(async () => close.click())
    expect(runtime.closeDialog).toHaveBeenCalledTimes(1)
  })

  it('submits the edited title and prevents empty saves', async () => {
    await enterTitle('   ')
    expect(saveButton().disabled).toBe(true)
    await enterTitle('Updated title')
    await act(async () => saveButton().click())
    expect(runtime.renameChat).toHaveBeenCalledExactlyOnceWith(dialog.folderId, dialog.chatId, 'Updated title')
  })

  it('keeps input and errors available for retry after Gemini failure', async () => {
    runtime.renameChat.mockRejectedValueOnce(new Error('Title saved in Folders, but Gemini could not be renamed. Try again.'))
    await enterTitle('Updated title')
    await act(async () => saveButton().click())
    expect(shadow.textContent).toContain('Gemini could not be renamed')
    expect(shadow.querySelector('input')?.value).toBe('Updated title')
    expect(saveButton().disabled).toBe(false)
    expect(runtime.closeDialog).not.toHaveBeenCalled()
  })

  it('blocks duplicate saves and edits while the request is pending', async () => {
    let finish!: () => void
    runtime.renameChat.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => {
      saveButton().click()
      saveButton().click()
    })
    expect(runtime.renameChat).toHaveBeenCalledTimes(1)
    expect(shadow.querySelector('input')?.readOnly).toBe(true)
    expect(saveButton().disabled).toBe(true)
    await act(async () => finish())
  })
})
