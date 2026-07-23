import { eventBus } from '@/utils/eventbus'
import { tt } from '@/utils/i18n'

const APP_ROOT_SELECTOR = 'chat-app-orchestrator#app-root'
const CHAT_APP_SELECTOR = 'chat-app'
const TOP_BAR_HOST_SELECTOR = 'main.chat-app'
const TOP_BAR_SELECTOR = 'top-bar-actions'
const RIGHT_SECTION_SELECTOR = '.right-section'

const CONTAINER_TEST_ID = 'gemini-power-kit-theme-top-bar-container'
const BUTTON_TEST_ID = 'gemini-power-kit-theme-top-bar-button'
const STYLE_ID = 'gpk-theme-top-bar-action-style'

const ENTRY_SELECTOR = `[data-test-id="${CONTAINER_TEST_ID}"]`
const BUTTON_SELECTOR = `[data-test-id="${BUTTON_TEST_ID}"]`

const THEME_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
	<path d="M0 0h24v24H0z" fill="none" />
	<path fill="currentColor" d="M11.962 21q-1.839 0-3.471-.71q-1.633-.711-2.851-1.93T3.71 15.5T3 12q0-1.883.726-3.525t1.979-2.858t2.94-1.916T12.238 3q1.75 0 3.332.591q1.583.592 2.786 1.64q1.203 1.05 1.923 2.5t.72 3.165q0 2.318-1.336 3.71T16 16h-1.773q-.629 0-1.053.433t-.424 1.044q0 .627.375 1.064t.375 1.009q0 .73-.409 1.09q-.408.36-1.13.36M7.21 12.21q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m3-4q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m5 0q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m3 4q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29M11.961 20q.263 0 .4-.115q.138-.116.138-.335q0-.35-.375-.748t-.375-1.31q0-1.088.725-1.79T14.25 15H16q1.88 0 2.94-1.107T20 10.896q0-3.044-2.341-4.97T12.239 4Q8.78 4 6.39 6.325T4 12q0 3.325 2.338 5.663T11.962 20" />
</svg>
`

let isStarted = false
let reconcileFrame: number | null = null

let bootstrapObserver: MutationObserver | null = null
let appRootObserver: MutationObserver | null = null
let chatAppObserver: MutationObserver | null = null
let topBarHostObserver: MutationObserver | null = null
let topBarObserver: MutationObserver | null = null
let rightSectionObserver: MutationObserver | null = null

let observedAppRoot: Element | null = null
let observedChatApp: Element | null = null
let observedTopBarHost: Element | null = null
let observedTopBar: Element | null = null
let observedRightSection: Element | null = null

const getAppRoot = (): HTMLElement | null =>
  document.querySelector(APP_ROOT_SELECTOR)

const getChatApp = (): HTMLElement | null =>
  document.querySelector(`${APP_ROOT_SELECTOR} > ${CHAT_APP_SELECTOR}`)

const getTopBarHost = (): HTMLElement | null =>
  document.querySelector(`${APP_ROOT_SELECTOR} > ${CHAT_APP_SELECTOR} > ${TOP_BAR_HOST_SELECTOR}`)

const getTopBar = (): HTMLElement | null =>
  getTopBarHost()?.querySelector(`:scope > ${TOP_BAR_SELECTOR}`) as HTMLElement | null

const getRightSection = (): HTMLElement | null =>
  getTopBar()?.querySelector(RIGHT_SECTION_SELECTOR) as HTMLElement | null

const setAttributeIfDifferent = (element: Element, name: string, value: string) => {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value)
  }
}

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
${ENTRY_SELECTOR} {
  align-items: center;
  display: flex;
  height: 48px;
  justify-content: center;
}

${BUTTON_SELECTOR} {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 50%;
  color: inherit;
  cursor: pointer;
  display: flex;
  height: 36px;
  justify-content: center;
  min-width: 36px;
  padding: 6px;
  position: relative;
  width: 36px;
}

${BUTTON_SELECTOR}::before {
  background-color: var(--mat-icon-button-state-layer-color, var(--mat-sys-on-surface-variant));
  border-radius: inherit;
  content: '';
  inset: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
}

${BUTTON_SELECTOR}:hover::before {
  opacity: 0.08;
}

${BUTTON_SELECTOR}:focus-visible {
  outline: 2px solid var(--gem-sys-color--primary, currentColor);
  outline-offset: 2px;
}

${BUTTON_SELECTOR} [data-gpk-theme-top-bar-icon] {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 24px;
  height: 24px;
  justify-content: center;
  position: relative;
  width: 24px;
  z-index: 1;
}

${BUTTON_SELECTOR} svg {
  display: block;
}
`
  document.head.appendChild(style)
}

const openThemePanel = () => {
  eventBus.emitSync('theme-floating-panel:open', {
    source: 'top-bar-action',
  })
}

const createEntry = (): HTMLDivElement => {
  const container = document.createElement('div')
  container.className = 'buttons-container'
  container.dataset.testId = CONTAINER_TEST_ID

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed'
  button.dataset.testId = BUTTON_TEST_ID

  const icon = document.createElement('span')
  icon.dataset.gpkThemeTopBarIcon = '1'
  icon.innerHTML = THEME_ICON_SVG
  button.appendChild(icon)

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    button.blur()
    openThemePanel()
  })

  container.appendChild(button)
  return container
}

const decorateEntry = (container: HTMLElement) => {
  const label = tt('settingPanel.config.theme.title', 'Theme')
  const button = container.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)
  if (!button) return

  setAttributeIfDifferent(container, 'class', 'buttons-container')
  setAttributeIfDifferent(button, 'aria-label', label)
  setAttributeIfDifferent(button, 'title', label)
}

const insertAsPenultimateChild = (parent: HTMLElement, child: HTMLElement) => {
  const nativeChildren = Array.from(parent.children).filter((element) => element !== child)
  const lastNativeChild = nativeChildren.at(-1)

  if (lastNativeChild) {
    if (child.parentElement === parent && child.nextElementSibling === lastNativeChild) {
      return
    }
    parent.insertBefore(child, lastNativeChild)
    return
  }

  if (child.parentElement !== parent || child.nextElementSibling !== null) {
    parent.appendChild(child)
  }
}

const isEntryNode = (node: Node): boolean => {
  if (!(node instanceof Element)) return false
  return node.matches(ENTRY_SELECTOR) || Boolean(node.closest(ENTRY_SELECTOR))
}

const isOnlyEntryInsertion = (mutations: MutationRecord[]): boolean => {
  let hasAddedEntry = false

  for (const mutation of mutations) {
    if (mutation.removedNodes.length > 0) return false
    for (const node of mutation.addedNodes) {
      if (!isEntryNode(node)) return false
      hasAddedEntry = true
    }
  }

  return hasAddedEntry
}

const disconnectObserver = (
  observer: MutationObserver | null,
): null => {
  observer?.disconnect()
  return null
}

const scheduleReconcile = () => {
  if (!isStarted || reconcileFrame !== null) return

  reconcileFrame = window.requestAnimationFrame(() => {
    reconcileFrame = null
    reconcile()
  })
}

const bindBootstrapObserver = () => {
  if (bootstrapObserver || getAppRoot()) return

  bootstrapObserver = new MutationObserver(() => {
    if (getAppRoot()) scheduleReconcile()
  })
  bootstrapObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

const bindAppRootObserver = (appRoot: Element | null) => {
  if (observedAppRoot === appRoot) return
  appRootObserver = disconnectObserver(appRootObserver)
  observedAppRoot = appRoot

  if (!appRoot) return
  bootstrapObserver = disconnectObserver(bootstrapObserver)
  appRootObserver = new MutationObserver(scheduleReconcile)
  appRootObserver.observe(appRoot, { childList: true })
}

const bindChatAppObserver = (chatApp: Element | null) => {
  if (observedChatApp === chatApp) return
  chatAppObserver = disconnectObserver(chatAppObserver)
  observedChatApp = chatApp

  if (!chatApp) return
  chatAppObserver = new MutationObserver(scheduleReconcile)
  chatAppObserver.observe(chatApp, { childList: true })
}

const bindTopBarHostObserver = (topBarHost: Element | null) => {
  if (observedTopBarHost === topBarHost) return
  topBarHostObserver = disconnectObserver(topBarHostObserver)
  observedTopBarHost = topBarHost

  if (!topBarHost) return
  topBarHostObserver = new MutationObserver(scheduleReconcile)
  topBarHostObserver.observe(topBarHost, { childList: true })
}

const bindTopBarObserver = (topBar: Element | null) => {
  if (observedTopBar === topBar) return
  topBarObserver = disconnectObserver(topBarObserver)
  observedTopBar = topBar

  if (!topBar) return
  topBarObserver = new MutationObserver((mutations) => {
    if (!isOnlyEntryInsertion(mutations)) scheduleReconcile()
  })
  topBarObserver.observe(topBar, { childList: true, subtree: true })
}

const bindRightSectionObserver = (rightSection: Element | null) => {
  if (observedRightSection === rightSection) return
  rightSectionObserver = disconnectObserver(rightSectionObserver)
  observedRightSection = rightSection

  if (!rightSection) return
  rightSectionObserver = new MutationObserver((mutations) => {
    if (!isOnlyEntryInsertion(mutations)) scheduleReconcile()
  })
  rightSectionObserver.observe(rightSection, { childList: true })
}

const ensureObserverBindings = () => {
  const appRoot = getAppRoot()
  const chatApp = getChatApp()
  const topBarHost = getTopBarHost()
  const topBar = getTopBar()
  const rightSection = getRightSection()

  bindAppRootObserver(appRoot)
  bindChatAppObserver(chatApp)
  bindTopBarHostObserver(topBarHost)
  bindTopBarObserver(topBar)
  bindRightSectionObserver(rightSection)

  if (!appRoot) bindBootstrapObserver()
}

const removeDuplicateEntries = (entryToKeep: HTMLElement | null) => {
  document.querySelectorAll<HTMLElement>(ENTRY_SELECTOR).forEach((entry) => {
    if (entry !== entryToKeep) entry.remove()
  })
}

const reconcile = () => {
  if (!isStarted) return

  ensureObserverBindings()
  const rightSection = getRightSection()
  if (!rightSection) return

  ensureStyle()
  const existingEntry = rightSection.querySelector<HTMLElement>(`:scope > ${ENTRY_SELECTOR}`)
  const existingButton = existingEntry?.querySelector(BUTTON_SELECTOR)
  const existingIcon = existingButton?.querySelector('[data-gpk-theme-top-bar-icon]')
  const entry = existingEntry && existingButton && existingIcon
    ? existingEntry
    : createEntry()
  if (existingEntry && existingEntry !== entry) existingEntry.remove()
  removeDuplicateEntries(entry)
  decorateEntry(entry)
  insertAsPenultimateChild(rightSection, entry)
}

const stopObservers = () => {
  bootstrapObserver = disconnectObserver(bootstrapObserver)
  appRootObserver = disconnectObserver(appRootObserver)
  chatAppObserver = disconnectObserver(chatAppObserver)
  topBarHostObserver = disconnectObserver(topBarHostObserver)
  topBarObserver = disconnectObserver(topBarObserver)
  rightSectionObserver = disconnectObserver(rightSectionObserver)

  observedAppRoot = null
  observedChatApp = null
  observedTopBarHost = null
  observedTopBar = null
  observedRightSection = null

  if (reconcileFrame !== null) {
    window.cancelAnimationFrame(reconcileFrame)
    reconcileFrame = null
  }
}

const removeInjectedResources = () => {
  document.querySelectorAll(ENTRY_SELECTOR).forEach((entry) => entry.remove())
  document.getElementById(STYLE_ID)?.remove()
}

export const stopTopBarAction = () => {
  if (!isStarted) return
  isStarted = false
  window.removeEventListener('beforeunload', stopTopBarAction)
  stopObservers()
  removeInjectedResources()
}

export const startTopBarAction = () => {
  if (isStarted) return
  isStarted = true
  removeInjectedResources()
  reconcile()
  window.addEventListener('beforeunload', stopTopBarAction)
}
