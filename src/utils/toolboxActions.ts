const TOOL_MENU_TRIGGER_SELECTOR = 'simplified-input-menu gem-icon-button > button'
const TOOLBOX_DRAWER_SELECTOR = 'toolbox-drawer'
const TOOLBOX_ITEM_SELECTOR = 'toolbox-drawer-item'
const TOOLBOX_ITEM_BUTTON_SELECTOR = 'button[role="menuitemcheckbox"]'
const UPLOAD_FILES_BUTTON_SELECTOR = 'uploader button[data-test-id="local-images-files-uploader-button"]'

const TOOL_ICON_NAMES = {
  image: 'image_create',
  music: 'music',
  canvas: 'canvas',
  deepResearch: 'deep_research',
} as const

export type GeminiTool = keyof typeof TOOL_ICON_NAMES

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

function getUploadFilesButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(UPLOAD_FILES_BUTTON_SELECTOR))
    .find(isElementVisible) ?? null
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
      attributeFilter: ['aria-expanded', 'aria-hidden', 'class', 'style'],
    })
  })
}

/** Opens Gemini's native Upload & tools menu. */
export async function openGeminiToolsMenu(): Promise<boolean> {
  if (hasOpenToolsMenu()) {
    return true
  }

  const trigger = document.querySelector<HTMLElement>(TOOL_MENU_TRIGGER_SELECTOR)
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') {
    return false
  }

  const menuPromise = waitForOpenToolsMenu()
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click()
  }

  return hasOpenToolsMenu() || menuPromise
}

/**
 * Opens Gemini's Upload & tools menu and activates one native tool.
 * Tool identity is based on Gemini's locale-neutral icon name.
 */
export async function launchGeminiTool(tool: GeminiTool): Promise<boolean> {
  if (!await openGeminiToolsMenu()) {
    return false
  }

  const drawer = getActiveToolboxDrawer()
  if (!drawer) {
    return false
  }

  const iconName = TOOL_ICON_NAMES[tool]
  const item = Array.from(drawer.querySelectorAll<HTMLElement>(TOOLBOX_ITEM_SELECTOR))
    .find((candidate) => candidate.querySelector(`mat-icon[data-mat-icon-name="${iconName}"]`))
  const button = item?.querySelector<HTMLElement>(TOOLBOX_ITEM_BUTTON_SELECTOR)

  if (!button || button.getAttribute('aria-disabled') === 'true') {
    return false
  }

  button.click()
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
