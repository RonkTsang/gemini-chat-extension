import chatWidthIconSvg from '@/assets/chat-width.svg?raw'
import { eventBus } from '@/utils/eventbus'
import { tt } from '@/utils/i18n'

const APP_ROOT_SELECTOR = 'chat-app-orchestrator#app-root'
const CHAT_APP_SELECTOR = 'chat-app'
const TOP_BAR_HOST_SELECTOR = 'main.chat-app'
const TOP_BAR_SELECTOR = 'top-bar-actions'
const RIGHT_SECTION_SELECTOR = '.right-section'

const THEME_CONTAINER_TEST_ID = 'gemini-power-kit-theme-top-bar-container'
const THEME_BUTTON_TEST_ID = 'gemini-power-kit-theme-top-bar-button'
const CHAT_SETTINGS_CONTAINER_TEST_ID =
  'gemini-power-kit-chat-settings-top-bar-container'
const CHAT_SETTINGS_BUTTON_TEST_ID =
  'gemini-power-kit-chat-settings-top-bar-button'
const STYLE_ID = 'gpk-theme-top-bar-action-style'

const THEME_ENTRY_SELECTOR =
  `[data-test-id="${THEME_CONTAINER_TEST_ID}"]`
const THEME_BUTTON_SELECTOR =
  `[data-test-id="${THEME_BUTTON_TEST_ID}"]`
const CHAT_SETTINGS_ENTRY_SELECTOR =
  `[data-test-id="${CHAT_SETTINGS_CONTAINER_TEST_ID}"]`
export const CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR =
  `[data-test-id="${CHAT_SETTINGS_BUTTON_TEST_ID}"]`
const ALL_ENTRY_SELECTOR =
  `${THEME_ENTRY_SELECTOR}, ${CHAT_SETTINGS_ENTRY_SELECTOR}`
const ALL_BUTTON_SELECTOR =
  `${THEME_BUTTON_SELECTOR}, ${CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR}`

const THEME_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
	<path d="M0 0h24v24H0z" fill="none" />
	<path fill="currentColor" d="M11.962 21q-1.839 0-3.471-.71q-1.633-.711-2.851-1.93T3.71 15.5T3 12q0-1.883.726-3.525t1.979-2.858t2.94-1.916T12.238 3q1.75 0 3.332.591q1.583.592 2.786 1.64q1.203 1.05 1.923 2.5t.72 3.165q0 2.318-1.336 3.71T16 16h-1.773q-.629 0-1.053.433t-.424 1.044q0 .627.375 1.064t.375 1.009q0 .73-.409 1.09q-.408.36-1.13.36M7.21 12.21q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m3-4q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m5 0q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29m3 4q.29-.29.29-.71t-.29-.71t-.71-.29t-.71.29t-.29.71t.29.71t.71.29t.71-.29M11.961 20q.263 0 .4-.115q.138-.116.138-.335q0-.35-.375-.748t-.375-1.31q0-1.088.725-1.79T14.25 15H16q1.88 0 2.94-1.107T20 10.896q0-3.044-2.341-4.97T12.239 4Q8.78 4 6.39 6.325T4 12q0 3.325 2.338 5.663T11.962 20" />
</svg>
`

type EntryKind = 'chat-settings' | 'theme'

let isStarted = false
let themeEnabled = false
let chatSettingsEnabled = false
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
  document.querySelector(
    `${APP_ROOT_SELECTOR} > ${CHAT_APP_SELECTOR} > ${TOP_BAR_HOST_SELECTOR}`,
  )

const getTopBar = (): HTMLElement | null =>
  getTopBarHost()?.querySelector(
    `:scope > ${TOP_BAR_SELECTOR}`,
  ) as HTMLElement | null

const getRightSection = (): HTMLElement | null =>
  getTopBar()?.querySelector(RIGHT_SECTION_SELECTOR) as HTMLElement | null

const setAttributeIfDifferent = (
  element: Element,
  name: string,
  value: string,
) => {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value)
  }
}

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
${ALL_ENTRY_SELECTOR} {
  align-items: center;
  display: flex;
  height: 48px;
  justify-content: center;
}

:is(${ALL_BUTTON_SELECTOR}) {
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

body.light-theme :is(${ALL_BUTTON_SELECTOR}),
:where(.theme-host):where(.light-theme) :is(${ALL_BUTTON_SELECTOR}) {
  color: rgb(0, 0, 0);
}

:is(${ALL_BUTTON_SELECTOR})::before {
  background-color: var(--mat-icon-button-state-layer-color, var(--mat-sys-on-surface-variant));
  border-radius: inherit;
  content: '';
  inset: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
}

:is(${ALL_BUTTON_SELECTOR}):hover::before {
  opacity: 0.08;
}

:is(${ALL_BUTTON_SELECTOR}):focus-visible {
  outline: 2px solid var(--gem-sys-color--primary, currentColor);
  outline-offset: 2px;
}

:is(${ALL_BUTTON_SELECTOR}) [data-gpk-top-bar-icon] {
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

:is(${ALL_BUTTON_SELECTOR}) svg {
  display: block;
}
`
  document.head.appendChild(style)
}

function selectors(kind: EntryKind) {
  return kind === 'theme'
    ? {
        containerTestId: THEME_CONTAINER_TEST_ID,
        buttonTestId: THEME_BUTTON_TEST_ID,
        entry: THEME_ENTRY_SELECTOR,
        button: THEME_BUTTON_SELECTOR,
      }
    : {
        containerTestId: CHAT_SETTINGS_CONTAINER_TEST_ID,
        buttonTestId: CHAT_SETTINGS_BUTTON_TEST_ID,
        entry: CHAT_SETTINGS_ENTRY_SELECTOR,
        button: CHAT_SETTINGS_TOP_BAR_BUTTON_SELECTOR,
      }
}

function openPanel(kind: EntryKind): void {
  if (kind === 'theme') {
    eventBus.emitSync('theme-floating-panel:open', {
      source: 'top-bar-action',
    })
    return
  }

  eventBus.emitSync('chat-settings-panel:toggle', {
    source: 'top-bar-action',
  })
}

function createEntry(kind: EntryKind): HTMLDivElement {
  const entrySelectors = selectors(kind)
  const container = document.createElement('div')
  container.className = 'buttons-container'
  container.dataset.testId = entrySelectors.containerTestId

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed'
  button.dataset.testId = entrySelectors.buttonTestId

  const icon = document.createElement('span')
  icon.dataset.gpkTopBarIcon = kind
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = kind === 'theme' ? THEME_ICON_SVG : chatWidthIconSvg
  button.appendChild(icon)

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openPanel(kind)
  })

  container.appendChild(button)
  return container
}

function decorateEntry(container: HTMLElement, kind: EntryKind): void {
  const entrySelectors = selectors(kind)
  const label = kind === 'theme'
    ? tt('settingPanel.config.theme.title', 'Theme')
    : tt('chatSettings.title', 'Chat layout')
  const button = container.querySelector<HTMLButtonElement>(
    entrySelectors.button,
  )
  if (!button) return

  setAttributeIfDifferent(container, 'class', 'buttons-container')
  setAttributeIfDifferent(button, 'aria-label', label)
  setAttributeIfDifferent(button, 'title', label)
}

function isEntryNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  return node.matches(ALL_ENTRY_SELECTOR) ||
    Boolean(node.closest(ALL_ENTRY_SELECTOR))
}

function isOnlyEntryInsertion(mutations: MutationRecord[]): boolean {
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

function disconnectObserver(
  observer: MutationObserver | null,
): null {
  observer?.disconnect()
  return null
}

function scheduleReconcile(): void {
  if (!isStarted || reconcileFrame !== null) return

  reconcileFrame = window.requestAnimationFrame(() => {
    reconcileFrame = null
    reconcile()
  })
}

function bindBootstrapObserver(): void {
  if (bootstrapObserver || getAppRoot()) return

  bootstrapObserver = new MutationObserver(() => {
    if (getAppRoot()) scheduleReconcile()
  })
  bootstrapObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

function bindAppRootObserver(appRoot: Element | null): void {
  if (observedAppRoot === appRoot) return
  appRootObserver = disconnectObserver(appRootObserver)
  observedAppRoot = appRoot

  if (!appRoot) return
  bootstrapObserver = disconnectObserver(bootstrapObserver)
  appRootObserver = new MutationObserver(scheduleReconcile)
  appRootObserver.observe(appRoot, { childList: true })
}

function bindChatAppObserver(chatApp: Element | null): void {
  if (observedChatApp === chatApp) return
  chatAppObserver = disconnectObserver(chatAppObserver)
  observedChatApp = chatApp

  if (!chatApp) return
  chatAppObserver = new MutationObserver(scheduleReconcile)
  chatAppObserver.observe(chatApp, { childList: true })
}

function bindTopBarHostObserver(topBarHost: Element | null): void {
  if (observedTopBarHost === topBarHost) return
  topBarHostObserver = disconnectObserver(topBarHostObserver)
  observedTopBarHost = topBarHost

  if (!topBarHost) return
  topBarHostObserver = new MutationObserver(scheduleReconcile)
  topBarHostObserver.observe(topBarHost, { childList: true })
}

function bindTopBarObserver(topBar: Element | null): void {
  if (observedTopBar === topBar) return
  topBarObserver = disconnectObserver(topBarObserver)
  observedTopBar = topBar

  if (!topBar) return
  topBarObserver = new MutationObserver((mutations) => {
    if (!isOnlyEntryInsertion(mutations)) scheduleReconcile()
  })
  topBarObserver.observe(topBar, { childList: true, subtree: true })
}

function bindRightSectionObserver(rightSection: Element | null): void {
  if (observedRightSection === rightSection) return
  rightSectionObserver = disconnectObserver(rightSectionObserver)
  observedRightSection = rightSection

  if (!rightSection) return
  rightSectionObserver = new MutationObserver((mutations) => {
    if (!isOnlyEntryInsertion(mutations)) scheduleReconcile()
  })
  rightSectionObserver.observe(rightSection, { childList: true })
}

function ensureObserverBindings(): void {
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

function ensureEntry(
  rightSection: HTMLElement,
  kind: EntryKind,
): HTMLElement {
  const entrySelectors = selectors(kind)
  const existingEntry = rightSection.querySelector<HTMLElement>(
    `:scope > ${entrySelectors.entry}`,
  )
  const existingButton = existingEntry?.querySelector(
    entrySelectors.button,
  )
  const existingIcon = existingButton?.querySelector(
    `[data-gpk-top-bar-icon="${kind}"]`,
  )
  const entry = existingEntry && existingButton && existingIcon
    ? existingEntry
    : createEntry(kind)

  if (existingEntry && existingEntry !== entry) existingEntry.remove()
  document.querySelectorAll<HTMLElement>(entrySelectors.entry).forEach(
    (candidate) => {
      if (candidate !== entry) candidate.remove()
    },
  )
  decorateEntry(entry, kind)
  return entry
}

function insertEntries(
  rightSection: HTMLElement,
  entries: HTMLElement[],
): void {
  const nativeChildren = Array.from(rightSection.children).filter(
    (element) => !element.matches(ALL_ENTRY_SELECTOR),
  )
  let nextElement = nativeChildren.at(-1) ?? null

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry) continue
    if (
      entry.parentElement !== rightSection ||
      entry.nextElementSibling !== nextElement
    ) {
      rightSection.insertBefore(entry, nextElement)
    }
    nextElement = entry
  }
}

function reconcile(): void {
  if (!isStarted) return

  ensureObserverBindings()
  const rightSection = getRightSection()
  if (!rightSection) return

  ensureStyle()
  const entries: HTMLElement[] = []
  if (chatSettingsEnabled) {
    entries.push(ensureEntry(rightSection, 'chat-settings'))
  } else {
    document.querySelectorAll(CHAT_SETTINGS_ENTRY_SELECTOR)
      .forEach((entry) => entry.remove())
  }
  if (themeEnabled) {
    entries.push(ensureEntry(rightSection, 'theme'))
  } else {
    document.querySelectorAll(THEME_ENTRY_SELECTOR)
      .forEach((entry) => entry.remove())
  }
  insertEntries(rightSection, entries)

  if (chatSettingsEnabled) {
    eventBus.emitSync('chat-settings-panel:anchor-changed', undefined)
  }
}

function stopObservers(): void {
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

function removeInjectedResources(): void {
  document.querySelectorAll(ALL_ENTRY_SELECTOR)
    .forEach((entry) => entry.remove())
  document.getElementById(STYLE_ID)?.remove()
}

function stopLifecycleIfUnused(): void {
  if (themeEnabled || chatSettingsEnabled || !isStarted) return
  isStarted = false
  window.removeEventListener('beforeunload', stopAllTopBarActions)
  stopObservers()
  removeInjectedResources()
}

function startLifecycle(): void {
  if (!isStarted) {
    isStarted = true
    removeInjectedResources()
    window.addEventListener('beforeunload', stopAllTopBarActions)
  }
  reconcile()
}

function stopAllTopBarActions(): void {
  themeEnabled = false
  chatSettingsEnabled = false
  if (!isStarted) return
  isStarted = false
  window.removeEventListener('beforeunload', stopAllTopBarActions)
  stopObservers()
  removeInjectedResources()
}

export function startTopBarAction(): void {
  if (themeEnabled) return
  themeEnabled = true
  startLifecycle()
}

export function stopTopBarAction(): void {
  if (!themeEnabled) return
  themeEnabled = false
  document.querySelectorAll(THEME_ENTRY_SELECTOR)
    .forEach((entry) => entry.remove())
  if (chatSettingsEnabled) reconcile()
  stopLifecycleIfUnused()
}

export function startChatSettingsTopBarAction(): void {
  if (chatSettingsEnabled) return
  chatSettingsEnabled = true
  startLifecycle()
}

export function stopChatSettingsTopBarAction(): void {
  if (!chatSettingsEnabled) return
  chatSettingsEnabled = false
  document.querySelectorAll(CHAT_SETTINGS_ENTRY_SELECTOR)
    .forEach((entry) => entry.remove())
  eventBus.emitSync('chat-settings-panel:close', {
    source: 'shortcut-hidden',
  })
  if (themeEnabled) reconcile()
  stopLifecycleIfUnused()
}
