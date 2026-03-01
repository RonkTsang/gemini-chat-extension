import {
  GREETING_TARGET_SELECTOR,
  GREETING_TITLE_SELECTOR,
} from './types'

const STYLE_ID = 'gpk-theme-welcome-greeting-style'
const FORCE_LIGHT_ATTR = 'data-gpk-welcome-greeting-force-light'

function ensureStyleElement(): HTMLStyleElement | null {
  if (typeof document === 'undefined' || !document.head) return null

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.textContent = `
${GREETING_TARGET_SELECTOR}[${FORCE_LIGHT_ATTR}="true"] {
  --gem-sys-color--on-surface: white !important;
  color: white !important;
}`
    document.head.appendChild(styleEl)
  }
  return styleEl
}

export function hasWelcomeGreetingTargetElement(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector(GREETING_TARGET_SELECTOR))
}

export function hasWelcomeGreetingTitleElementInDom(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector(GREETING_TITLE_SELECTOR))
}

export function applyWelcomeGreetingForceLightStyle(): void {
  const styleEl = ensureStyleElement()
  if (!styleEl || typeof document === 'undefined') return

  const target = document.querySelector(GREETING_TARGET_SELECTOR) as HTMLElement | null
  if (!target) return
  target.setAttribute(FORCE_LIGHT_ATTR, 'true')
}

export function clearWelcomeGreetingStyle(): void {
  if (typeof document === 'undefined') return

  document.querySelectorAll(`${GREETING_TARGET_SELECTOR}[${FORCE_LIGHT_ATTR}="true"]`)
    .forEach((element) => {
      element.removeAttribute(FORCE_LIGHT_ATTR)
    })
}

export function __clearWelcomeGreetingStyleControllerForTests(): void {
  clearWelcomeGreetingStyle()
  if (typeof document === 'undefined') return
  const styleEl = document.getElementById(STYLE_ID)
  styleEl?.remove()
}
