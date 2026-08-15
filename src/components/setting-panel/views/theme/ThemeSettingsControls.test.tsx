import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeSettingsController } from './useThemeSettingsController'
import { ThemeSettingsControls } from './ThemeSettingsControls'

vi.mock('./ThemeBloomControl', () => ({
  ThemeBloomControl: ({ variant }: { variant: string }) => (
    <div data-control="theme-bloom" data-variant={variant} />
  ),
}))

vi.mock('./AppearanceSelector', () => ({
  AppearanceSelector: ({ variant }: { variant: string }) => (
    <div data-control="appearance" data-variant={variant} />
  ),
}))

vi.mock('./ColorPresets', () => ({
  ColorPresets: ({ variant }: { variant: string }) => (
    <div data-control="colors" data-variant={variant} />
  ),
}))

vi.mock('./CustomBackground', () => ({
  CustomBackground: ({ variant }: { variant: string }) => (
    <div data-control="wallpaper" data-variant={variant} />
  ),
}))

vi.mock('@/components/chat-layout-settings', () => ({
  ChatLayoutSettings: ({ variant }: { variant: string }) => (
    <div data-control="chat-layout" data-variant={variant} />
  ),
}))

describe('ThemeSettingsControls', () => {
  let container: HTMLDivElement
  let root: Root
  const controller = {
    appearanceState: { mode: 'system' },
  } as unknown as ThemeSettingsController

  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders Theme Bloom first and Chat layout after Wallpaper', () => {
    act(() => {
      root.render(
        <ThemeSettingsControls
          controller={controller}
        />,
      )
    })

    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-control]'),
    )
    expect(controls.map((control) => control.dataset.control)).toEqual([
      'theme-bloom',
      'appearance',
      'colors',
      'wallpaper',
      'chat-layout',
    ])
    expect(controls.every(
      (control) => control.dataset.variant === 'default',
    )).toBe(true)
  })

  it('uses the compact Chat layout variant in the floating panel layout', () => {
    act(() => {
      root.render(
        <ThemeSettingsControls
          controller={controller}
          variant="compact"
        />,
      )
    })

    expect(
      container.querySelector('[data-control="chat-layout"]')
        ?.getAttribute('data-variant'),
    ).toBe('compact')
    expect(
      container.querySelector('[data-control="theme-bloom"]')
        ?.getAttribute('data-variant'),
    ).toBe('compact')
  })
})
