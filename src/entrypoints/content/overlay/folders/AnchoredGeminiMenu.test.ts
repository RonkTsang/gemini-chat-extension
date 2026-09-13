import { describe, expect, it } from 'vitest'

import { calculateAnchoredMenuPosition } from './AnchoredGeminiMenu'

describe('calculateAnchoredMenuPosition', () => {
  it('places a menu to the right of its anchor when it fits', () => {
    expect(calculateAnchoredMenuPosition(
      { top: 40, right: 120, bottom: 64, left: 96 },
      { width: 180, height: 88 },
      { width: 800, height: 600 },
    )).toEqual({ left: 124, top: 40 })
  })

  it('flips left and shifts upward to stay inside the viewport', () => {
    expect(calculateAnchoredMenuPosition(
      { top: 560, right: 780, bottom: 584, left: 756 },
      { width: 180, height: 88 },
      { width: 800, height: 600 },
    )).toEqual({ left: 572, top: 504 })
  })

  it('clamps oversized menus to the viewport gutter', () => {
    expect(calculateAnchoredMenuPosition(
      { top: 0, right: 24, bottom: 24, left: 0 },
      { width: 400, height: 700 },
      { width: 320, height: 600 },
    )).toEqual({ left: 8, top: 8 })
  })

  it('matches Gemini bottom-start menus and flips above near the viewport edge', () => {
    expect(calculateAnchoredMenuPosition(
      { top: 608, right: 268, bottom: 632, left: 244 },
      { width: 180, height: 232 },
      { width: 1176, height: 904 },
      'bottom-start',
    )).toEqual({ left: 244, top: 632 })

    expect(calculateAnchoredMenuPosition(
      { top: 560, right: 780, bottom: 584, left: 756 },
      { width: 180, height: 88 },
      { width: 800, height: 600 },
      'bottom-start',
    )).toEqual({ left: 612, top: 472 })
  })
})
