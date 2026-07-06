import { eventBus } from '@/utils/eventbus'
import tippy, { type Instance } from 'tippy.js'
import { shouldShowBadge, dismissBadge } from './badge'

const DESKTOP_POWER_KIT_HOST_TEST_ID = 'gemini-power-kit-button'
const DESKTOP_SETTINGS_HOST_TEST_ID = 'settings-and-help-button'
const DESKTOP_MAVATAR_SETTINGS_BUTTON_TEST_ID = 'mavatar-footer-settings-button'
const DESKTOP_MAVATAR_POWER_KIT_CONTAINER_TEST_ID = 'gemini-power-kit-mavatar-container'
const MOBILE_POWER_KIT_BUTTON_TEST_ID = 'mobile-gemini-power-kit-control'
const MOBILE_SETTINGS_BUTTON_TEST_ID = 'mobile-settings-and-help-control'

const POWER_KIT_LABEL = 'Gemini Power kit'
const MAVATAR_FALLBACK_ENTRY_SIZE_PX = 36
const MAVATAR_FALLBACK_ICON_SIZE_PX = 18
const DEFAULT_POWER_KIT_ICON_SIZE_PX = 20
const MAVATAR_POWER_KIT_ICON_SIZE_PX = 16
const WIDE_MAVATAR_EXPANDED_POWER_KIT_ICON_SIZE_PX = 18
const NARROW_MAVATAR_POWER_KIT_ICON_SIZE_PX = 24
const NARROW_LAYOUT_MAX_WIDTH_PX = 840

const getPowerKitIconSvg = (sizePx = DEFAULT_POWER_KIT_ICON_SIZE_PX) => {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 512 512" style="display:block;width:${sizePx}px;height:${sizePx}px;flex:0 0 auto;" aria-hidden="true" data-gpk-icon="1" data-gpk-icon-size="${sizePx}">
	<path d="M0 0h512v512H0z" fill="none" />
	<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M413.66 246.1H386a2 2 0 0 1-2-2v-77.24A38.86 38.86 0 0 0 345.14 128H267.9a2 2 0 0 1-2-2V98.34c0-27.14-21.5-49.86-48.64-50.33a49.53 49.53 0 0 0-50.4 49.51V126a2 2 0 0 1-2 2H87.62A39.74 39.74 0 0 0 48 167.62V238a2 2 0 0 0 2 2h26.91c29.37 0 53.68 25.48 54.09 54.85c.42 29.87-23.51 57.15-53.29 57.15H50a2 2 0 0 0-2 2v70.38A39.74 39.74 0 0 0 87.62 464H158a2 2 0 0 0 2-2v-20.93c0-30.28 24.75-56.35 55-57.06c30.1-.7 57 20.31 57 50.28V462a2 2 0 0 0 2 2h71.14A38.86 38.86 0 0 0 384 425.14v-78a2 2 0 0 1 2-2h28.48c27.63 0 49.52-22.67 49.52-50.4s-23.2-48.64-50.34-48.64" />
</svg>

`
}

const SYNC_RELATED_SELECTOR = [
  `side-nav-action-button[data-test-id="${DESKTOP_SETTINGS_HOST_TEST_ID}"]`,
  `gem-icon-button[data-test-id="${DESKTOP_MAVATAR_SETTINGS_BUTTON_TEST_ID}"]`,
  `button[data-test-id="${DESKTOP_MAVATAR_SETTINGS_BUTTON_TEST_ID}"]`,
  `gem-icon-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`,
  `button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`,
  `div[data-test-id="${DESKTOP_MAVATAR_POWER_KIT_CONTAINER_TEST_ID}"]`,
  `button[data-test-id="${MOBILE_SETTINGS_BUTTON_TEST_ID}"]`,
  'sidenav-mavatar-footer',
  '.mavatar-footer-row',
  'mat-action-list.desktop-controls',
  '.mobile-controls',
].join(',')

type DesktopVariant = 'expanded' | 'collapsed'

// ── Badge (small red dot) state ──────────────────────────────────────────────

const BADGE_DOT_ATTR = 'data-gpk-badge'
const BADGE_STYLE_ID = 'gpk-badge-style'
const TOOLTIP_STYLE_ID = 'gpk-tooltip-style'

let badgeVisible = false

const injectBadgeStyle = () => {
  if (document.getElementById(BADGE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = BADGE_STYLE_ID
  style.textContent = `
mat-icon[data-gpk-icon-applied="1"] {
  position: relative !important;
  overflow: visible !important;
}
[${BADGE_DOT_ATTR}="icon"] {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gem-sys-color--primary);
  pointer-events: none;
  z-index: 1;
}
[${BADGE_DOT_ATTR}="inline"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gem-sys-color--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: var(--gem-sys-spacing--xs) var(--gem-sys-spacing--s);
  border-radius: var(--gem-sys-shape--corner-full);
  pointer-events: none;
  vertical-align: middle;
  margin-left: 8px;
  flex-shrink: 0;
  line-height: 1;
  font-family: inherit;
}
`
  document.head.appendChild(style)
}

const ensureBadgeDot = (el: HTMLElement, mode: 'icon' | 'inline') => {
  const existing = el.querySelector(`[${BADGE_DOT_ATTR}]`) as HTMLElement | null
  if (badgeVisible) {
    if (!existing) {
      const dot = document.createElement('span')
      dot.setAttribute(BADGE_DOT_ATTR, mode)
      if (mode === 'inline') {
        dot.textContent = 'New'
      }
      el.appendChild(dot)
    } else if (existing.getAttribute(BADGE_DOT_ATTR) !== mode) {
      existing.setAttribute(BADGE_DOT_ATTR, mode)
      if (mode === 'inline') {
        existing.textContent = 'New'
      } else {
        existing.textContent = ''
      }
    }
  } else {
    existing?.remove()
  }
}

const removeAllBadgeDots = () => {
  document.querySelectorAll(`[${BADGE_DOT_ATTR}]`).forEach((el) => el.remove())
}

// ── End badge state ──────────────────────────────────────────────────────────

const injectTooltipStyle = () => {
  if (document.getElementById(TOOLTIP_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = TOOLTIP_STYLE_ID
  style.textContent = `
.tippy-box[data-theme~='gemini-tooltip'] {
  background: rgb(0, 0, 0);
  border-radius: 12px;
  box-shadow: none;
  color: rgb(242, 240, 240);
  font-family: "Google Sans Flex", "Google Sans Text", "Google Sans", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}

body.dark-theme .tippy-box[data-theme~='gemini-tooltip'] {
  background: rgb(230, 230, 230);
  color: rgb(23, 23, 23);
}

.tippy-box[data-theme~='gemini-tooltip'] > .tippy-content {
  padding: 8px 16px;
}
`
  document.head.appendChild(style)
}

let rafId: number | null = null
let bootstrapRetryTimer: number | null = null
let bootstrapRetryCount = 0
const MAX_BOOTSTRAP_RETRIES = 20
const BOOTSTRAP_RETRY_DELAY_MS = 300

let layoutObserver: MutationObserver | null = null
let sideNavObserver: MutationObserver | null = null
let desktopListObserver: MutationObserver | null = null
let desktopSettingsAttrObserver: MutationObserver | null = null
let mobileControlsObserver: MutationObserver | null = null

let observedLayoutRoot: Element | null = null
let observedSideNavRoot: Element | null = null
let observedDesktopList: Element | null = null
let observedDesktopSettingsHost: Element | null = null
let observedMobileControls: Element | null = null

const desktopTooltipInstances = new Set<Instance>()
let isStarted = false

const getDesktopSettingsHost = (): HTMLElement | null =>
  document.querySelector(
    `mat-action-list.desktop-controls > side-nav-action-button[data-test-id="${DESKTOP_SETTINGS_HOST_TEST_ID}"]`
  )

const getDesktopMavatarSettingsButton = (): HTMLElement | null =>
  document.querySelector(
    `gem-icon-button[data-test-id="${DESKTOP_MAVATAR_SETTINGS_BUTTON_TEST_ID}"], button[data-test-id="${DESKTOP_MAVATAR_SETTINGS_BUTTON_TEST_ID}"]`
  )

const getDesktopMavatarFooterRow = (): HTMLElement | null =>
  document.querySelector('sidenav-mavatar-footer > div.mavatar-footer-row')

const getDesktopMavatarFooterRight = (): HTMLElement | null =>
  document.querySelector('sidenav-mavatar-footer > div.mavatar-footer-row .mavatar-footer-right')

const getMobileSettingsButton = (): HTMLButtonElement | null =>
  document.querySelector(`button[data-test-id="${MOBILE_SETTINGS_BUTTON_TEST_ID}"]`)

const getSideNavRoot = (): HTMLElement | null => document.querySelector('side-navigation-content')

const getLayoutRoot = (): HTMLElement | null => document.querySelector('chat-app')

const openThemeSettings = () => {
  eventBus.emitSync('settings:open', {
    from: 'prompt-entrance',
    open: true,
    module: 'theme',
  })
}

const setAttrIfDifferent = (el: Element, name: string, value: string) => {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value)
  }
}

const removeAttrIfPresent = (el: Element, name: string) => {
  if (el.hasAttribute(name)) {
    el.removeAttribute(name)
  }
}

const setTextIfDifferent = (el: Element, value: string) => {
  if (el.textContent !== value) {
    el.textContent = value
  }
}

const syncAttributesFromSource = (
  source: Element,
  target: Element,
  preservedAttrs: readonly string[] = []
) => {
  const preserved = new Set(preservedAttrs)
  const sourceAttrNames = new Set(Array.from(source.attributes).map((attr) => attr.name))

  for (const attr of Array.from(target.attributes)) {
    if (!sourceAttrNames.has(attr.name) && !preserved.has(attr.name)) {
      target.removeAttribute(attr.name)
    }
  }

  for (const attr of Array.from(source.attributes)) {
    setAttrIfDifferent(target, attr.name, attr.value)
  }
}

const bindThemeOpenHandler = (button: HTMLElement) => {
  if (button.dataset.gpkBound === '1') return
  button.dataset.gpkBound = '1'
  button.addEventListener('click', (event) => {
    getDesktopTooltipInstance(button)?.hide()
    event.preventDefault()
    event.stopPropagation()
    button.blur()
    if (badgeVisible) {
      badgeVisible = false
      removeAllBadgeDots()
      void dismissBadge()
    }
    openThemeSettings()
  })
}

const getDesktopTooltipInstance = (button: HTMLElement): Instance | null => {
  const existing = (button as unknown as { _tippy?: Instance })._tippy
  return existing ?? null
}

const destroyDesktopTooltip = (button: HTMLElement | null) => {
  if (!button) return
  const existing = getDesktopTooltipInstance(button)
  if (!existing) return
  existing.destroy()
  desktopTooltipInstances.delete(existing)
}

const POWER_KIT_ENTRY_SELECTOR = [
  `side-nav-action-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`,
  `gem-icon-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`,
  `button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`,
  `button[data-test-id="${MOBILE_POWER_KIT_BUTTON_TEST_ID}"]`,
].join(',')

const ensureDesktopTooltip = (
  button: HTMLElement,
  enabled: boolean,
  placement: 'top' | 'right' = 'top'
) => {
  injectTooltipStyle()
  const existing = getDesktopTooltipInstance(button)

  if (!enabled) {
    if (existing) {
      existing.destroy()
      desktopTooltipInstances.delete(existing)
    }
    return
  }

  if (existing) {
    if (!desktopTooltipInstances.has(existing)) {
      desktopTooltipInstances.add(existing)
    }
    existing.setContent(POWER_KIT_LABEL)
    existing.setProps({ placement })
    return
  }

  try {
    const instance = tippy(button, {
      content: POWER_KIT_LABEL,
      placement,
      animation: 'shift-away-subtle',
      arrow: false,
      theme: 'gemini-tooltip',
      duration: [null, 0],
    })

    desktopTooltipInstances.add(instance)
  } catch (error) {
    console.warn('[Gemini Power kit] Failed to initialize desktop tooltip', error)
  }
}

const destroyAllDesktopTooltips = () => {
  for (const instance of desktopTooltipInstances) {
    instance.destroy()
  }
  desktopTooltipInstances.clear()
}

const sweepDesktopTooltipInstances = () => {
  for (const instance of Array.from(desktopTooltipInstances)) {
    const reference = instance.reference as Element | null
    const isDetached = !reference || !(reference as Node).isConnected
    const outsidePowerKitEntry = !isDetached
      && !reference.closest(POWER_KIT_ENTRY_SELECTOR)

    if (isDetached || outsidePowerKitEntry) {
      instance.destroy()
      desktopTooltipInstances.delete(instance)
    }
  }
}

const getElementPixelSize = (element: Element | null, fallbackPx = DEFAULT_POWER_KIT_ICON_SIZE_PX) => {
  if (!(element instanceof HTMLElement)) return fallbackPx

  const rect = element.getBoundingClientRect()
  if (rect.width > 0) return Math.round(rect.width)

  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
  return Number.isFinite(fontSize) && fontSize > 0 ? Math.round(fontSize) : fallbackPx
}

const isVisibleElement = (element: Element | null) => {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const isNarrowMavatarLayout = () => {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  if (viewportWidth > 0 && viewportWidth <= NARROW_LAYOUT_MAX_WIDTH_PX) return true

  return Array.from(document.querySelectorAll('.mobile-controls')).some(isVisibleElement)
}

const applyPowerKitSvgIcon = (
  icon: Element | null,
  sizePx = DEFAULT_POWER_KIT_ICON_SIZE_PX,
  iconBoxSizePx = DEFAULT_POWER_KIT_ICON_SIZE_PX
) => {
  if (!icon) return

  const hasAppliedSvg = icon.getAttribute('data-gpk-icon-applied') === '1'
  const existingSvg = icon.querySelector('svg[data-gpk-icon="1"]')
  if (
    hasAppliedSvg
    && existingSvg?.getAttribute('data-gpk-icon-size') === String(sizePx)
    && icon instanceof HTMLElement
    && icon.style.width === `${iconBoxSizePx}px`
  ) {
    return
  }

  removeAttrIfPresent(icon, 'fonticon')
  removeAttrIfPresent(icon, 'data-mat-icon-name')
  setAttrIfDifferent(icon, 'data-mat-icon-type', 'svg')
  icon.classList.remove('mat-ligature-font')
  if (icon instanceof HTMLElement) {
    icon.style.width = `${iconBoxSizePx}px`
    icon.style.height = `${iconBoxSizePx}px`
    icon.style.display = 'inline-flex'
    icon.style.alignItems = 'center'
    icon.style.justifyContent = 'center'
  }
  icon.innerHTML = getPowerKitIconSvg(sizePx)
  setAttrIfDifferent(icon, 'data-gpk-icon-applied', '1')
}

const getDesktopVariant = (settingsHost: HTMLElement): DesktopVariant =>
  settingsHost.classList.contains('is-expanded') ? 'expanded' : 'collapsed'

const decorateDesktopEntry = (host: HTMLElement, variant: DesktopVariant) => {
  setAttrIfDifferent(host, 'data-test-id', DESKTOP_POWER_KIT_HOST_TEST_ID)
  setAttrIfDifferent(host, 'icon', 'gpk-svg')
  setAttrIfDifferent(host, 'arialabel', POWER_KIT_LABEL)
  setAttrIfDifferent(host, 'data-gpk-variant', variant)

  const button = host.querySelector('button')
  if (!button) return

  setAttrIfDifferent(button, 'aria-label', POWER_KIT_LABEL)
  removeAttrIfPresent(button, 'title')
  const htmlButton = button as HTMLElement
  htmlButton.style.setProperty('--mat-icon-button-icon-size', '20px')
  removeAttrIfPresent(button, 'aria-haspopup')
  removeAttrIfPresent(button, 'aria-expanded')
  bindThemeOpenHandler(button as HTMLElement)

  const icon = host.querySelector('mat-icon[data-test-id="side-nav-action-button-icon"], mat-icon')
  applyPowerKitSvgIcon(icon)

  const text = host.querySelector('[data-test-id="side-nav-action-button-content"]')
  if (text) {
    setTextIfDifferent(text, POWER_KIT_LABEL)
  }

  ensureDesktopTooltip(button as HTMLElement, variant === 'collapsed')
  if (variant === 'expanded') {
    const textTarget = host.querySelector('[data-test-id="side-nav-action-button-content"]') as HTMLElement | null
    if (textTarget) ensureBadgeDot(textTarget, 'inline')
  } else {
    const iconTarget = (host.querySelector('mat-icon[data-gpk-icon-applied="1"]') ?? host.querySelector('mat-icon')) as HTMLElement | null
    if (iconTarget) ensureBadgeDot(iconTarget, 'icon')
  }
}

const buildDesktopEntryFromSettings = (settingsHost: HTMLElement, variant: DesktopVariant) => {
  const clone = settingsHost.cloneNode(true) as HTMLElement
  decorateDesktopEntry(clone, variant)
  return clone
}

const getDesktopMavatarVariant = (settingsButton: HTMLElement): DesktopVariant => {
  const footerRow = settingsButton.closest('.mavatar-footer-row')
  if (footerRow?.classList.contains('collapsed')) return 'collapsed'

  const sideNav = settingsButton.closest('bard-sidenav')
  return sideNav?.classList.contains('collapsed') ? 'collapsed' : 'expanded'
}

const getDesktopMavatarPowerKitButton = (): HTMLElement | null =>
  document.querySelector(
    `gem-icon-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"], button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`
  )

const getDesktopMavatarPowerKitContainer = (): HTMLElement | null =>
  document.querySelector(`div[data-test-id="${DESKTOP_MAVATAR_POWER_KIT_CONTAINER_TEST_ID}"]`)

const getDesktopMavatarFallbackPowerKitButton = (): HTMLButtonElement | null =>
  document.querySelector(`button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`)

const decorateDesktopMavatarButton = (
  button: HTMLElement,
  sourceClassName: string,
  variant: DesktopVariant,
  sourceIconSizePx: number
) => {
  setAttrIfDifferent(button, 'data-test-id', DESKTOP_POWER_KIT_HOST_TEST_ID)
  setAttrIfDifferent(button, 'aria-label', POWER_KIT_LABEL)
  removeAttrIfPresent(button, 'title')
  setAttrIfDifferent(button, 'data-gpk-variant', variant)
  if (button.className !== sourceClassName) {
    button.className = sourceClassName
  }
  removeAttrIfPresent(button, 'aria-haspopup')
  removeAttrIfPresent(button, 'aria-expanded')
  bindThemeOpenHandler(button)

  const innerButton = button.matches('button') ? button : button.querySelector('button')
  if (innerButton) {
    setAttrIfDifferent(innerButton, 'aria-label', POWER_KIT_LABEL)
    removeAttrIfPresent(innerButton, 'title')
    removeAttrIfPresent(innerButton, 'aria-haspopup')
    removeAttrIfPresent(innerButton, 'aria-expanded')
  }

  const icon = button.querySelector('mat-icon')
  const useNarrowIconSize = variant === 'expanded' && isNarrowMavatarLayout()
  const iconSizePx = variant === 'collapsed'
    ? MAVATAR_POWER_KIT_ICON_SIZE_PX
    : useNarrowIconSize
      ? NARROW_MAVATAR_POWER_KIT_ICON_SIZE_PX
      : WIDE_MAVATAR_EXPANDED_POWER_KIT_ICON_SIZE_PX
  const iconBoxSizePx = variant === 'collapsed' ? DEFAULT_POWER_KIT_ICON_SIZE_PX : sourceIconSizePx
  applyPowerKitSvgIcon(icon, iconSizePx, iconBoxSizePx)

  const iconTarget = (button.querySelector('mat-icon[data-gpk-icon-applied="1"]') ?? icon) as HTMLElement | null
  if (iconTarget) ensureBadgeDot(iconTarget, 'icon')

  ensureDesktopTooltip(button, true, variant === 'collapsed' ? 'right' : 'top')
}

const decorateDesktopMavatarFallbackButton = (
  button: HTMLButtonElement,
  iconSizePx: number
) => {
  setAttrIfDifferent(button, 'data-test-id', DESKTOP_POWER_KIT_HOST_TEST_ID)
  setAttrIfDifferent(button, 'aria-label', POWER_KIT_LABEL)
  setAttrIfDifferent(button, 'title', POWER_KIT_LABEL)
  setAttrIfDifferent(button, 'data-gpk-variant', 'fallback')
  button.type = 'button'
  button.className = 'gpk-power-kit-fallback-entry'
  button.style.width = `${MAVATAR_FALLBACK_ENTRY_SIZE_PX}px`
  button.style.height = `${MAVATAR_FALLBACK_ENTRY_SIZE_PX}px`
  button.style.minWidth = `${MAVATAR_FALLBACK_ENTRY_SIZE_PX}px`
  button.style.padding = '0'
  button.style.border = '0'
  button.style.borderRadius = '50%'
  button.style.background = 'transparent'
  button.style.color = 'inherit'
  button.style.display = 'inline-flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.cursor = 'pointer'
  removeAttrIfPresent(button, 'aria-haspopup')
  removeAttrIfPresent(button, 'aria-expanded')
  bindThemeOpenHandler(button)

  let icon = button.querySelector('span[data-gpk-fallback-icon="1"]')
  if (!icon) {
    icon = document.createElement('span')
    icon.setAttribute('data-gpk-fallback-icon', '1')
    button.replaceChildren(icon)
  }
  if (icon instanceof HTMLElement) {
    icon.style.width = `${iconSizePx}px`
    icon.style.height = `${iconSizePx}px`
    icon.style.display = 'inline-flex'
    icon.style.alignItems = 'center'
    icon.style.justifyContent = 'center'
  }
  if (icon.getAttribute('data-gpk-icon-size') !== String(iconSizePx)) {
    icon.innerHTML = getPowerKitIconSvg(iconSizePx)
    icon.setAttribute('data-gpk-icon-size', String(iconSizePx))
  }
  if (icon instanceof HTMLElement) ensureBadgeDot(icon, 'icon')

  ensureDesktopTooltip(button, true, 'top')
}

const insertAsPenultimateChild = (parent: HTMLElement, child: HTMLElement) => {
  const lastElementExcludingChild = Array.from(parent.children)
    .filter((element) => element !== child)
    .at(-1)

  if (lastElementExcludingChild) {
    if (
      child.parentElement === parent
      && child.nextElementSibling === lastElementExcludingChild
    ) {
      return
    }
    parent.insertBefore(child, lastElementExcludingChild)
    return
  }

  if (child.parentElement !== parent) {
    parent.appendChild(child)
  }
}

const ensureDesktopMavatarFallbackEntry = () => {
  const footerRight = getDesktopMavatarFooterRight()
  const footerRow = getDesktopMavatarFooterRow()
  const mountParent = footerRight ?? footerRow
  if (!mountParent) return false

  bindDesktopObservers(mountParent, footerRow ?? mountParent)

  const existingPowerKitEntry = getDesktopMavatarPowerKitButton()
  if (existingPowerKitEntry && !existingPowerKitEntry.matches('button')) {
    destroyDesktopTooltip(existingPowerKitEntry)
    existingPowerKitEntry.remove()
  }

  const existingButton = getDesktopMavatarFallbackPowerKitButton()
  const currentButton = existingButton ?? document.createElement('button')
  decorateDesktopMavatarFallbackButton(currentButton, MAVATAR_FALLBACK_ICON_SIZE_PX)
  insertAsPenultimateChild(mountParent, currentButton)

  return true
}

const buildDesktopMavatarButtonFromSettings = (
  settingsButton: HTMLElement,
  variant: DesktopVariant,
  sourceIconSizePx: number
) => {
  const clone = settingsButton.cloneNode(true) as HTMLElement
  decorateDesktopMavatarButton(clone, settingsButton.className, variant, sourceIconSizePx)
  return clone
}

const ensureDesktopMavatarEntry = () => {
  const settingsButton = getDesktopMavatarSettingsButton()
  const settingsButtonParent = settingsButton?.parentElement
  const footerRow = settingsButton?.closest('.mavatar-footer-row') as HTMLElement | null
    ?? getDesktopMavatarFooterRow()
  if (!settingsButton || !settingsButtonParent || !footerRow) {
    return ensureDesktopMavatarFallbackEntry()
  }

  bindDesktopObservers(settingsButton, footerRow)

  const variant = getDesktopMavatarVariant(settingsButton)
  const sourceIconSizePx = getElementPixelSize(settingsButton.querySelector('mat-icon'))
  const existingButton = getDesktopMavatarPowerKitButton()
  const isFallbackButton = Boolean(existingButton?.classList.contains('gpk-power-kit-fallback-entry'))
  if (existingButton && isFallbackButton) {
    destroyDesktopTooltip(existingButton)
    existingButton.remove()
  }
  const existingContainer = getDesktopMavatarPowerKitContainer()
  const currentButton = existingButton && !isFallbackButton
    ? existingButton
    : buildDesktopMavatarButtonFromSettings(settingsButton, variant, sourceIconSizePx)

  decorateDesktopMavatarButton(currentButton, settingsButton.className, variant, sourceIconSizePx)

  if (variant === 'collapsed') {
    const container = existingContainer ?? settingsButtonParent.cloneNode(false) as HTMLElement
    syncAttributesFromSource(settingsButtonParent, container, ['data-test-id'])
    setAttrIfDifferent(container, 'data-test-id', DESKTOP_MAVATAR_POWER_KIT_CONTAINER_TEST_ID)
    if (currentButton.parentElement !== container) {
      container.appendChild(currentButton)
    }
    if (container.parentElement !== footerRow || container.previousElementSibling !== settingsButtonParent) {
      footerRow.insertBefore(container, settingsButtonParent.nextElementSibling)
    }
  } else {
    if (currentButton.parentElement !== settingsButtonParent || currentButton.nextElementSibling !== settingsButton) {
      settingsButtonParent.insertBefore(currentButton, settingsButton)
    }
    existingContainer?.remove()
  }

  return true
}

const ensureLegacyDesktopEntry = () => {
  const settingsHost = getDesktopSettingsHost()
  if (!settingsHost || !settingsHost.parentElement) {
    return false
  }

  bindDesktopObservers(settingsHost)

  const parent = settingsHost.parentElement
  const variant = getDesktopVariant(settingsHost)
  const existingHost = parent.querySelector<HTMLElement>(
    `side-nav-action-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`
  )

  let currentHost = existingHost
  if (!existingHost || existingHost.getAttribute('data-gpk-variant') !== variant) {
    destroyDesktopTooltip(existingHost?.querySelector('button') as HTMLElement | null)
    const newHost = buildDesktopEntryFromSettings(settingsHost, variant)
    if (existingHost) {
      existingHost.replaceWith(newHost)
    } else {
      parent.insertBefore(newHost, settingsHost)
    }
    currentHost = newHost
  }

  if (currentHost) {
    decorateDesktopEntry(currentHost, variant)
    if (currentHost.nextElementSibling !== settingsHost) {
      parent.insertBefore(currentHost, settingsHost)
    }
  }

  return true
}

const ensureDesktopEntry = () => ensureDesktopMavatarEntry() || ensureLegacyDesktopEntry()

const decorateMobileEntry = (button: HTMLButtonElement, sourceClassName: string) => {
  setAttrIfDifferent(button, 'data-test-id', MOBILE_POWER_KIT_BUTTON_TEST_ID)
  setAttrIfDifferent(button, 'aria-label', POWER_KIT_LABEL)
  setAttrIfDifferent(button, 'title', POWER_KIT_LABEL)
  if (button.className !== sourceClassName) {
    button.className = sourceClassName
  }
  bindThemeOpenHandler(button)

  const icon = button.querySelector('mat-icon')
  applyPowerKitSvgIcon(icon)

  const label = button.querySelector('.mdc-button__label .gds-label-l, .mdc-button__label span, .gds-label-l')
  if (label) {
    setTextIfDifferent(label, ` ${POWER_KIT_LABEL} `)
  }
  const mobileIconTarget = (button.querySelector('mat-icon[data-gpk-icon-applied="1"]') ?? button.querySelector('mat-icon')) as HTMLElement | null
  if (mobileIconTarget) ensureBadgeDot(mobileIconTarget, 'icon')
}

const buildMobileEntryFromSettings = (settingsButton: HTMLButtonElement) => {
  const clone = settingsButton.cloneNode(true) as HTMLButtonElement
  decorateMobileEntry(clone, settingsButton.className)
  return clone
}

const ensureMobileEntry = () => {
  const settingsButton = getMobileSettingsButton()
  if (!settingsButton || !settingsButton.parentElement) {
    return false
  }

  bindMobileObserver(settingsButton)

  const parent = settingsButton.parentElement
  const existingButton = parent.querySelector<HTMLButtonElement>(
    `button[data-test-id="${MOBILE_POWER_KIT_BUTTON_TEST_ID}"]`
  )

  let currentButton = existingButton
  if (!existingButton) {
    const newButton = buildMobileEntryFromSettings(settingsButton)
    parent.insertBefore(newButton, settingsButton)
    currentButton = newButton
  }

  if (currentButton) {
    decorateMobileEntry(currentButton, settingsButton.className)
    if (currentButton.nextElementSibling !== settingsButton) {
      parent.insertBefore(currentButton, settingsButton)
    }
  }

  return true
}

const resolveMutationTarget = (node: Node | null): Element | null => {
  if (!node) return null
  if (node instanceof Element) return node
  return node.parentElement
}

const isInsidePowerKitEntry = (node: Node | null): boolean => {
  const element = resolveMutationTarget(node)
  if (!element) return false
  return !!element.closest(
    POWER_KIT_ENTRY_SELECTOR
  )
}

const elementMatchesRelatedSelector = (element: Element): boolean => {
  if (element.matches(SYNC_RELATED_SELECTOR)) return true
  return !!element.querySelector(SYNC_RELATED_SELECTOR)
}

const shouldHandleMutation = (mutation: MutationRecord): boolean => {
  if (isInsidePowerKitEntry(mutation.target)) return false

  const targetElement = resolveMutationTarget(mutation.target)
  if (targetElement && elementMatchesRelatedSelector(targetElement)) {
    return true
  }

  for (const node of mutation.addedNodes) {
    const element = resolveMutationTarget(node)
    if (element && elementMatchesRelatedSelector(element)) return true
  }

  for (const node of mutation.removedNodes) {
    const element = resolveMutationTarget(node)
    if (element && elementMatchesRelatedSelector(element)) return true
  }

  return false
}

const syncEntries = () => {
  sweepDesktopTooltipInstances()

  const desktopOk = ensureDesktopEntry()
  const mobileOk = ensureMobileEntry()
  const hasEntry = desktopOk || mobileOk

  if (hasEntry) {
    bootstrapRetryCount = 0
    if (bootstrapRetryTimer !== null) {
      window.clearTimeout(bootstrapRetryTimer)
      bootstrapRetryTimer = null
    }
  } else {
    scheduleBootstrapRetry()
  }

  if (!desktopOk) {
    destroyAllDesktopTooltips()
    unbindDesktopObservers()
  }
  if (!mobileOk) {
    unbindMobileObserver()
  }
}

const scheduleBootstrapRetry = () => {
  if (bootstrapRetryTimer !== null) return
  if (bootstrapRetryCount >= MAX_BOOTSTRAP_RETRIES) return

  bootstrapRetryTimer = window.setTimeout(() => {
    bootstrapRetryTimer = null
    bootstrapRetryCount += 1
    scheduleSync()
  }, BOOTSTRAP_RETRY_DELAY_MS)
}

const scheduleSync = () => {
  if (rafId !== null) return
  rafId = window.requestAnimationFrame(() => {
    rafId = null
    syncEntries()
    ensureObserverBindings()
  })
}

const unbindDesktopObservers = () => {
  if (desktopListObserver) {
    desktopListObserver.disconnect()
    desktopListObserver = null
  }
  if (desktopSettingsAttrObserver) {
    desktopSettingsAttrObserver.disconnect()
    desktopSettingsAttrObserver = null
  }
  observedDesktopList = null
  observedDesktopSettingsHost = null
}

const bindDesktopObservers = (settingsHost: HTMLElement, attrTarget: Element = settingsHost) => {
  const parent = settingsHost.parentElement
  if (!parent) return

  if (observedDesktopList !== parent) {
    if (desktopListObserver) desktopListObserver.disconnect()
    desktopListObserver = new MutationObserver((mutations) => {
      if (mutations.some((m) => !isInsidePowerKitEntry(m.target))) {
        scheduleSync()
      }
    })
    desktopListObserver.observe(parent, { childList: true })
    observedDesktopList = parent
  }

  if (observedDesktopSettingsHost !== attrTarget) {
    if (desktopSettingsAttrObserver) desktopSettingsAttrObserver.disconnect()
    desktopSettingsAttrObserver = new MutationObserver(() => {
      scheduleSync()
    })
    desktopSettingsAttrObserver.observe(attrTarget, {
      attributes: true,
      attributeFilter: ['class'],
    })
    observedDesktopSettingsHost = attrTarget
  }
}

const unbindMobileObserver = () => {
  if (mobileControlsObserver) {
    mobileControlsObserver.disconnect()
    mobileControlsObserver = null
  }
  observedMobileControls = null
}

const bindMobileObserver = (settingsButton: HTMLButtonElement) => {
  const parent = settingsButton.parentElement
  if (!parent) return

  if (observedMobileControls !== parent) {
    if (mobileControlsObserver) mobileControlsObserver.disconnect()
    mobileControlsObserver = new MutationObserver((mutations) => {
      if (mutations.some((m) => !isInsidePowerKitEntry(m.target))) {
        scheduleSync()
      }
    })
    mobileControlsObserver.observe(parent, { childList: true })
    observedMobileControls = parent
  }
}

const bindLayoutObserver = (layoutRoot: Element) => {
  if (observedLayoutRoot === layoutRoot) return

  if (layoutObserver) {
    layoutObserver.disconnect()
    layoutObserver = null
  }

  layoutObserver = new MutationObserver(() => {
    ensureObserverBindings()
    scheduleSync()
  })
  layoutObserver.observe(layoutRoot, {
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  observedLayoutRoot = layoutRoot
}

const bindSideNavObserver = (sideNavRoot: Element) => {
  if (observedSideNavRoot === sideNavRoot) return

  if (sideNavObserver) {
    sideNavObserver.disconnect()
    sideNavObserver = null
  }

  sideNavObserver = new MutationObserver((mutations) => {
    if (mutations.some(shouldHandleMutation)) {
      scheduleSync()
    }
  })
  sideNavObserver.observe(sideNavRoot, { childList: true, subtree: true })
  observedSideNavRoot = sideNavRoot
}

const ensureObserverBindings = () => {
  const layoutRoot = getLayoutRoot()
  if (layoutRoot) {
    bindLayoutObserver(layoutRoot)
  }

  const sideNavRoot = getSideNavRoot()
  if (sideNavRoot) {
    bindSideNavObserver(sideNavRoot)
  } else if (sideNavObserver) {
    sideNavObserver.disconnect()
    sideNavObserver = null
    observedSideNavRoot = null
  }
}

const stopObservers = () => {
  if (layoutObserver) {
    layoutObserver.disconnect()
    layoutObserver = null
  }
  if (sideNavObserver) {
    sideNavObserver.disconnect()
    sideNavObserver = null
  }
  unbindDesktopObservers()
  unbindMobileObserver()

  observedLayoutRoot = null
  observedSideNavRoot = null

  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  if (bootstrapRetryTimer !== null) {
    window.clearTimeout(bootstrapRetryTimer)
    bootstrapRetryTimer = null
  }
  bootstrapRetryCount = 0

  destroyAllDesktopTooltips()
}

const removeInjectedEntries = () => {
  document.querySelectorAll([
    POWER_KIT_ENTRY_SELECTOR,
    `div[data-test-id="${DESKTOP_MAVATAR_POWER_KIT_CONTAINER_TEST_ID}"]`,
  ].join(',')).forEach((element) => {
    element.remove()
  })
  removeAllBadgeDots()
}

export const stopPowerKitEntry = () => {
  if (!isStarted) return
  isStarted = false
  badgeVisible = false
  window.removeEventListener('beforeunload', stopPowerKitEntry)
  stopObservers()
  removeInjectedEntries()
}

export const startPowerKitEntry = () => {
  if (isStarted) {
    return
  }

  isStarted = true
  badgeVisible = false
  removeInjectedEntries()
  ensureObserverBindings()
  syncEntries()
  void shouldShowBadge().then((show) => {
    if (!isStarted) return
    badgeVisible = show
    if (show) {
      injectBadgeStyle()
      syncEntries()
    }
  })
  window.addEventListener('beforeunload', stopPowerKitEntry)
}
