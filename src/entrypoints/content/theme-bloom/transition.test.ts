import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getThemeBloomFallbackRevealCoordinates,
  getThemeBloomRevealRadius,
  primeThemeBloomViewTransition,
  startThemeBloomTransition,
  THEME_BLOOM_DURATION_MS,
} from './transition'

describe('Theme Bloom transition', () => {
  afterEach(() => {
    document.getElementById('gpk-theme-bloom-transition-style')?.remove()
    document.getElementById('gpk-theme-bloom-transition-primer-style')?.remove()
    document.documentElement.removeAttribute('data-gpk-theme-bloom-fallback')
    document.documentElement.style.removeProperty('--gpk-theme-bloom-x')
    document.documentElement.style.removeProperty('--gpk-theme-bloom-y')
    document.documentElement.style.removeProperty('--gpk-theme-bloom-radius')
    window.history.replaceState({}, '', '/')
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('finds the distance to the furthest viewport corner', () => {
    expect(getThemeBloomRevealRadius({ clientX: 0, clientY: 0 }, 300, 400)).toBe(500)
  })

  it('compensates fallback clip coordinates for the background layer scale', () => {
    const coordinates = getThemeBloomFallbackRevealCoordinates(
      { clientX: 558, clientY: 203 },
      862,
      1103,
      857,
      1.08,
      1.08,
    )

    expect(coordinates.clientX).toBeCloseTo(557.5185)
    expect(coordinates.clientY).toBeCloseTo(219.7037)
    expect(coordinates.radius).toBeCloseTo(798.1481)
  })

  it('uses the fallback animation when View Transitions are unavailable', async () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    const transition = startThemeBloomTransition({
      origin: { clientX: 20, clientY: 30 },
      apply,
      document,
      prefersReducedMotion: false,
    })

    expect(apply).toHaveBeenCalledOnce()
    expect(transition.usesViewTransition).toBe(false)
    expect(document.documentElement.getAttribute('data-gpk-theme-bloom-fallback')).toBe('true')
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-x')).toBe('20px')
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-y')).toBe('30px')
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-fallback-x')).toBe('20px')
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-fallback-y')).toBe('30px')
    await vi.advanceTimersByTimeAsync(THEME_BLOOM_DURATION_MS)
    await transition.finished
    expect(document.getElementById('gpk-theme-bloom-transition-style')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-x')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-fallback-x')).toBe('')
  })

  it('forces the DOM fallback in a DEV build when requested by the URL', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '?gpk-force-theme-bloom-dom-fallback')
    const startViewTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const transition = startThemeBloomTransition({
      origin: { clientX: 20, clientY: 30 },
      apply: vi.fn(),
      document,
      prefersReducedMotion: false,
    })

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(transition.usesViewTransition).toBe(false)
    expect(document.documentElement.getAttribute('data-gpk-theme-bloom-fallback')).toBe('true')
    await vi.advanceTimersByTimeAsync(THEME_BLOOM_DURATION_MS)
    await transition.finished
  })

  it('uses a short cross-fade for reduced motion', async () => {
    vi.useFakeTimers()
    const transition = startThemeBloomTransition({
      origin: { clientX: 20, clientY: 30 },
      apply: vi.fn(),
      document,
      prefersReducedMotion: true,
    })

    expect(transition.reducedMotion).toBe(true)
    await vi.advanceTimersByTimeAsync(120)
    await transition.finished
  })

  it('uses same-document View Transitions when available', async () => {
    const animationFinished = Promise.resolve()
    const animationReady = Promise.resolve()
    const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => ({
      finished: animationFinished,
      ready: animationReady,
      cancel: vi.fn(),
    }))
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: animate,
    })
    const finished = Promise.resolve()
    const startViewTransition = vi.fn((callback: () => void) => {
      expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-x')).toBe('20px')
      expect(document.documentElement.style.getPropertyValue('--gpk-theme-bloom-y')).toBe('30px')
      expect(document.getElementById('gpk-theme-bloom-transition-style')?.textContent).toContain(
        'clip-path: circle(0 at var(--gpk-theme-bloom-x) var(--gpk-theme-bloom-y))',
      )
      callback()
      return { ready: Promise.resolve(), finished, skipTransition: vi.fn() }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const apply = vi.fn()
    const transition = startThemeBloomTransition({
      origin: { clientX: 20, clientY: 30 },
      apply,
      document,
      prefersReducedMotion: false,
    })

    expect(transition.usesViewTransition).toBe(true)
    expect(apply).toHaveBeenCalledOnce()
    await transition.finished
    expect(animate).toHaveBeenCalledOnce()

    const [keyframes, animationOptions] = animate.mock.calls[0]
    expect(keyframes).toHaveLength(8)
    expect(keyframes[0]).toMatchObject({
      clipPath: 'circle(0px at 20px 30px)',
      offset: 0,
    })
    expect(keyframes.at(-1)?.clipPath).toMatch(
      /^circle\(\d+px at 20px 30px\)$/,
    )
    expect(animationOptions).toMatchObject({
      duration: THEME_BLOOM_DURATION_MS,
      easing: 'linear',
      fill: 'both',
      pseudoElement: '::view-transition-new(root)',
    })
  })

  it('primes a real View Transition pseudo-element without changing page state', async () => {
    const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => ({
      finished: Promise.resolve(),
    }))
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: animate,
    })
    const startViewTransition = vi.fn((update: () => void) => {
      update()
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })

    await primeThemeBloomViewTransition(document)

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledOnce()
    const [keyframes, animationOptions] = animate.mock.calls[0]
    expect(keyframes).toHaveLength(8)
    expect(keyframes[0]).toMatchObject({
      clipPath: 'circle(0px at 512px 384px)',
      offset: 0,
    })
    expect(animationOptions).toMatchObject({
      duration: 34,
      easing: 'linear',
      fill: 'both',
      pseudoElement: '::view-transition-new(root)',
    })
    expect(document.getElementById('gpk-theme-bloom-transition-primer-style')).toBeNull()
  })
})
