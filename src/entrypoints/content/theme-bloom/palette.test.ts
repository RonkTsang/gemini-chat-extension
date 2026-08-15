import { describe, expect, it } from 'vitest'
import {
  calculateThemeBloomPaletteFromPixels,
  matchThemeBloomPreset,
  oklabToDisplaySrgb,
  srgbToOklab,
  srgbToOklch,
} from './palette'

function pixels(
  color: { red: number; green: number; blue: number; alpha?: number },
  count: number,
) {
  return Array.from({ length: count }, () => ({
    ...color,
    alpha: color.alpha ?? 255,
  }))
}

describe('Theme Bloom palette', () => {
  it('round-trips representative sRGB colours through OKLab', () => {
    const source = { red: 66, green: 133, blue: 244 }
    const output = oklabToDisplaySrgb(srgbToOklab(source.red, source.green, source.blue))

    expect(output.red).toBeCloseTo(source.red, 0)
    expect(output.green).toBeCloseTo(source.green, 0)
    expect(output.blue).toBeCloseTo(source.blue, 0)
  })

  it('matches a saturated dominant colour to its closest preset', () => {
    const palette = calculateThemeBloomPaletteFromPixels(pixels({ red: 18, green: 147, blue: 182 }, 24))

    expect(palette.presetKey).toBe('cyan')
    expect(palette.accentColor).toBe('#1293b6')
  })

  it('lets a smaller saturated accent outrank a white background', () => {
    const palette = calculateThemeBloomPaletteFromPixels([
      ...pixels({ red: 250, green: 250, blue: 250 }, 60),
      ...pixels({ red: 220, green: 38, blue: 38 }, 20),
    ])

    expect(palette.presetKey).toBe('red')
    expect(palette.accentColor).toBe('#dc2626')
  })

  it('classifies grayscale images before matching a chromatic preset', () => {
    const palette = calculateThemeBloomPaletteFromPixels([
      ...pixels({ red: 25, green: 25, blue: 25 }, 16),
      ...pixels({ red: 184, green: 184, blue: 184 }, 16),
    ])

    expect(palette.presetKey).toBe('gray')
    expect(palette.presetDistance).toBe(0)
  })

  it('ignores fully transparent pixels during matching', () => {
    const palette = calculateThemeBloomPaletteFromPixels([
      ...pixels({ red: 0, green: 0, blue: 0, alpha: 0 }, 40),
      ...pixels({ red: 22, green: 163, blue: 74 }, 12),
    ])

    expect(palette.presetKey).toBe('green')
  })

  it('uses registry order to break equal preset distances', () => {
    const accent = srgbToOklch(100, 120, 140)
    const result = matchThemeBloomPreset(accent, [
      { key: 'first', primary: '#64788c', css: null },
      { key: 'second', primary: '#64788c', css: null },
    ])

    expect(result.key).toBe('first')
  })
})
