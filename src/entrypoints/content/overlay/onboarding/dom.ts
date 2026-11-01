export type TourTarget = 'chat-width' | 'theme' | 'bulk-delete' | 'settings-entry'
export const TOUR_TARGETS: readonly TourTarget[] = [
  'chat-width', 'theme', 'bulk-delete', 'settings-entry',
]

export function isForegroundChat(): boolean {
  return document.visibilityState === 'visible'
    && document.hasFocus()
    && /^(?:\/u\/\d+)?\/app(?:\/[^/]+)?\/?$/.test(location.pathname)
    && document.querySelector('chat-app-orchestrator#app-root > chat-app > main.chat-app') !== null
}

export function resolveTarget(target: TourTarget): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(`[data-gpk-tour="${target}"]`)
  if (matches.length !== 1) return null
  const element = matches[0]
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  if (!element.isConnected || rect.width <= 0 || rect.height <= 0
    || style.visibility !== 'visible' || style.display === 'none'
    || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) {
    return null
  }
  return element
}

export function ensureSidebarExpanded(): void {
  // Observed native collapsed-sidebar control; absence means no safe action.
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    'side-nav-sparkle-button > button[data-test-id="side-nav-sparkle-button"][aria-expanded="false"]',
  )
  if (buttons.length === 1) buttons[0].click()
}

export function waitForElement<T>(
  resolve: () => T | null,
  signal: AbortSignal,
): Promise<T | null> {
  return new Promise((finish) => {
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + 1000
    const done = (value: T | null) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      finish(value)
    }
    const abort = () => done(null)
    const check = () => {
      if (signal.aborted) return done(null)
      const value = resolve()
      if (value || Date.now() >= deadline) return done(value)
      timer = setTimeout(check, 50)
    }
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
}
