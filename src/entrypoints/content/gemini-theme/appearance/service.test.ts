import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEM_EXT_EVENTS } from '@/common/event'
import {
  getAppearanceState,
  setAppearanceMode,
  subscribeSystemThemeChange,
} from './service'

type MatchMediaListener = (event: MediaQueryListEvent) => void

function createModernMatchMediaMock(initialMatches: boolean) {
  const listeners = new Set<MatchMediaListener>()
  const mediaQueryList = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((type: string, listener: MatchMediaListener) => {
      if (type === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: MatchMediaListener) => {
      if (type === 'change') listeners.delete(listener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(() => mediaQueryList)

  return {
    spy,
    mediaQueryList,
    emit(matches: boolean) {
      listeners.forEach((listener) => {
        listener({ matches } as MediaQueryListEvent)
      })
    },
  }
}

function createLegacyMatchMediaMock(initialMatches: boolean) {
  let listener: MatchMediaListener | null = null
  const mediaQueryList = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: undefined,
    removeEventListener: undefined,
    addListener: vi.fn((nextListener: MatchMediaListener) => {
      listener = nextListener
    }),
    removeListener: vi.fn((nextListener: MatchMediaListener) => {
      if (listener === nextListener) listener = null
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(() => mediaQueryList)

  return {
    spy,
    mediaQueryList,
    emit(matches: boolean) {
      listener?.({ matches } as MediaQueryListEvent)
    },
  }
}

describe('appearance service', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.className = ''
    document.documentElement.removeAttribute('data-gpk-theme-sync-ready')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves mode from Bard-Color-Theme when user forces dark mode', () => {
    localStorage.setItem('Bard-Color-Theme', 'Bard-Dark-Theme')
    document.body.classList.add('dark-theme')
    createModernMatchMediaMock(false)

    const state = getAppearanceState()

    expect(state.mode).toBe('dark')
    expect(state.effectiveTheme).toBe('dark')
  })

  it('uses priority body > matchMedia > localStorage theme when mode is system', () => {
    localStorage.removeItem('Bard-Color-Theme')
    localStorage.setItem('theme', 'light')
    createModernMatchMediaMock(true)

    const withoutBodyClass = getAppearanceState()
    expect(withoutBodyClass.mode).toBe('system')
    expect(withoutBodyClass.effectiveTheme).toBe('dark')

    document.body.classList.add('light-theme')
    const withBodyClass = getAppearanceState()
    expect(withBodyClass.effectiveTheme).toBe('light')
  })

  it('sets localStorage and body class when switching to light', () => {
    document.body.classList.add('dark-theme')

    const state = setAppearanceMode('light')

    expect(state).toEqual({ mode: 'light', effectiveTheme: 'light' })
    expect(localStorage.getItem('theme')).toBe('light')
    expect(localStorage.getItem('Bard-Color-Theme')).toBe('Bard-Light-Theme')
    expect(document.body.classList.contains('light-theme')).toBe(true)
    expect(document.body.classList.contains('dark-theme')).toBe(false)
  })

  it('removes Bard-Color-Theme and follows system when switching to system', () => {
    localStorage.setItem('Bard-Color-Theme', 'Bard-Light-Theme')
    createModernMatchMediaMock(true)

    const state = setAppearanceMode('system')

    expect(state).toEqual({ mode: 'system', effectiveTheme: 'dark' })
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem('Bard-Color-Theme')).toBeNull()
    expect(document.body.classList.contains('dark-theme')).toBe(true)
  })

  it('falls back to system mode for invalid Bard-Color-Theme value', () => {
    localStorage.setItem('Bard-Color-Theme', 'invalid-theme')
    createModernMatchMediaMock(false)

    const state = getAppearanceState()

    expect(state.mode).toBe('system')
    expect(state.effectiveTheme).toBe('light')
  })

  it('does not throw when localStorage write fails and still updates body class', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('setItem failed')
    })

    expect(() => setAppearanceMode('dark')).not.toThrow()
    expect(document.body.classList.contains('dark-theme')).toBe(true)
  })

  it('uses main-world bridge when ready and dispatches apply event', () => {
    document.documentElement.setAttribute('data-gpk-theme-sync-ready', 'true')
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    const state = setAppearanceMode('dark')

    expect(state).toEqual({ mode: 'dark', effectiveTheme: 'dark' })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: GEM_EXT_EVENTS.THEME_APPEARANCE_APPLY,
      }),
    )
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('subscribes/unsubscribes system theme change with modern event listeners', () => {
    const matchMediaMock = createModernMatchMediaMock(false)
    const onChange = vi.fn()

    const unsubscribe = subscribeSystemThemeChange(onChange)
    matchMediaMock.emit(true)
    unsubscribe()

    expect(matchMediaMock.mediaQueryList.addEventListener).toHaveBeenCalledTimes(1)
    expect(matchMediaMock.mediaQueryList.removeEventListener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('dark')
  })

  it('supports legacy addListener/removeListener fallback', () => {
    const matchMediaMock = createLegacyMatchMediaMock(false)
    const onChange = vi.fn()

    const unsubscribe = subscribeSystemThemeChange(onChange)
    matchMediaMock.emit(true)
    unsubscribe()

    expect(matchMediaMock.mediaQueryList.addListener).toHaveBeenCalledTimes(1)
    expect(matchMediaMock.mediaQueryList.removeListener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('dark')
  })
})
