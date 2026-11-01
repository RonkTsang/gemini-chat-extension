import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureSidebarExpanded, resolveTarget, waitForElement } from './dom'

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('onboarding targets', () => {
  it('rejects missing, duplicate and disconnected targets', () => {
    expect(resolveTarget('theme')).toBeNull()
    document.body.innerHTML = '<button data-gpk-tour="theme"></button><button data-gpk-tour="theme"></button>'
    expect(resolveTarget('theme')).toBeNull()
    document.body.replaceChildren()
    expect(resolveTarget('theme')).toBeNull()
  })

  it('only opens a collapsed native sidebar and never toggles an expanded one', () => {
    document.body.innerHTML = '<side-nav-sparkle-button><button data-test-id="side-nav-sparkle-button" aria-expanded="false"></button></side-nav-sparkle-button>'
    const button = document.querySelector('button')!
    const click = vi.spyOn(button, 'click')
    ensureSidebarExpanded()
    expect(click).toHaveBeenCalledOnce()
    button.setAttribute('aria-expanded', 'true')
    ensureSidebarExpanded()
    expect(click).toHaveBeenCalledOnce()
  })

  it('times out missing targets after one second and cancels waits without leftover timers', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const missing = waitForElement(() => null, controller.signal)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await missing).toBeNull()
    const cancelled = waitForElement(() => null, controller.signal)
    controller.abort()
    expect(await cancelled).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
