import type {
  ThemeAssetRow,
  ThemeBackgroundResolvedState,
  ThemeBackgroundSettings,
} from '../types'
import { estimateWelcomeGreetingReadability } from './estimator'
import { getWelcomeGreetingRect, hasGreetingTitleElement } from './rect'
import {
  __clearWelcomeGreetingStyleControllerForTests,
  applyWelcomeGreetingForceLightStyle,
  clearWelcomeGreetingStyle,
  hasWelcomeGreetingTargetElement,
  hasWelcomeGreetingTitleElementInDom,
} from './styleController'
import type { WelcomeGreetingReadabilityMode, WelcomeGreetingResolved } from './types'

interface ResolveWelcomeGreetingOptions {
  settings: ThemeBackgroundSettings
  asset: ThemeAssetRow | null
  forceRecompute?: boolean
}

let activeState: ThemeBackgroundResolvedState | null = null
let domObserver: MutationObserver | null = null
let bodyThemeObserver: MutationObserver | null = null
let isReconcileQueued = false

function shouldForceLightByMode(
  mode: WelcomeGreetingReadabilityMode,
  resolved: WelcomeGreetingResolved,
): boolean {
  if (mode === 'force-light') return true
  if (mode === 'default') return false
  return resolved === 'force-light'
}

function isDarkThemeActive(): boolean {
  if (typeof document === 'undefined') return false
  if (document.body?.classList.contains('dark-theme')) return true
  return Boolean(document.querySelector(':where(.theme-host):where(.dark-theme)'))
}

function isWelcomeLikePage(): boolean {
  return (
    hasGreetingTitleElement()
    || hasWelcomeGreetingTitleElementInDom()
    || hasWelcomeGreetingTargetElement()
  )
}

function reconcileWelcomeGreetingStyle(): void {
  if (!activeState) {
    clearWelcomeGreetingStyle()
    return
  }

  if (
    !activeState.isBackgroundRenderable
    || !isWelcomeLikePage()
    || isDarkThemeActive()
  ) {
    clearWelcomeGreetingStyle()
    return
  }

  const shouldForceLight = shouldForceLightByMode(
    activeState.settings.welcomeGreetingReadabilityMode,
    activeState.settings.welcomeGreetingResolved,
  )

  if (shouldForceLight) {
    applyWelcomeGreetingForceLightStyle()
  } else {
    clearWelcomeGreetingStyle()
  }
}

function queueReconcile(): void {
  if (isReconcileQueued) return
  isReconcileQueued = true
  queueMicrotask(() => {
    isReconcileQueued = false
    reconcileWelcomeGreetingStyle()
  })
}

function ensureObservers(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return
  }

  if (!domObserver && document.body) {
    domObserver = new MutationObserver(() => {
      queueReconcile()
    })
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  if (!bodyThemeObserver && document.body) {
    bodyThemeObserver = new MutationObserver(() => {
      queueReconcile()
    })
    bodyThemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
}

export async function resolveWelcomeGreetingReadabilitySettings(
  options: ResolveWelcomeGreetingOptions,
): Promise<ThemeBackgroundSettings> {
  const { settings, asset, forceRecompute = false } = options

  if (
    !settings.backgroundImageEnabled
    || settings.imageRef.kind !== 'asset'
  ) {
    return {
      ...settings,
      welcomeGreetingResolved: 'default',
      welcomeGreetingResolvedAssetId: null,
    }
  }

  const currentAssetId = settings.imageRef.assetId
  if (settings.welcomeGreetingReadabilityMode !== 'auto') {
    return settings
  }

  if (!asset) {
    return {
      ...settings,
      welcomeGreetingResolved: 'default',
      welcomeGreetingResolvedAssetId: currentAssetId,
    }
  }

  const isCacheHit
    = settings.welcomeGreetingResolvedAssetId === currentAssetId
      && (
        settings.welcomeGreetingResolved === 'default'
        || settings.welcomeGreetingResolved === 'force-light'
      )

  if (!forceRecompute && isCacheHit) {
    return settings
  }

  try {
    const rect = getWelcomeGreetingRect()
    const estimation = await estimateWelcomeGreetingReadability({
      imageBlob: asset.blob,
      imageWidth: asset.width,
      imageHeight: asset.height,
      viewportWidth: typeof window === 'undefined' ? 1366 : window.innerWidth,
      viewportHeight: typeof window === 'undefined' ? 768 : window.innerHeight,
      targetRect: rect,
    })

    return {
      ...settings,
      welcomeGreetingResolved: estimation.resolved,
      welcomeGreetingResolvedAssetId: currentAssetId,
    }
  } catch (error) {
    console.warn('[ThemeBackground] Failed to estimate welcome greeting readability:', error)
    return {
      ...settings,
      welcomeGreetingResolved: 'default',
      welcomeGreetingResolvedAssetId: currentAssetId,
    }
  }
}

export function applyWelcomeGreetingReadabilityFromState(
  state: ThemeBackgroundResolvedState,
): void {
  activeState = state
  ensureObservers()
  queueReconcile()
}

export function clearWelcomeGreetingReadabilityStyle(): void {
  clearWelcomeGreetingStyle()
}

export function __resetWelcomeGreetingReadabilityServiceForTests(): void {
  activeState = null
  isReconcileQueued = false
  domObserver?.disconnect()
  bodyThemeObserver?.disconnect()
  domObserver = null
  bodyThemeObserver = null
  __clearWelcomeGreetingStyleControllerForTests()
}
