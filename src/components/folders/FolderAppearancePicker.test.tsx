import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@chakra-ui/react', async () => {
  const React = await import('react')

  const PassThrough = ({ children }: React.PropsWithChildren) => <div>{children}</div>

  return {
    Box: ({ children, boxSize, borderRadius, css }: React.PropsWithChildren<{
      boxSize?: string
      borderRadius?: string
      css?: { background?: string }
    }>) => (
      <div
        data-gpk-color-swatch={css?.background ? 'true' : undefined}
        data-background={css?.background}
        data-box-size={boxSize}
        data-border-radius={borderRadius}
      >
        {children}
      </div>
    ),
    Button: ({ children, onClick }: React.PropsWithChildren<{
      onClick?: React.MouseEventHandler<HTMLButtonElement>
    }>) => <button onClick={onClick}>{children}</button>,
    ColorPicker: {
      Root: ({ children, inline }: React.PropsWithChildren<{ inline?: boolean }>) => (
        <div data-gpk-color-picker data-inline={inline ? 'true' : 'false'}>{children}</div>
      ),
      HiddenInput: () => null,
      Area: () => <div />,
      EyeDropper: () => <button type="button" />,
      ChannelSlider: PassThrough,
      ChannelSliderTrack: () => <div />,
      ChannelSliderThumb: () => <div />,
      Input: ({ 'aria-label': ariaLabel }: { 'aria-label': string }) => <input aria-label={ariaLabel} />,
    },
    HStack: PassThrough,
    IconButton: ({ children, onClick, 'aria-label': ariaLabel, 'aria-pressed': ariaPressed }: React.PropsWithChildren<{
      onClick?: React.MouseEventHandler<HTMLButtonElement>
      'aria-label'?: string
      'aria-pressed'?: boolean
    }>) => (
      <button type="button" onClick={onClick} aria-label={ariaLabel} aria-pressed={ariaPressed}>
        {children}
      </button>
    ),
    Popover: {
      Root: PassThrough,
      Trigger: PassThrough,
      Positioner: PassThrough,
      Content: PassThrough,
      Body: PassThrough,
      Footer: PassThrough,
    },
    Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
    SimpleGrid: ({ children, 'aria-labelledby': labelledBy }: React.PropsWithChildren<{
      'aria-labelledby'?: string
    }>) => (
      <div data-gpk-color-swatches={labelledBy === 'folder-color-presets-label' ? 'true' : undefined}>
        {children}
      </div>
    ),
    Stack: PassThrough,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    parseColor: (value: string) => value,
  }
})

vi.mock('@/components/ui/color-mode', () => ({
  useColorMode: () => ({ colorMode: 'light' }),
}))

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

import { FolderAppearancePicker } from './FolderAppearancePicker'

describe('FolderAppearancePicker custom color', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('places the multicolor custom swatch after the preset colors and preserves the picker action', () => {
    const onChange = vi.fn()

    act(() => {
      root.render(
        <FolderAppearancePicker
          value={{ iconKey: 'folder', colorValue: 'blue' }}
          onChange={onChange}
        />,
      )
    })

    const swatches = container.querySelectorAll<HTMLButtonElement>('[data-gpk-color-swatches="true"] > button')
    const customSwatch = swatches[8]

    expect(swatches).toHaveLength(9)
    expect(customSwatch.getAttribute('aria-label')).toBe('Custom color')
    expect(customSwatch.querySelector('[data-gpk-color-swatch]')?.getAttribute('data-background'))
      .toContain('conic-gradient')

    act(() => customSwatch.click())

    expect(onChange).toHaveBeenCalledWith({ iconKey: 'folder', colorValue: '#3A83F7' })
    expect(container.querySelector('[data-gpk-color-picker]')?.getAttribute('data-inline')).toBe('true')
    expect(container.querySelector('[aria-label="Hex color"]')).not.toBeNull()
  })
})
