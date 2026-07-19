import { logDevEvent } from '@/utils/devLogger'

const TOOL_MENU_TRIGGER_SELECTOR = 'simplified-input-menu gem-icon-button > button'
const TOOLBOX_DRAWER_SELECTOR = 'toolbox-drawer'
const TOOLBOX_ITEM_SELECTOR = 'toolbox-drawer-item'
const TOOLBOX_ITEM_BUTTON_SELECTOR = 'button[role="menuitemcheckbox"]'
const UPLOAD_FILES_BUTTON_SELECTOR = 'uploader button[data-test-id="local-images-files-uploader-button"]'
const TOOL_READY_TIMEOUT_MS = 1_500
const MENU_MUTATION_ATTRIBUTES = ['aria-hidden', 'aria-disabled', 'class', 'style']

const TOOL_ICON_NAMES = {
  image: 'image_create',
  video: 'movie',
  music: 'music',
  canvas: 'canvas',
  deepResearch: 'deep_research',
} as const

export type GeminiTool = keyof typeof TOOL_ICON_NAMES

interface ToolLaunchAttempt {
  id: string
  tool: GeminiTool
  startedAt: number
}

let toolLaunchSequence = 0

function isElementVisible(element: HTMLElement): boolean {
  let currentElement: HTMLElement | null = element

  while (currentElement) {
    if (currentElement.hidden || currentElement.getAttribute('aria-hidden') === 'true') {
      return false
    }

    const styles = window.getComputedStyle(currentElement)
    if (styles.display === 'none' || styles.visibility === 'hidden') {
      return false
    }

    currentElement = currentElement.parentElement
  }

  return true
}

function getActiveToolboxDrawer(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(TOOLBOX_DRAWER_SELECTOR))
    .find((drawer) => isElementVisible(drawer) && drawer.querySelector(TOOLBOX_ITEM_SELECTOR)) ?? null
}

function findReadyToolButton(tool: GeminiTool): HTMLElement | null {
  const iconName = TOOL_ICON_NAMES[tool]

  for (const drawer of document.querySelectorAll<HTMLElement>(TOOLBOX_DRAWER_SELECTOR)) {
    if (!isElementVisible(drawer)) {
      continue
    }

    const item = Array.from(drawer.querySelectorAll<HTMLElement>(TOOLBOX_ITEM_SELECTOR))
      .find((candidate) => candidate.querySelector(`mat-icon[data-mat-icon-name="${iconName}"]`))
    const button = item?.querySelector<HTMLElement>(TOOLBOX_ITEM_BUTTON_SELECTOR)

    if (
      button
      && isElementVisible(button)
      && button.getAttribute('aria-disabled') !== 'true'
    ) {
      return button
    }
  }

  return null
}

function getToolboxObservationRoots(): HTMLElement[] {
  const roots = new Set<HTMLElement>()
  const trigger = document.querySelector<HTMLElement>(TOOL_MENU_TRIGGER_SELECTOR)
  const menu = trigger?.closest<HTMLElement>('simplified-input-menu')
  const overlayContainer = document.querySelector<HTMLElement>('.cdk-overlay-container')

  if (menu) {
    roots.add(menu)
  }

  if (overlayContainer) {
    roots.add(overlayContainer)
  }

  for (const drawer of document.querySelectorAll<HTMLElement>(TOOLBOX_DRAWER_SELECTOR)) {
    if (isElementVisible(drawer) && drawer.parentElement) {
      roots.add(drawer.parentElement)
    }
  }

  // Gemini creates CDK's overlay container lazily in some sessions. Keep the
  // broad fallback only until the menu-specific roots are available.
  if (!overlayContainer) {
    roots.add(document.body)
  }

  return Array.from(roots)
}

function areSameElements(left: HTMLElement[], right: HTMLElement[]): boolean {
  return left.length === right.length && left.every((element, index) => element === right[index])
}

/**
 * Waits only for the requested native tool, narrowing the observer to the
 * input menu and CDK overlay roots as soon as Gemini mounts the menu.
 */
function waitForGeminiToolButton(
  tool: GeminiTool,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  const readyButton = findReadyToolButton(tool)
  if (readyButton) {
    return Promise.resolve(readyButton)
  }

  return new Promise((resolve) => {
    let settled = false
    let observationRoots: HTMLElement[] = []

    const cleanup = () => {
      window.clearTimeout(timeout)
      observer.disconnect()
      signal.removeEventListener('abort', abort)
      observationRoots = []
    }

    const finish = (button: HTMLElement | null) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(button)
    }

    const observeMenuRoots = () => {
      const nextRoots = getToolboxObservationRoots()
      if (areSameElements(nextRoots, observationRoots)) {
        return
      }

      observer.disconnect()
      observationRoots = nextRoots
      for (const root of observationRoots) {
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: MENU_MUTATION_ATTRIBUTES,
        })
      }
    }

    const checkForReadyButton = () => {
      const button = findReadyToolButton(tool)
      if (button) {
        finish(button)
        return
      }

      observeMenuRoots()
    }

    const observer = new MutationObserver(checkForReadyButton)
    const timeout = window.setTimeout(() => finish(null), timeoutMs)
    const abort = () => finish(null)

    if (signal.aborted) {
      finish(null)
      return
    }

    signal.addEventListener('abort', abort, { once: true })
    observeMenuRoots()
  })
}

function getUploadFilesButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(UPLOAD_FILES_BUTTON_SELECTOR))
    .find(isElementVisible) ?? null
}

function getToolboxDiagnostics() {
  const drawers = Array.from(document.querySelectorAll<HTMLElement>(TOOLBOX_DRAWER_SELECTOR))

  return {
    drawerCount: drawers.length,
    drawers: drawers.map((drawer, index) => ({
      index,
      visible: isElementVisible(drawer),
      ariaHidden: drawer.getAttribute('aria-hidden'),
      itemCount: drawer.querySelectorAll(TOOLBOX_ITEM_SELECTOR).length,
      iconNames: Array.from(drawer.querySelectorAll<HTMLElement>('mat-icon[data-mat-icon-name]'))
        .map((icon) => icon.getAttribute('data-mat-icon-name'))
        .filter((iconName): iconName is string => Boolean(iconName)),
    })),
    uploadFilesButtonVisible: Boolean(getUploadFilesButton()),
  }
}

function logToolLaunch(
  level: 'info' | 'warn',
  event: string,
  attempt: ToolLaunchAttempt,
  details: Record<string, unknown> = {},
): void {
  logDevEvent(level, '[Shortcut Tools]', event, {
    attemptId: attempt.id,
    tool: attempt.tool,
    elapsedMs: Date.now() - attempt.startedAt,
    ...details,
  })
}

function hasOpenToolsMenu(): boolean {
  return Boolean(getActiveToolboxDrawer() || getUploadFilesButton())
}

function waitForOpenToolsMenu(timeoutMs = 1500): Promise<boolean> {
  if (hasOpenToolsMenu()) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!hasOpenToolsMenu()) {
        return
      }

      window.clearTimeout(timeout)
      observer.disconnect()
      resolve(true)
    })

    const timeout = window.setTimeout(() => {
      observer.disconnect()
      resolve(false)
    }, timeoutMs)

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded', ...MENU_MUTATION_ATTRIBUTES],
    })
  })
}

function triggerGeminiToolsMenu(attempt?: ToolLaunchAttempt): boolean {
  if (hasOpenToolsMenu()) {
    if (attempt) {
      logToolLaunch('info', 'menu-already-open', attempt, getToolboxDiagnostics())
    }
    return true
  }

  const trigger = document.querySelector<HTMLElement>(TOOL_MENU_TRIGGER_SELECTOR)
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') {
    if (attempt) {
      logToolLaunch('warn', 'menu-trigger-unavailable', attempt, {
        triggerFound: Boolean(trigger),
        triggerAriaDisabled: trigger?.getAttribute('aria-disabled') ?? null,
        ...getToolboxDiagnostics(),
      })
    }
    return false
  }

  if (trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click()
    if (attempt) {
      logToolLaunch('info', 'menu-trigger-clicked', attempt, {
        triggerAriaExpanded: trigger.getAttribute('aria-expanded'),
      })
    }
  }

  return true
}

/** Opens Gemini's native Upload & tools menu. */
export async function openGeminiToolsMenu(attempt?: ToolLaunchAttempt): Promise<boolean> {
  if (!triggerGeminiToolsMenu(attempt)) {
    return false
  }

  if (hasOpenToolsMenu()) {
    return true
  }

  const menuPromise = waitForOpenToolsMenu()
  const opened = await menuPromise
  if (attempt) {
    logToolLaunch(opened ? 'info' : 'warn', 'menu-open-result', attempt, {
      opened,
      openedImmediately: false,
      ...getToolboxDiagnostics(),
    })
  }

  return opened
}

/**
 * Opens Gemini's Upload & tools menu and activates one native tool.
 * Tool identity is based on Gemini's locale-neutral icon name.
 */
export async function launchGeminiTool(tool: GeminiTool): Promise<boolean> {
  const attempt: ToolLaunchAttempt = {
    id: `${tool}-${Date.now()}-${++toolLaunchSequence}`,
    tool,
    startedAt: Date.now(),
  }
  logToolLaunch('info', 'launch-started', attempt)

  const abortController = new AbortController()
  const toolButtonPromise = waitForGeminiToolButton(tool, TOOL_READY_TIMEOUT_MS, abortController.signal)

  if (!triggerGeminiToolsMenu(attempt)) {
    abortController.abort()
    logToolLaunch('warn', 'launch-aborted-menu-not-open', attempt)
    return false
  }

  const button = await toolButtonPromise

  if (!button) {
    logToolLaunch('warn', 'launch-aborted-tool-ready-timeout', attempt, {
      timeoutMs: TOOL_READY_TIMEOUT_MS,
      expectedIconName: TOOL_ICON_NAMES[tool],
      ...getToolboxDiagnostics(),
    })
    return false
  }

  logToolLaunch('info', 'tool-ready', attempt, {
    expectedIconName: TOOL_ICON_NAMES[tool],
    ...getToolboxDiagnostics(),
  })
  button.click()
  logToolLaunch('info', 'tool-click-dispatched', attempt, {
    expectedIconName: TOOL_ICON_NAMES[tool],
    buttonAriaChecked: button.getAttribute('aria-checked'),
    buttonConnected: button.isConnected,
  })
  return true
}

/** Opens Gemini's native local file picker from the Upload & tools menu. */
export async function openUploadFilesDialog(): Promise<boolean> {
  if (!await openGeminiToolsMenu()) {
    return false
  }

  const button = getUploadFilesButton()
  if (!button || button.getAttribute('aria-disabled') === 'true') {
    return false
  }

  button.click()
  return true
}
