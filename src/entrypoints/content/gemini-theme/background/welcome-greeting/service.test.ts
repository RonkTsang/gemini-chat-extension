import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeAssetRow, ThemeBackgroundResolvedState, ThemeBackgroundSettings } from '../types'

const { mockEstimate } = vi.hoisted(() => ({
  mockEstimate: vi.fn(),
}))

vi.mock('./estimator', () => ({
  estimateWelcomeGreetingReadability: mockEstimate,
}))

import {
  applyWelcomeGreetingReadabilityFromState,
  resolveWelcomeGreetingReadabilitySettings,
  __resetWelcomeGreetingReadabilityServiceForTests,
} from './service'

function createSettings(
  overrides: Partial<ThemeBackgroundSettings> = {},
): ThemeBackgroundSettings {
  return {
    version: 3,
    backgroundImageEnabled: true,
    backgroundBlurPx: 5,
    messageGlassEnabled: false,
    sidebarScrimEnabled: true,
    sidebarScrimIntensity: 20,
    welcomeGreetingReadabilityMode: 'auto',
    welcomeGreetingResolved: 'default',
    welcomeGreetingResolvedAssetId: null,
    imageRef: { kind: 'asset', assetId: 'asset-1' },
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function createState(
  settings: ThemeBackgroundSettings,
): ThemeBackgroundResolvedState {
  return {
    settings,
    resolvedBackgroundUrl: 'blob:test',
    isBackgroundRenderable: true,
  }
}

function createAsset(overrides: Partial<ThemeAssetRow> = {}): ThemeAssetRow {
  return {
    id: 'asset-1',
    feature: 'background-image',
    mimeType: 'image/png',
    size: 128,
    blob: new Blob(['test'], { type: 'image/png' }),
    width: 1600,
    height: 900,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('welcome-greeting service', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
    mockEstimate.mockReset()
    mockEstimate.mockResolvedValue({
      resolved: 'force-light',
      luminance: 0.1,
      contrastWhite: 7,
      contrastDark: 4,
    })
  })

  afterEach(() => {
    __resetWelcomeGreetingReadabilityServiceForTests()
  })

  it('uses cached auto decision when asset id matches', async () => {
    const settings = createSettings({
      welcomeGreetingResolved: 'force-light',
      welcomeGreetingResolvedAssetId: 'asset-1',
    })

    const next = await resolveWelcomeGreetingReadabilitySettings({
      settings,
      asset: createAsset(),
    })

    expect(next.welcomeGreetingResolved).toBe('force-light')
    expect(mockEstimate).not.toHaveBeenCalled()
  })

  it('recomputes auto decision when asset id changes', async () => {
    const settings = createSettings({
      imageRef: { kind: 'asset', assetId: 'asset-2' },
      welcomeGreetingResolvedAssetId: 'asset-1',
      welcomeGreetingResolved: 'default',
    })

    const next = await resolveWelcomeGreetingReadabilitySettings({
      settings,
      asset: createAsset({ id: 'asset-2' }),
    })

    expect(next.welcomeGreetingResolved).toBe('force-light')
    expect(next.welcomeGreetingResolvedAssetId).toBe('asset-2')
    expect(mockEstimate).toHaveBeenCalledTimes(1)
  })

  it('does not apply force-light style in dark mode', async () => {
    document.body.classList.add('dark-theme')
    document.body.innerHTML = `
      <div class="top-section-container visible-primary-message"></div>
      <greeting><div class="greeting-title"></div></greeting>
    `

    const settings = createSettings({
      welcomeGreetingReadabilityMode: 'force-light',
    })

    applyWelcomeGreetingReadabilityFromState(createState(settings))
    await Promise.resolve()

    const target = document.querySelector(
      'div.top-section-container.visible-primary-message',
    ) as HTMLElement
    expect(target.getAttribute('data-gpk-welcome-greeting-force-light')).toBeNull()
  })

  it('applies force-light style in light mode on welcome page', async () => {
    document.body.classList.add('light-theme')
    document.body.innerHTML = `
      <div class="top-section-container visible-primary-message"></div>
      <greeting><div class="greeting-title"></div></greeting>
    `

    const settings = createSettings({
      welcomeGreetingReadabilityMode: 'force-light',
    })

    applyWelcomeGreetingReadabilityFromState(createState(settings))
    await Promise.resolve()

    const target = document.querySelector(
      'div.top-section-container.visible-primary-message',
    ) as HTMLElement
    expect(target.getAttribute('data-gpk-welcome-greeting-force-light')).toBe('true')
  })
})
