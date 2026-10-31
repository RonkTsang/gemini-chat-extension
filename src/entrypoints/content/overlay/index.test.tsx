import { act, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({ mounted: 0, cleaned: 0 }))

vi.mock('@/components/ui/provider-shadow-dom', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    Provider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  }
})
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }))
vi.mock('@/components/setting-panel', () => ({ SettingPanel: () => null }))
vi.mock('@/components/page-shortcuts/PageShortcutController', () => ({ PageShortcutController: () => null }))
vi.mock('@/components/theme-floating-panel', () => ({ ThemeFloatingPanel: () => null }))
vi.mock('@/components/chat-settings-panel', () => ({ ChatSettingsPanel: () => null }))
vi.mock('@/hooks/useSyncColorMode', () => ({ useSyncColorMode: () => undefined }))
vi.mock('./extension-update', () => ({ default: () => null }))
vi.mock('./whats-new', () => ({ default: () => null }))
vi.mock('@/components/theme-bloom-overlay', () => ({ ThemeBloomOverlay: () => null }))
vi.mock('~/assets/quote.svg?react', () => ({ default: () => null }))
vi.mock('./quick-follow-up/index', async () => {
  const { createElement, useEffect } = await import('react')
  return {
    default: function QuickFollowUpLifecycleProbe() {
      useEffect(() => {
        lifecycle.mounted += 1
        return () => { lifecycle.cleaned += 1 }
      }, [])
      return createElement('div', { 'data-testid': 'quick-follow-up-probe' })
    },
  }
})

import { renderOverlay } from './index'

describe('renderOverlay lifecycle', () => {
  let previousActEnvironment: boolean | undefined

  beforeEach(() => {
    previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    lifecycle.mounted = 0
    lifecycle.cleaned = 0
    const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    if (previousActEnvironment === undefined) delete reactGlobal.IS_REACT_ACT_ENVIRONMENT
    else reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    document.body.replaceChildren()
  })

  it('unmounts React effects and removes its root exactly once', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let cleanup: (() => void) | undefined

    act(() => {
      cleanup = renderOverlay(container)
    })

    expect(container.querySelector('[data-testid="quick-follow-up-probe"]')).not.toBeNull()
    expect(lifecycle.mounted).toBeGreaterThan(0)

    act(() => {
      cleanup?.()
      cleanup?.()
    })

    expect(container.childElementCount).toBe(0)
    expect(lifecycle.cleaned).toBe(lifecycle.mounted)
  })
})
