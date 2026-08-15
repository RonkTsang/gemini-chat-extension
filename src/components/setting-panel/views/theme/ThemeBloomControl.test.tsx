import { act } from 'react'
import type { PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeBloomControl } from './ThemeBloomControl'

const mocks = vi.hoisted(() => ({
  getValue: vi.fn(),
  setValue: vi.fn(),
  watch: vi.fn(),
  watcher: {
    current: null as ((enabled: boolean) => void) | null,
  },
  unwatch: vi.fn(),
  toasterCreate: vi.fn(),
}))

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  Heading: ({ children }: PropsWithChildren) => <h3>{children}</h3>,
  HStack: ({ children }: PropsWithChildren) => <div>{children}</div>,
  IconButton: ({
    children,
    'aria-label': ariaLabel,
  }: PropsWithChildren<{ 'aria-label': string }>) => (
    <button type="button" aria-label={ariaLabel}>{children}</button>
  ),
  Separator: ({
    'data-separator': dataSeparator,
  }: {
    'data-separator'?: string
  }) => <hr data-separator={dataSeparator} />,
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
    HiddenInput: ({
      'aria-label': ariaLabel,
    }: {
      'aria-label': string
    }) => (
      <span data-switch-label={ariaLabel} />
    ),
    Control: ({ children }: PropsWithChildren) => <span>{children}</span>,
    Thumb: () => <span />,
  },
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({
    children,
    content,
  }: PropsWithChildren<{ content: string }>) => (
    <span data-tooltip-content={content}>{children}</span>
  ),
}))

vi.mock('@/common/storage', () => ({
  DEFAULT_THEME_BLOOM_ENABLED: true,
  enableThemeBloom: {
    getValue: mocks.getValue,
    setValue: mocks.setValue,
    watch: mocks.watch,
  },
}))

vi.mock('@/components/ui/toaster', () => ({
  toaster: { create: mocks.toasterCreate },
}))

vi.mock('@/utils/i18n', () => ({
  tt: (key: string, fallback: string) => {
    const translations: Record<string, string> = {
      'settingPanel.theme.themeBloom.title': 'Theme Bloom',
      'settingPanel.theme.interactions': 'Interactions',
      'settingPanel.theme.themeBloom.description':
        'Drop an image outside the prompt box to apply a matching theme. Drop it inside the prompt box to upload to Gemini.',
    }
    return translations[key] ?? fallback
  },
}))

function findSwitch(container: HTMLElement): HTMLButtonElement {
  const element = container.querySelector('[role="switch"]')
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Theme Bloom switch not found')
  }
  return element
}

describe('ThemeBloomControl', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    mocks.getValue.mockResolvedValue(true)
    mocks.setValue.mockResolvedValue(undefined)
    mocks.watch.mockImplementation((callback) => {
      mocks.watcher.current = callback
      return mocks.unwatch
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    mocks.watcher.current = null
    container.remove()
  })

  it('renders an Interactions section with an accessible info tooltip', async () => {
    await act(async () => {
      root.render(<ThemeBloomControl />)
    })

    expect(container.textContent).toContain('Interactions')
    expect(container.textContent).toContain('Theme Bloom')
    const description =
      'Drop an image outside the prompt box to apply a matching theme. Drop it inside the prompt box to upload to Gemini.'
    expect(container.textContent).not.toContain(description)
    expect(
      container.querySelector('[data-tooltip-content]')
        ?.getAttribute('data-tooltip-content'),
    ).toBe(description)
    expect(
      container.querySelector(`button[aria-label="${description}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-separator="interactions"]'),
    ).not.toBeNull()
    expect(findSwitch(container).getAttribute('aria-checked')).toBe('true')
  })

  it('persists toggle changes', async () => {
    await act(async () => {
      root.render(<ThemeBloomControl />)
    })

    await act(async () => {
      findSwitch(container).click()
    })

    expect(mocks.setValue).toHaveBeenCalledWith(false)
  })

  it('follows storage updates and unsubscribes on unmount', async () => {
    await act(async () => {
      root.render(<ThemeBloomControl variant="compact" />)
    })

    act(() => {
      mocks.watcher.current?.(false)
    })
    expect(findSwitch(container).getAttribute('aria-checked')).toBe('false')

    act(() => root.unmount())
    expect(mocks.unwatch).toHaveBeenCalledOnce()
    root = createRoot(container)
  })

  it('keeps the current state and reports a failed write', async () => {
    mocks.setValue.mockRejectedValue(new Error('storage unavailable'))
    await act(async () => {
      root.render(<ThemeBloomControl />)
    })

    await act(async () => {
      findSwitch(container).click()
    })

    expect(findSwitch(container).getAttribute('aria-checked')).toBe('true')
    expect(mocks.toasterCreate).toHaveBeenCalledWith({
      type: 'error',
      title: 'storage unavailable',
    })
  })
})
