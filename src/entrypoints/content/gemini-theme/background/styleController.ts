import type { ThemeBackgroundResolvedState } from './types'
import { resolveMessageGlassSurfaces } from './messageGlassVisibility'
import backgroundStyleCss from './style.css?raw'

const STYLE_ID = 'gemini-extension-theme-background-override'
const BACKGROUND_LAYER_ID = 'gpk-theme-bg-layer'
const ROOT_BG_ENABLED_ATTR = 'data-gpk-bg-enabled'
const ROOT_MSG_GLASS_ATTR = 'data-gpk-msg-glass'
const ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_ATTR
  = 'data-gpk-msg-glass-transparency-customized'
const ROOT_MSG_GLASS_BLUR_CUSTOMIZED_ATTR
  = 'data-gpk-msg-glass-blur-customized'
const ROOT_SIDEBAR_SCRIM_ENABLED_ATTR = 'data-gpk-sidebar-scrim-enabled'
const ROOT_FIREFOX_ATTR = 'data-gpk-firefox'
const ROOT_BG_IMAGE_VAR = '--gpk-bg-image'
const ROOT_BG_BLUR_VAR = '--gpk-bg-blur'
const ROOT_MSG_GLASS_TRANSPARENCY_VAR = '--gpk-msg-glass-transparency'
const ROOT_MSG_GLASS_USER_DARK_SURFACE_LEGACY_MIX_VAR
  = '--gpk-msg-glass-user-dark-surface-legacy-mix'
const ROOT_MSG_GLASS_USER_LIGHT_TRANSPARENCY_VAR
  = '--gpk-msg-glass-user-light-transparency'
const ROOT_MSG_GLASS_USER_DARK_TRANSPARENCY_VAR
  = '--gpk-msg-glass-user-dark-transparency'
const ROOT_MSG_GLASS_MODEL_DARK_SURFACE_LEGACY_MIX_VAR
  = '--gpk-msg-glass-model-dark-surface-legacy-mix'
const ROOT_MSG_GLASS_MODEL_LIGHT_TRANSPARENCY_VAR
  = '--gpk-msg-glass-model-light-transparency'
const ROOT_MSG_GLASS_MODEL_DARK_TRANSPARENCY_VAR
  = '--gpk-msg-glass-model-dark-transparency'
const ROOT_MSG_GLASS_DUAL_DARK_SURFACE_LEGACY_MIX_VAR
  = '--gpk-msg-glass-dual-dark-surface-legacy-mix'
const ROOT_MSG_GLASS_DUAL_LIGHT_TRANSPARENCY_VAR
  = '--gpk-msg-glass-dual-light-transparency'
const ROOT_MSG_GLASS_DUAL_DARK_TRANSPARENCY_VAR
  = '--gpk-msg-glass-dual-dark-transparency'
const ROOT_MSG_GLASS_BLUR_VAR = '--gpk-msg-glass-blur'
const ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_VAR
  = '--gpk-msg-glass-transparency-customized'
const ROOT_MSG_GLASS_BLUR_CUSTOMIZED_VAR
  = '--gpk-msg-glass-blur-customized'
const ROOT_SIDEBAR_SCRIM_ALPHA_VAR = '--gpk-sidebar-scrim-alpha'
const ROOT_CHAT_TEXT_LIGHT_COLOR_VAR = '--gpk-chat-text-light-color'
const ROOT_CHAT_TEXT_DARK_COLOR_VAR = '--gpk-chat-text-dark-color'

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

function syncOptionalColorVar(
  root: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value) {
    root.style.setProperty(name, value)
    return
  }

  root.style.removeProperty(name)
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
  root.removeAttribute(ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_ATTR)
  root.setAttribute(
    ROOT_MSG_GLASS_BLUR_CUSTOMIZED_ATTR,
    state.settings.messageGlassBlurCustomized ? 'true' : 'false',
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
  const surfaces = resolveMessageGlassSurfaces(
    state.settings.messageGlassBackgroundVisibility,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_USER_DARK_SURFACE_LEGACY_MIX_VAR,
    `${surfaces.userDark.legacySurfaceMixPercentage}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_USER_LIGHT_TRANSPARENCY_VAR,
    `${surfaces.userLight.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_USER_DARK_TRANSPARENCY_VAR,
    `${surfaces.userDark.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_MODEL_DARK_SURFACE_LEGACY_MIX_VAR,
    `${surfaces.modelDark.legacySurfaceMixPercentage}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_MODEL_LIGHT_TRANSPARENCY_VAR,
    `${surfaces.modelLight.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_MODEL_DARK_TRANSPARENCY_VAR,
    `${surfaces.modelDark.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_DUAL_DARK_SURFACE_LEGACY_MIX_VAR,
    `${surfaces.dualDark.legacySurfaceMixPercentage}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_DUAL_LIGHT_TRANSPARENCY_VAR,
    `${surfaces.dualLight.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_DUAL_DARK_TRANSPARENCY_VAR,
    `${surfaces.dualDark.transparency}%`,
  )
  root.style.setProperty(
    ROOT_MSG_GLASS_BLUR_VAR,
    `${state.settings.messageGlassBlurPx}px`,
  )
  root.style.removeProperty(ROOT_MSG_GLASS_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_VAR)
  root.style.setProperty(
    ROOT_MSG_GLASS_BLUR_CUSTOMIZED_VAR,
    state.settings.messageGlassBlurCustomized ? '1' : '0',
  )
  root.style.setProperty(
    ROOT_SIDEBAR_SCRIM_ALPHA_VAR,
    (state.settings.sidebarScrimIntensity / 100).toFixed(2),
  )
  syncOptionalColorVar(
    root,
    ROOT_CHAT_TEXT_LIGHT_COLOR_VAR,
    state.settings.chatTextLightColor,
  )
  syncOptionalColorVar(
    root,
    ROOT_CHAT_TEXT_DARK_COLOR_VAR,
    state.settings.chatTextDarkColor,
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
  root.removeAttribute(ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_ATTR)
  root.removeAttribute(ROOT_MSG_GLASS_BLUR_CUSTOMIZED_ATTR)
  root.removeAttribute(ROOT_SIDEBAR_SCRIM_ENABLED_ATTR)
  root.removeAttribute(ROOT_FIREFOX_ATTR)
  root.style.removeProperty(ROOT_BG_IMAGE_VAR)
  root.style.removeProperty(ROOT_BG_BLUR_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_USER_DARK_SURFACE_LEGACY_MIX_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_USER_LIGHT_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_USER_DARK_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_MODEL_DARK_SURFACE_LEGACY_MIX_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_MODEL_LIGHT_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_MODEL_DARK_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_DUAL_DARK_SURFACE_LEGACY_MIX_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_DUAL_LIGHT_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_DUAL_DARK_TRANSPARENCY_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_BLUR_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_TRANSPARENCY_CUSTOMIZED_VAR)
  root.style.removeProperty(ROOT_MSG_GLASS_BLUR_CUSTOMIZED_VAR)
  root.style.removeProperty(ROOT_SIDEBAR_SCRIM_ALPHA_VAR)
  root.style.removeProperty(ROOT_CHAT_TEXT_LIGHT_COLOR_VAR)
  root.style.removeProperty(ROOT_CHAT_TEXT_DARK_COLOR_VAR)

  const styleEl = document.getElementById(STYLE_ID)
  styleEl?.remove()

  const backgroundLayer = document.getElementById(BACKGROUND_LAYER_ID)
  backgroundLayer?.remove()
}
