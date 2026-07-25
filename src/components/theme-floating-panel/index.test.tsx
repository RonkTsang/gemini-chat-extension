import { act } from 'react'
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import { ThemeFloatingPanel } from './index'

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Flex: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Heading: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
  IconButton: ({
    children,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: PropsWithChildren) => children,
}))

vi.mock('@/components/setting-panel/views/theme/ThemeSettingsControls', () => ({
  ThemeSettingsControls: () => null,
}))

vi.mock('@/components/setting-panel/views/theme/useThemeSettingsController', () => ({
  useThemeSettingsController: () => ({}),
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

let root: Root
let container: HTMLDivElement

describe('ThemeFloatingPanel entry behavior', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
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

  it('hides the upper-left action when opened from the top bar', async () => {
    await act(async () => {
      root.render(<ThemeFloatingPanel />)
    })

    act(() => {
      eventBus.emitSync('theme-floating-panel:open', {
        source: 'top-bar-action',
      })
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Close theme panel')
  })

  it('keeps the back action when opened from Theme settings', async () => {
    await act(async () => {
      root.render(<ThemeFloatingPanel />)
    })

    act(() => {
      eventBus.emitSync('theme-floating-panel:open', {
        source: 'setting-panel',
        returnToSettings: true,
      })
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Back to settings')
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Close theme panel')
  })

  it('keeps the primary action for existing non-top-bar entry points', async () => {
    await act(async () => {
      root.render(<ThemeFloatingPanel />)
    })

    act(() => {
      eventBus.emitSync('theme-floating-panel:open', {
        source: 'whats-new',
      })
    })

    expect(container.querySelectorAll('button')).toHaveLength(2)
  })
})
