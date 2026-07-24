import { act } from 'react'
import type { PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnhancementsSettingsView } from './index'

const mocks = vi.hoisted(() => ({
  getChatOutline: vi.fn(),
  getBulkDelete: vi.fn(),
  getGemAvatar: vi.fn(),
  watchChatOutline: vi.fn(),
  watchBulkDelete: vi.fn(),
  watchGemAvatar: vi.fn(),
  setChatOutline: vi.fn(),
  setBulkDelete: vi.fn(),
  setGemAvatar: vi.fn(),
  getTopBarSettings: vi.fn(),
  updateTopBarSettings: vi.fn(),
  watchTopBarSettings: vi.fn(),
  topBarWatcher: {
    current: null as ((settings: unknown) => void) | null,
  },
  toasterCreate: vi.fn(),
}))

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Container: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Stack: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Text: ({ children }: PropsWithChildren) => <span>{children}</span>,
  Switch: {
    Root: ({
      checked,
      disabled,
      onCheckedChange,
      children,
    }: PropsWithChildren<{
      checked: boolean
      disabled: boolean
      onCheckedChange: (details: { checked: boolean }) => void
    }>) => (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange({ checked: !checked })}
      >
        {children}
      </button>
    ),
    HiddenInput: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
      <span data-switch-label={ariaLabel} />
    ),
    Control: ({ children }: PropsWithChildren) => <span>{children}</span>,
    Thumb: () => <span />,
  },
}))

vi.mock('@/entrypoints/popup/storage', () => ({
  enableChatOutline: {
    getValue: mocks.getChatOutline,
    setValue: mocks.setChatOutline,
    watch: mocks.watchChatOutline,
  },
  enableBulkDelete: {
    getValue: mocks.getBulkDelete,
    setValue: mocks.setBulkDelete,
    watch: mocks.watchBulkDelete,
  },
  enableGemAvatar: {
    getValue: mocks.getGemAvatar,
    setValue: mocks.setGemAvatar,
    watch: mocks.watchGemAvatar,
  },
}))

vi.mock('@/services/topBarCustomizationSettings', () => ({
  DEFAULT_TOP_BAR_SETTINGS: {
    showThemeShortcut: true,
    hideUpgradeReminder: true,
  },
  getTopBarSettings: mocks.getTopBarSettings,
  updateTopBarSettings: mocks.updateTopBarSettings,
  normalizeTopBarSettings: (settings: unknown) => {
    const source = settings && typeof settings === 'object'
      ? settings as Record<string, unknown>
      : {}
    return {
      showThemeShortcut: typeof source.showThemeShortcut === 'boolean'
        ? source.showThemeShortcut
        : true,
      hideUpgradeReminder: typeof source.hideUpgradeReminder === 'boolean'
        ? source.hideUpgradeReminder
        : true,
    }
  },
  topBarSettingsStorage: {
    watch: mocks.watchTopBarSettings,
  },
}))

vi.mock('@/components/ui/toaster', () => ({
  toaster: {
    create: mocks.toasterCreate,
  },
}))

vi.mock('@/utils/i18n', () => {
  const translations: Record<string, string> = {
    'settings.enhancements.topBarCustomization.title': 'Top bar customization',
    'settings.enhancements.topBarCustomization.showThemeShortcut.title':
      'Show Theme shortcut',
    'settings.enhancements.topBarCustomization.showThemeShortcut.description':
      "Show a shortcut to Theme in Gemini's top bar.",
    'settings.enhancements.topBarCustomization.hideUpgradeReminder.title':
      'Hide upgrade reminder',
    'settings.enhancements.topBarCustomization.hideUpgradeReminder.description':
      "Hide Gemini's upgrade reminder from the top bar.",
    'settings.enhancements.chatOutline.title': 'Chat Outline',
    'settings.enhancements.chatOutline.description': 'Chat outline description',
    'settings.enhancements.bulkDelete.title': 'Bulk Delete',
    'settings.enhancements.bulkDelete.description': 'Bulk delete description',
    'settings.enhancements.gemAvatar.title': 'Gem Avatar',
    'settings.enhancements.gemAvatar.description': 'Gem avatar description',
  }

  return {
    t: (key: string) => translations[key] ?? key,
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function findSwitch(container: HTMLElement, label: string): HTMLButtonElement {
  const marker = container.querySelector(`[data-switch-label="${label}"]`)
  const button = marker?.closest('button')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Switch not found: ${label}`)
  }
  return button
}

let root: Root
let container: HTMLDivElement

describe('EnhancementsSettingsView top bar customization', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true

    vi.clearAllMocks()
    mocks.getChatOutline.mockResolvedValue(true)
    mocks.getBulkDelete.mockResolvedValue(true)
    mocks.getGemAvatar.mockResolvedValue(false)
    mocks.watchChatOutline.mockReturnValue(() => undefined)
    mocks.watchBulkDelete.mockReturnValue(() => undefined)
    mocks.watchGemAvatar.mockReturnValue(() => undefined)
    mocks.watchTopBarSettings.mockImplementation((callback) => {
      mocks.topBarWatcher.current = callback
      return () => {
        mocks.topBarWatcher.current = null
      }
    })
    mocks.getTopBarSettings.mockResolvedValue({
      showThemeShortcut: true,
      hideUpgradeReminder: true,
    })
    mocks.updateTopBarSettings.mockResolvedValue({
      showThemeShortcut: true,
      hideUpgradeReminder: true,
    })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders the group and disables both switches while loading', async () => {
    const deferred = createDeferred<{
      showThemeShortcut: boolean
      hideUpgradeReminder: boolean
    }>()
    mocks.getTopBarSettings.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<EnhancementsSettingsView />)
    })

    expect(container.textContent).toContain('Top bar customization')
    expect(container.textContent).toContain(
      "Show a shortcut to Theme in Gemini's top bar.",
    )
    expect(container.textContent).toContain(
      "Hide Gemini's upgrade reminder from the top bar.",
    )
    expect(findSwitch(container, 'Show Theme shortcut').disabled).toBe(true)
    expect(findSwitch(container, 'Hide upgrade reminder').disabled).toBe(true)

    await act(async () => {
      deferred.resolve({
        showThemeShortcut: false,
        hideUpgradeReminder: true,
      })
      await deferred.promise
    })

    expect(findSwitch(container, 'Show Theme shortcut').disabled).toBe(false)
    expect(findSwitch(container, 'Show Theme shortcut').getAttribute('aria-checked'))
      .toBe('false')
    expect(findSwitch(container, 'Hide upgrade reminder').getAttribute('aria-checked'))
      .toBe('true')
  })

  it('writes one patch, locks the group, and follows storage updates', async () => {
    const deferred = createDeferred<{
      showThemeShortcut: boolean
      hideUpgradeReminder: boolean
    }>()
    mocks.updateTopBarSettings.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<EnhancementsSettingsView />)
    })

    await act(async () => {
      findSwitch(container, 'Show Theme shortcut').click()
    })

    expect(mocks.updateTopBarSettings).toHaveBeenCalledWith({
      showThemeShortcut: false,
    })
    expect(findSwitch(container, 'Show Theme shortcut').disabled).toBe(true)
    expect(findSwitch(container, 'Hide upgrade reminder').disabled).toBe(true)

    await act(async () => {
      mocks.topBarWatcher.current?.({
        showThemeShortcut: false,
        hideUpgradeReminder: true,
      })
      deferred.resolve({
        showThemeShortcut: false,
        hideUpgradeReminder: true,
      })
      await deferred.promise
    })

    expect(findSwitch(container, 'Show Theme shortcut').getAttribute('aria-checked'))
      .toBe('false')
    expect(findSwitch(container, 'Hide upgrade reminder').disabled).toBe(false)
  })

  it('keeps the previous state and reports a failed write', async () => {
    mocks.updateTopBarSettings.mockRejectedValue(new Error('storage unavailable'))

    await act(async () => {
      root.render(<EnhancementsSettingsView />)
    })
    await act(async () => {
      findSwitch(container, 'Hide upgrade reminder').click()
    })

    expect(findSwitch(container, 'Hide upgrade reminder').getAttribute('aria-checked'))
      .toBe('true')
    expect(mocks.toasterCreate).toHaveBeenCalledWith({
      type: 'error',
      title: 'storage unavailable',
    })
  })
})
