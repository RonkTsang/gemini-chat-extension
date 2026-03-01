import { describe, expect, it } from 'vitest'
import {
  decideWelcomeGreetingResolved,
  mapViewportRectToSourceRect,
} from './estimator'

describe('welcome-greeting estimator', () => {
  it('maps viewport rect to source rect under cover scaling', () => {
    const sourceRect = mapViewportRectToSourceRect({
      targetRect: {
        left: 200,
        top: 160,
        width: 320,
        height: 80,
      },
      viewportWidth: 1200,
      viewportHeight: 800,
      imageWidth: 1000,
      imageHeight: 1000,
    })

    expect(sourceRect.left).toBeCloseTo(166.67, 2)
    expect(sourceRect.top).toBeCloseTo(300, 3)
    expect(sourceRect.width).toBeCloseTo(266.67, 2)
    expect(sourceRect.height).toBeCloseTo(66.67, 2)
  })

  it('keeps default text when background is bright', () => {
    const result = decideWelcomeGreetingResolved({
      luminance: 0.85,
    })

    expect(result.resolved).toBe('default')
    expect(result.contrastDark).toBeGreaterThan(result.contrastWhite)
  })

  it('switches to force-light when background is dark with clear advantage', () => {
    const result = decideWelcomeGreetingResolved({
      luminance: 0.06,
    })

    expect(result.resolved).toBe('force-light')
    expect(result.contrastWhite).toBeGreaterThan(result.contrastDark)
    expect(result.contrastWhite - result.contrastDark).toBeGreaterThanOrEqual(0.4)
  })
})
