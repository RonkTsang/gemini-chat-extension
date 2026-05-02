import type { ThemeBackgroundResolvedState } from './types'
import backgroundStyleCss from './style.css?raw'

const STYLE_ID = 'gemini-extension-theme-background-override'
const BACKGROUND_LAYER_ID = 'gpk-theme-bg-layer'
const ROOT_BG_ENABLED_ATTR = 'data-gpk-bg-enabled'
const ROOT_MSG_GLASS_ATTR = 'data-gpk-msg-glass'
const ROOT_SIDEBAR_SCRIM_ENABLED_ATTR = 'data-gpk-sidebar-scrim-enabled'
const ROOT_FIREFOX_ATTR = 'data-gpk-firefox'
const ROOT_BG_IMAGE_VAR = '--gpk-bg-image'
const ROOT_BG_BLUR_VAR = '--gpk-bg-blur'
const ROOT_SIDEBAR_SCRIM_ALPHA_VAR = '--gpk-sidebar-scrim-alpha'

function ensureStyleElement(): HTMLStyleElement | null {
  if (typeof document === 'undefined' || !document.head) return null

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = backgroundStyleCss
    document.head.appendChild(el)
  }
  return el
}

function toCssImageValue(url: string | null): string {
  if (!url) return 'none'
  const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `url("${escaped}")`
}

function ensureBackgroundLayerElement(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null

  let layer = document.getElementById(BACKGROUND_LAYER_ID) as HTMLDivElement | null
  if (!layer) {
    layer = document.createElement('div')
    layer.id = BACKGROUND_LAYER_ID
    layer.setAttribute('aria-hidden', 'true')
    document.body.prepend(layer)
  }
  return layer
}

export function applyThemeBackgroundStyle(
  state: ThemeBackgroundResolvedState,
): void {
  const styleEl = ensureStyleElement()
  if (!styleEl || typeof document === 'undefined') return

  const root = document.documentElement
  root.setAttribute(
    ROOT_BG_ENABLED_ATTR,
    state.isBackgroundRenderable ? 'true' : 'false',
  )
  if (import.meta.env.FIREFOX) {
    root.setAttribute(ROOT_FIREFOX_ATTR, 'true')
  } else {
    root.removeAttribute(ROOT_FIREFOX_ATTR)
  }
  root.setAttribute(
    ROOT_MSG_GLASS_ATTR,
    state.settings.messageGlassEnabled ? 'true' : 'false',
  )
  root.setAttribute(
    ROOT_SIDEBAR_SCRIM_ENABLED_ATTR,
    state.settings.sidebarScrimEnabled ? 'true' : 'false',
  )
  root.style.setProperty(
    ROOT_BG_IMAGE_VAR,
    toCssImageValue(state.resolvedBackgroundUrl),
  )
  root.style.setProperty(
    ROOT_BG_BLUR_VAR,
    `${state.settings.backgroundBlurPx}px`,
  )
  root.style.setProperty(
    ROOT_SIDEBAR_SCRIM_ALPHA_VAR,
    (state.settings.sidebarScrimIntensity / 100).toFixed(2),
  )

  const backgroundLayer = ensureBackgroundLayerElement()
  if (!backgroundLayer) return

  backgroundLayer.style.display = state.isBackgroundRenderable ? 'block' : 'none'
  backgroundLayer.style.backgroundImage = toCssImageValue(state.resolvedBackgroundUrl)
}

export function clearThemeBackgroundStyle(): void {
  if (typeof document === 'undefined' || !document.documentElement) return

  const root = document.documentElement
  root.removeAttribute(ROOT_BG_ENABLED_ATTR)
  root.removeAttribute(ROOT_MSG_GLASS_ATTR)
  root.removeAttribute(ROOT_SIDEBAR_SCRIM_ENABLED_ATTR)
  root.removeAttribute(ROOT_FIREFOX_ATTR)
  root.style.removeProperty(ROOT_BG_IMAGE_VAR)
  root.style.removeProperty(ROOT_BG_BLUR_VAR)
  root.style.removeProperty(ROOT_SIDEBAR_SCRIM_ALPHA_VAR)

  const styleEl = document.getElementById(STYLE_ID)
  styleEl?.remove()

  const backgroundLayer = document.getElementById(BACKGROUND_LAYER_ID)
  backgroundLayer?.remove()
}
