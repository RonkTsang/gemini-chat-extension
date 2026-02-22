import { eventBus } from '@/utils/eventbus'
import tippy, { type Instance } from 'tippy.js'

const DESKTOP_POWER_KIT_HOST_TEST_ID = 'gemini-power-kit-button'
const DESKTOP_SETTINGS_HOST_TEST_ID = 'settings-and-help-button'
const MOBILE_POWER_KIT_BUTTON_TEST_ID = 'mobile-gemini-power-kit-control'
const MOBILE_SETTINGS_BUTTON_TEST_ID = 'mobile-settings-and-help-control'

const POWER_KIT_LABEL = 'Gemini Power kit'
const POWER_KIT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" style="display:block;width:20px;height:20px;" aria-hidden="true" data-gpk-icon="1"><path fill="currentColor" d="M8.8 21H5q-.825 0-1.412-.587T3 19v-3.8q1.2 0 2.1-.762T6 12.5t-.9-1.937T3 9.8V6q0-.825.588-1.412T5 4h4q0-1.05.725-1.775T11.5 1.5t1.775.725T14 4h4q.825 0 1.413.588T20 6v4q1.05 0 1.775.725T22.5 12.5t-.725 1.775T20 15v4q0 .825-.587 1.413T18 21h-3.8q0-1.25-.787-2.125T11.5 18t-1.912.875T8.8 21M5 19h2.125q.6-1.65 1.925-2.325T11.5 16t2.45.675T15.875 19H18v-6h2q.2 0 .35-.15t.15-.35t-.15-.35T20 12h-2V6h-6V4q0-.2-.15-.35t-.35-.15t-.35.15T11 4v2H5v2.2q1.35.5 2.175 1.675T8 12.5q0 1.425-.825 2.6T5 16.8zm6.5-6.5"/></svg>`

const SYNC_RELATED_SELECTOR = [
  `side-nav-action-button[data-test-id="${DESKTOP_SETTINGS_HOST_TEST_ID}"]`,
  `button[data-test-id="${MOBILE_SETTINGS_BUTTON_TEST_ID}"]`,
  'mat-action-list.desktop-controls',
  '.mobile-controls',
].join(',')

type DesktopVariant = 'expanded' | 'collapsed'

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

const getDesktopSettingsHost = (): HTMLElement | null =>
  document.querySelector(
    `mat-action-list.desktop-controls > side-nav-action-button[data-test-id="${DESKTOP_SETTINGS_HOST_TEST_ID}"]`
  )

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

const bindThemeOpenHandler = (button: HTMLButtonElement) => {
  if (button.dataset.gpkBound === '1') return
  button.dataset.gpkBound = '1'
  button.addEventListener('click', (event) => {
    getDesktopTooltipInstance(button)?.hide()
    event.preventDefault()
    event.stopPropagation()
    button.blur()
    openThemeSettings()
  })
}

const getDesktopTooltipInstance = (button: HTMLButtonElement): Instance | null => {
  const existing = (button as unknown as { _tippy?: Instance })._tippy
  return existing ?? null
}

const destroyDesktopTooltip = (button: HTMLButtonElement | null) => {
  if (!button) return
  const existing = getDesktopTooltipInstance(button)
  if (!existing) return
  existing.destroy()
  desktopTooltipInstances.delete(existing)
}

const ensureDesktopTooltip = (button: HTMLButtonElement, variant: DesktopVariant) => {
  const existing = getDesktopTooltipInstance(button)

  if (variant !== 'collapsed') {
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
    return
  }

  try {
    const instance = tippy(button, {
      content: POWER_KIT_LABEL,
      placement: 'top',
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
      && !reference.closest(`side-nav-action-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"]`)

    if (isDetached || outsidePowerKitEntry) {
      instance.destroy()
      desktopTooltipInstances.delete(instance)
    }
  }
}

const applyPowerKitSvgIcon = (icon: Element | null) => {
  if (!icon) return

  const hasAppliedSvg = icon.getAttribute('data-gpk-icon-applied') === '1'
  const existingSvg = icon.querySelector('svg[data-gpk-icon="1"]')
  if (hasAppliedSvg && existingSvg) return

  removeAttrIfPresent(icon, 'fonticon')
  removeAttrIfPresent(icon, 'data-mat-icon-name')
  setAttrIfDifferent(icon, 'data-mat-icon-type', 'svg')
  icon.classList.remove('mat-ligature-font')
  icon.innerHTML = POWER_KIT_ICON_SVG
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
  bindThemeOpenHandler(button as HTMLButtonElement)

  const icon = host.querySelector('mat-icon[data-test-id="side-nav-action-button-icon"], mat-icon')
  applyPowerKitSvgIcon(icon)

  const text = host.querySelector('[data-test-id="side-nav-action-button-content"]')
  if (text) {
    setTextIfDifferent(text, POWER_KIT_LABEL)
  }

  ensureDesktopTooltip(button as HTMLButtonElement, variant)
}

const buildDesktopEntryFromSettings = (settingsHost: HTMLElement, variant: DesktopVariant) => {
  const clone = settingsHost.cloneNode(true) as HTMLElement
  decorateDesktopEntry(clone, variant)
  return clone
}

const ensureDesktopEntry = () => {
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
    destroyDesktopTooltip(existingHost?.querySelector('button') as HTMLButtonElement | null)
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
    `side-nav-action-button[data-test-id="${DESKTOP_POWER_KIT_HOST_TEST_ID}"], button[data-test-id="${MOBILE_POWER_KIT_BUTTON_TEST_ID}"]`
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

const bindDesktopObservers = (settingsHost: HTMLElement) => {
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

  if (observedDesktopSettingsHost !== settingsHost) {
    if (desktopSettingsAttrObserver) desktopSettingsAttrObserver.disconnect()
    desktopSettingsAttrObserver = new MutationObserver(() => {
      scheduleSync()
    })
    desktopSettingsAttrObserver.observe(settingsHost, {
      attributes: true,
      attributeFilter: ['class'],
    })
    observedDesktopSettingsHost = settingsHost
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

declare global {
  interface Window {
    __geminiPowerKitEntryBootstrapped?: boolean
  }
}

if (!window.__geminiPowerKitEntryBootstrapped) {
  window.__geminiPowerKitEntryBootstrapped = true
  ensureObserverBindings()
  syncEntries()
  window.addEventListener('beforeunload', stopObservers)
}
