export const THEME_BLOOM_REVEAL_DURATION_MS = 500
export const THEME_BLOOM_DURATION_MS = THEME_BLOOM_REVEAL_DURATION_MS

export interface ThemeBloomOrigin {
  clientX: number
  clientY: number
}

export interface ThemeBloomTransitionOptions {
  origin: ThemeBloomOrigin
  apply: () => void
  document?: Document
  prefersReducedMotion?: boolean
}

export interface ThemeBloomTransition {
  finished: Promise<void>
  cancel: () => void
  usesViewTransition: boolean
  reducedMotion: boolean
}

interface ViewTransitionLike {
  ready: Promise<unknown>
  finished: Promise<unknown>
  skipTransition?: () => void
}

interface ViewTransitionDocument {
  startViewTransition?: (callback: () => void) => ViewTransitionLike
}

function createThemeBloomAbortError(): DOMException {
  return new DOMException('Theme Bloom preparation was cancelled', 'AbortError')
}

function throwIfThemeBloomAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createThemeBloomAbortError()
}

async function waitForThemeBloomPrimerReadiness(
  documentRef: Document,
  signal?: AbortSignal,
): Promise<void> {
  throwIfThemeBloomAborted(signal)

  if (documentRef.visibilityState === 'hidden') {
    await new Promise<void>((resolve, reject) => {
      const handleVisibilityChange = () => {
        if (documentRef.visibilityState === 'hidden') return
        cleanup()
        resolve()
      }
      const handleAbort = () => {
        cleanup()
        reject(createThemeBloomAbortError())
      }
      const cleanup = () => {
        documentRef.removeEventListener('visibilitychange', handleVisibilityChange)
        signal?.removeEventListener('abort', handleAbort)
      }
      documentRef.addEventListener('visibilitychange', handleVisibilityChange)
      signal?.addEventListener('abort', handleAbort, { once: true })
      if (signal?.aborted) handleAbort()
    })
  }

  const windowRef = documentRef.defaultView
  if (!windowRef || typeof windowRef.requestAnimationFrame !== 'function') return

  for (let frame = 0; frame < 2; frame += 1) {
    await new Promise<void>((resolve, reject) => {
      let animationFrameId = 0
      const handleAbort = () => {
        windowRef.cancelAnimationFrame(animationFrameId)
        signal?.removeEventListener('abort', handleAbort)
        reject(createThemeBloomAbortError())
      }
      animationFrameId = windowRef.requestAnimationFrame(() => {
        signal?.removeEventListener('abort', handleAbort)
        resolve()
      })
      signal?.addEventListener('abort', handleAbort, { once: true })
      if (signal?.aborted) handleAbort()
    })
  }

  throwIfThemeBloomAborted(signal)
}

const STYLE_ID = 'gpk-theme-bloom-transition-style'
const PRIMER_STYLE_ID = 'gpk-theme-bloom-transition-primer-style'
const PRIMER_DURATION_MS = 34
const DEV_FORCE_DOM_FALLBACK_QUERY_PARAM = 'gpk-force-theme-bloom-dom-fallback'
const FALLBACK_ATTR = 'data-gpk-theme-bloom-fallback'
const TRANSITION_COORDINATE_PROPERTIES = [
  '--gpk-theme-bloom-x',
  '--gpk-theme-bloom-y',
  '--gpk-theme-bloom-radius',
] as const
const FALLBACK_COORDINATE_PROPERTIES = [
  '--gpk-theme-bloom-fallback-x',
  '--gpk-theme-bloom-fallback-y',
  '--gpk-theme-bloom-fallback-radius',
] as const
const REVEAL_RADIUS_STOPS = [
  { offset: 0, progress: 0 },
  { offset: 0.08, progress: 0.18 },
  { offset: 0.18, progress: 0.34 },
  { offset: 0.34, progress: 0.54 },
  { offset: 0.52, progress: 0.72 },
  { offset: 0.72, progress: 0.87 },
  { offset: 0.88, progress: 0.96 },
  { offset: 1, progress: 1 },
] as const

function readPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function shouldForceThemeBloomDomFallback(documentRef: Document): boolean {
  return import.meta.env.DEV
    && documentRef.defaultView?.location.search.includes(
      DEV_FORCE_DOM_FALLBACK_QUERY_PARAM,
    ) === true
}

export function getThemeBloomRevealRadius(
  origin: ThemeBloomOrigin,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): number {
  return Math.max(
    Math.hypot(origin.clientX, origin.clientY),
    Math.hypot(viewportWidth - origin.clientX, origin.clientY),
    Math.hypot(origin.clientX, viewportHeight - origin.clientY),
    Math.hypot(viewportWidth - origin.clientX, viewportHeight - origin.clientY),
  )
}

function ensureTransitionStyle(
  documentRef: Document,
): HTMLStyleElement {
  documentRef.getElementById(STYLE_ID)?.remove()
  const style = documentRef.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    ::view-transition-old(root) {
      animation: none !important;
      mix-blend-mode: normal;
    }

    ::view-transition-new(root) {
      animation: none !important;
      clip-path: circle(0 at var(--gpk-theme-bloom-x) var(--gpk-theme-bloom-y));
      mix-blend-mode: normal;
    }

    ::view-transition-group(root),
    ::view-transition-image-pair(root) {
      animation: none !important;
    }

    :root[${FALLBACK_ATTR}="true"] #gpk-theme-bg-layer {
      animation: gpk-theme-bloom-fallback ${THEME_BLOOM_REVEAL_DURATION_MS}ms cubic-bezier(.2, .8, .2, 1) both;
    }

    @keyframes gpk-theme-bloom-fallback {
      from { opacity: 0; clip-path: circle(0 at var(--gpk-theme-bloom-fallback-x) var(--gpk-theme-bloom-fallback-y)); }
      to { opacity: 1; clip-path: circle(var(--gpk-theme-bloom-fallback-radius) at var(--gpk-theme-bloom-fallback-x) var(--gpk-theme-bloom-fallback-y)); }
    }
  `
  documentRef.head.append(style)
  return style
}

export function getThemeBloomFallbackRevealCoordinates(
  origin: ThemeBloomOrigin,
  radius: number,
  layerWidth: number,
  layerHeight: number,
  scaleX: number,
  scaleY: number,
): { clientX: number; clientY: number; radius: number } {
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1
  const centerX = layerWidth / 2
  const centerY = layerHeight / 2

  return {
    clientX: centerX + (origin.clientX - centerX) / safeScaleX,
    clientY: centerY + (origin.clientY - centerY) / safeScaleY,
    radius: radius / Math.min(safeScaleX, safeScaleY),
  }
}

function getThemeBloomBackgroundLayerScale(documentRef: Document): {
  width: number
  height: number
  scaleX: number
  scaleY: number
} {
  const layer = documentRef.getElementById('gpk-theme-bg-layer')
  const viewportWidth = documentRef.defaultView?.innerWidth ?? 0
  const viewportHeight = documentRef.defaultView?.innerHeight ?? 0
  if (!(layer instanceof HTMLElement)) {
    return {
      width: viewportWidth,
      height: viewportHeight,
      scaleX: 1,
      scaleY: 1,
    }
  }

  const width = layer.offsetWidth || viewportWidth
  const height = layer.offsetHeight || viewportHeight
  const rect = layer.getBoundingClientRect()
  return {
    width,
    height,
    scaleX: width > 0 && rect.width > 0 ? rect.width / width : 1,
    scaleY: height > 0 && rect.height > 0 ? rect.height / height : 1,
  }
}

function setThemeBloomFallbackCoordinates(
  documentRef: Document,
  coordinates: { clientX: number; clientY: number; radius: number },
): () => void {
  const root = documentRef.documentElement
  const values = [
    `${coordinates.clientX}px`,
    `${coordinates.clientY}px`,
    `${coordinates.radius}px`,
  ]
  const previousValues = FALLBACK_COORDINATE_PROPERTIES.map((property, index) => ({
    property,
    value: root.style.getPropertyValue(property),
    priority: root.style.getPropertyPriority(property),
    nextValue: values[index],
  }))
  for (const { property, nextValue } of previousValues) {
    root.style.setProperty(property, nextValue)
  }

  return () => {
    for (const { property, value, priority } of previousValues) {
      if (value) {
        root.style.setProperty(property, value, priority)
      } else {
        root.style.removeProperty(property)
      }
    }
  }
}

function setTransitionCoordinates(
  documentRef: Document,
  origin: ThemeBloomOrigin,
  radius: number,
): () => void {
  const root = documentRef.documentElement
  const previousValues = TRANSITION_COORDINATE_PROPERTIES.map((property) => ({
    property,
    value: root.style.getPropertyValue(property),
    priority: root.style.getPropertyPriority(property),
  }))
  root.style.setProperty('--gpk-theme-bloom-x', `${origin.clientX}px`)
  root.style.setProperty('--gpk-theme-bloom-y', `${origin.clientY}px`)
  root.style.setProperty('--gpk-theme-bloom-radius', `${radius}px`)

  // Commit the first-use coordinates before View Transition captures root.
  documentRef.defaultView?.getComputedStyle(root)
    .getPropertyValue('--gpk-theme-bloom-x')

  return () => {
    for (const { property, value, priority } of previousValues) {
      if (value) {
        root.style.setProperty(property, value, priority)
      } else {
        root.style.removeProperty(property)
      }
    }
  }
}

function createRevealKeyframes(
  origin: ThemeBloomOrigin,
  radius: number,
): Keyframe[] {
  return REVEAL_RADIUS_STOPS.map(({ offset, progress }) => ({
    clipPath: `circle(${radius * progress}px at ${origin.clientX}px ${origin.clientY}px)`,
    offset,
  }))
}

export async function primeThemeBloomViewTransition(
  documentRef: Document = document,
  signal?: AbortSignal,
): Promise<void> {
  const viewTransitionDocument = documentRef as unknown as ViewTransitionDocument
  if (typeof viewTransitionDocument.startViewTransition !== 'function') return
  if (documentRef.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  try {
    await waitForThemeBloomPrimerReadiness(documentRef, signal)
  } catch {
    return
  }

  documentRef.getElementById(PRIMER_STYLE_ID)?.remove()
  const origin = {
    clientX: (documentRef.defaultView?.innerWidth ?? 0) / 2,
    clientY: (documentRef.defaultView?.innerHeight ?? 0) / 2,
  }
  const radius = Math.ceil(getThemeBloomRevealRadius(
    origin,
    documentRef.defaultView?.innerWidth ?? 0,
    documentRef.defaultView?.innerHeight ?? 0,
  )) + 2
  const style = documentRef.createElement('style')
  style.id = PRIMER_STYLE_ID
  style.textContent = `
    ::view-transition-old(root),
    ::view-transition-new(root),
    ::view-transition-group(root),
    ::view-transition-image-pair(root) {
      animation: none !important;
    }

    ::view-transition-old(root),
    ::view-transition-new(root) {
      mix-blend-mode: normal;
    }

    ::view-transition-new(root) {
      clip-path: circle(0 at ${origin.clientX}px ${origin.clientY}px);
    }
  `
  documentRef.head.append(style)

  let viewTransition: ViewTransitionLike | null = null
  let animation: Animation | null = null
  const cancelPrimer = () => {
    animation?.cancel()
    viewTransition?.skipTransition?.()
  }
  signal?.addEventListener('abort', cancelPrimer, { once: true })

  try {
    throwIfThemeBloomAborted(signal)
    viewTransition = viewTransitionDocument.startViewTransition(() => undefined)
    await viewTransition.ready
    throwIfThemeBloomAborted(signal)
    animation = documentRef.documentElement.animate(
      createRevealKeyframes(origin, radius),
      {
        duration: PRIMER_DURATION_MS,
        easing: 'linear',
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      },
    )
    await animation.finished
    await viewTransition.finished
    throwIfThemeBloomAborted(signal)
  } catch (error) {
  } finally {
    signal?.removeEventListener('abort', cancelPrimer)
    style.remove()
  }
}

export function startThemeBloomTransition(
  options: ThemeBloomTransitionOptions,
): ThemeBloomTransition {
  const documentRef = options.document ?? document
  const reducedMotion = options.prefersReducedMotion ?? readPrefersReducedMotion()
  const forceDomFallback = shouldForceThemeBloomDomFallback(documentRef)
  const radius = Math.ceil(getThemeBloomRevealRadius(
    options.origin,
    documentRef.defaultView?.innerWidth ?? 0,
    documentRef.defaultView?.innerHeight ?? 0,
  )) + 2
  const style = ensureTransitionStyle(documentRef)
  const restoreTransitionCoordinates = setTransitionCoordinates(
    documentRef,
    options.origin,
    radius,
  )
  let cleaned = false
  let revealAnimation: Animation | null = null
  let activeViewTransition: ViewTransitionLike | null = null
  let restoreFallbackCoordinates: () => void = () => undefined
  let resolveFinished: () => void = () => undefined
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    documentRef.documentElement.removeAttribute(FALLBACK_ATTR)
    style.remove()
    restoreFallbackCoordinates()
    restoreTransitionCoordinates()
    resolveFinished()
  }
  const cancel = () => {
    revealAnimation?.cancel()
    activeViewTransition?.skipTransition?.()
    cleanup()
  }

  if (reducedMotion) {
    options.apply()
    window.setTimeout(cleanup, 120)
    return {
      finished,
      cancel,
      usesViewTransition: false,
      reducedMotion: true,
    }
  }

  const viewTransitionDocument = documentRef as unknown as ViewTransitionDocument
  if (!forceDomFallback && typeof viewTransitionDocument.startViewTransition === 'function') {
    try {
      const viewTransition = viewTransitionDocument.startViewTransition(options.apply)
      activeViewTransition = viewTransition
      void Promise.resolve(viewTransition.ready)
        .then(async () => {
          if (cleaned) {
            viewTransition.skipTransition?.()
            return
          }

          const keyframes = createRevealKeyframes(options.origin, radius)
          const activeRevealAnimation = documentRef.documentElement.animate(
            keyframes,
            {
              duration: THEME_BLOOM_REVEAL_DURATION_MS,
              easing: 'linear',
              fill: 'both',
              pseudoElement: '::view-transition-new(root)',
            },
          )
          revealAnimation = activeRevealAnimation
          await activeRevealAnimation.finished
          await viewTransition.finished
        })
        .catch(() => {
          if (cleaned) return
          viewTransition.skipTransition?.()
        })
        .finally(cleanup)
      return {
        finished,
        cancel,
        usesViewTransition: true,
        reducedMotion: false,
      }
    } catch {
      // Fall through to the DOM background-fade fallback below.
    }
  }

  options.apply()
  const layerScale = getThemeBloomBackgroundLayerScale(documentRef)
  const fallbackCoordinates = getThemeBloomFallbackRevealCoordinates(
    options.origin,
    radius,
    layerScale.width,
    layerScale.height,
    layerScale.scaleX,
    layerScale.scaleY,
  )
  restoreFallbackCoordinates = setThemeBloomFallbackCoordinates(
    documentRef,
    fallbackCoordinates,
  )
  documentRef.documentElement.setAttribute(FALLBACK_ATTR, 'true')
  window.setTimeout(cleanup, THEME_BLOOM_DURATION_MS)
  return {
    finished,
    cancel,
    usesViewTransition: false,
    reducedMotion: false,
  }
}
