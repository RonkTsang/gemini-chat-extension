import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeState = vi.hoisted(() => ({
  snapshot: {
    identity: {
      status: 'available',
      identity: { accountScopeId: 'account-scope-0001' },
    },
    picker: {
      chatId: 'chat-1',
      traceId: 'membership-add-picker-test',
      cachedTitle: 'Research chat',
      anchorRect: { top: 20, right: 120, left: 20 },
    },
    projection: {
      folders: [{ id: 'folder-1', name: 'Research', orderKey: 'U' }],
      memberships: [],
    },
  },
  addMembership: vi.fn(),
  closePicker: vi.fn(),
  createFolder: vi.fn(),
  openCreateDialog: vi.fn(),
}))

vi.mock('@/entrypoints/content/folders/runtime', () => ({
  folderRuntime: {
    subscribe: () => () => undefined,
    getSnapshot: () => runtimeState.snapshot,
    addMembership: runtimeState.addMembership,
    closePicker: runtimeState.closePicker,
    createFolder: runtimeState.createFolder,
    openCreateDialog: runtimeState.openCreateDialog,
  },
}))

vi.mock('@/utils/folderTrace', () => ({
  logFolderTrace: vi.fn(),
  logFolderTraceError: vi.fn(),
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

vi.mock('@chakra-ui/react', async () => {
  const React = await import('react')
  return {
    Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<{
      style?: React.CSSProperties
      onPointerDown?: React.PointerEventHandler<HTMLDivElement>
      borderWidth?: string
      borderRadius?: string
    } & Record<`data-${string}`, string | undefined>>>(({ children, ...props }, ref) => (
      <div
        ref={ref}
        style={props.style}
        onPointerDown={props.onPointerDown}
        data-gpk-folder-picker={props['data-gpk-folder-picker']}
        data-border-radius={props.borderRadius}
      >
        {children}
      </div>
    )),
    Button: ({
      children,
      disabled,
      onClick,
      role,
      'aria-checked': ariaChecked,
    }: React.PropsWithChildren<{
      disabled?: boolean
      loading?: boolean
      onClick?: React.MouseEventHandler<HTMLButtonElement>
      role?: string
      'aria-checked'?: boolean
    }>) => (
      <button disabled={disabled} onClick={onClick} role={role} aria-checked={ariaChecked}>
        {children}
      </button>
    ),
    HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Input: ({
      value,
      placeholder,
      onChange,
      onKeyDown,
    }: {
      value?: string
      placeholder?: string
      onChange?: React.ChangeEventHandler<HTMLInputElement>
      onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
    }) => <input value={value} placeholder={placeholder} onChange={onChange} onKeyDown={onKeyDown} />,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  }
})

import { FolderPicker } from './FolderPicker'

let root: Root
let host: HTMLDivElement
let shadowRoot: ShadowRoot

describe('FolderPicker membership selection', () => {
  beforeEach(async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeState.addMembership.mockResolvedValue({ id: 'membership-1' })
    host = document.createElement('div')
    shadowRoot = host.attachShadow({ mode: 'open' })
    document.body.append(host)
    root = createRoot(shadowRoot)
    await act(async () => {
      root.render(<FolderPicker />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('does not close on Shadow DOM pointerdown and dispatches the traced command', async () => {
    const folderButton = shadowRoot.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!

    await act(async () => {
      folderButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
      await Promise.resolve()
    })
    expect(runtimeState.closePicker).not.toHaveBeenCalled()

    await act(async () => {
      folderButton.click()
      await Promise.resolve()
    })
    expect(runtimeState.addMembership).toHaveBeenCalledWith(
      'folder-1',
      'chat-1',
      'Research chat',
      'membership-add-picker-test',
    )
  })

  it('uses the required 20px corner radius', () => {
    expect(shadowRoot.querySelector('[data-gpk-folder-picker]')?.getAttribute('data-border-radius')).toBe('20px')
  })

  it('keeps the picker open and renders repository failures', async () => {
    runtimeState.addMembership.mockRejectedValueOnce(new Error('Folder is unavailable'))
    const folderButton = shadowRoot.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!

    await act(async () => {
      folderButton.click()
      await Promise.resolve()
    })

    expect(shadowRoot.textContent).toContain('Folder is unavailable')
    expect(runtimeState.closePicker).not.toHaveBeenCalled()
  })

  it('opens the shared Folder editor with the originating chat context', () => {
    const newFolderButton = [...shadowRoot.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('New Folder'))!

    act(() => newFolderButton.click())

    expect(runtimeState.openCreateDialog).toHaveBeenCalledWith({
      chatId: 'chat-1',
      cachedTitle: 'Research chat',
      traceId: 'membership-add-picker-test',
    })
  })
})
