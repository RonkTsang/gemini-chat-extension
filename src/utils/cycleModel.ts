const MODE_TRIGGER_SELECTOR = 'button[data-test-id="bard-mode-menu-button"]'
const VISIBLE_MODE_MENU_SELECTOR = '[role="menu"][data-test-id="gem-mode-menu"][data-visible="true"]'
const MODE_ITEM_SELECTOR = 'gem-menu-item[role="menuitem"][data-mode-id]'

function getVisibleModeMenu(trigger: HTMLElement): HTMLElement | null {
  const controlledMenuId = trigger.getAttribute('aria-controls')
  const controlledMenu = controlledMenuId
    ? document.getElementById(controlledMenuId)
    : null

  if (controlledMenu?.matches(VISIBLE_MODE_MENU_SELECTOR)) {
    return controlledMenu
  }

  return document.querySelector<HTMLElement>(VISIBLE_MODE_MENU_SELECTOR)
}

function waitForVisibleModeMenu(trigger: HTMLElement, timeoutMs = 1500): Promise<HTMLElement | null> {
  const existingMenu = getVisibleModeMenu(trigger)
  if (existingMenu) {
    return Promise.resolve(existingMenu)
  }

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const menu = getVisibleModeMenu(trigger)
      if (!menu) {
        return
      }

      window.clearTimeout(timeout)
      observer.disconnect()
      resolve(menu)
    })

    const timeout = window.setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeoutMs)

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-visible', 'id'],
    })
  })
}

function isSelectedModeItem(item: HTMLElement): boolean {
  return item.classList.contains('selected')
    || item.getAttribute('aria-selected') === 'true'
    || item.getAttribute('aria-checked') === 'true'
}

/**
 * Selects the next Gemini model in the mode menu's current DOM order.
 *
 * Extended thinking entries are excluded because they do not carry a
 * `data-mode-id`, unlike actual model entries.
 */
export async function cycleGeminiModel(): Promise<boolean> {
  const trigger = document.querySelector<HTMLElement>(MODE_TRIGGER_SELECTOR)
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') {
    return false
  }

  let menu = getVisibleModeMenu(trigger)
  if (!menu) {
    const menuPromise = waitForVisibleModeMenu(trigger)
    trigger.click()
    menu = await menuPromise
  }

  if (!menu) {
    return false
  }

  const modeItems = Array.from(menu.querySelectorAll<HTMLElement>(MODE_ITEM_SELECTOR))
    .filter(item => item.getAttribute('aria-disabled') !== 'true')
  const selectedIndex = modeItems.findIndex(isSelectedModeItem)

  if (modeItems.length < 2 || selectedIndex === -1) {
    return false
  }

  modeItems[(selectedIndex + 1) % modeItems.length].click()
  return true
}
