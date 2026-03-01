import {
  GREETING_TARGET_SELECTOR,
} from './types'

const STYLE_ID = 'gpk-theme-welcome-greeting-style'
const ROOT_FORCE_LIGHT_ATTR = 'data-gpk-welcome-greeting-force-light'

function ensureStyleElement(): HTMLStyleElement | null {
  if (typeof document === 'undefined' || !document.head) return null

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.textContent = `
:root[${ROOT_FORCE_LIGHT_ATTR}="true"] ${GREETING_TARGET_SELECTOR} {
  --gem-sys-color--on-surface: white !important;
  color: white !important;
}`
    document.head.appendChild(styleEl)
  }
  return styleEl
}

export function applyWelcomeGreetingForceLightStyle(): void {
  const styleEl = ensureStyleElement()
  if (!styleEl || typeof document === 'undefined') return
  document.documentElement.setAttribute(ROOT_FORCE_LIGHT_ATTR, 'true')
}

export function clearWelcomeGreetingStyle(): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  document.documentElement.removeAttribute(ROOT_FORCE_LIGHT_ATTR)
}

export function __clearWelcomeGreetingStyleControllerForTests(): void {
  clearWelcomeGreetingStyle()
  if (typeof document === 'undefined') return
  const styleEl = document.getElementById(STYLE_ID)
  styleEl?.remove()
}
