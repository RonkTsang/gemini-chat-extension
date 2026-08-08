export interface WaitForGeminiDomOptions {
  root?: ParentNode
  timeoutMs?: number
  intervalMs?: number
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT_MS = 7000
const DEFAULT_INTERVAL_MS = 100

export function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && element.offsetParent !== null
}

export function getVisibleDialogs(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .filter(isVisibleElement)
}

export async function waitForVisibleElement<T extends HTMLElement>(
  findElement: () => T | null,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    signal,
  }: Omit<WaitForGeminiDomOptions, 'root'> = {},
): Promise<T | null> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      return null
    }

    const element = findElement()
    if (isVisibleElement(element)) {
      return element
    }

    await wait(intervalMs, signal)
  }

  return null
}

export function waitForControlledMenu(
  trigger: HTMLElement,
  options: WaitForGeminiDomOptions = {},
): Promise<HTMLElement | null> {
  const controller = trigger.closest<HTMLElement>('[aria-controls]') ?? trigger
  const menuId = controller.getAttribute('aria-controls')
  if (!menuId) {
    return Promise.resolve(null)
  }

  const root = options.root ?? document
  return waitForVisibleElement(
    () => {
      const menu = Array.from(root.querySelectorAll<HTMLElement>('[role="menu"]'))
        .find(candidate => candidate.id === menuId) ?? null
      return menu?.getAttribute('data-visible') === 'true' ? menu : null
    },
    options,
  )
}

export function waitForNewVisibleDialog(
  existingDialogs: ReadonlySet<HTMLElement>,
  options: WaitForGeminiDomOptions = {},
): Promise<HTMLElement | null> {
  const root = options.root ?? document
  return waitForVisibleElement(
    () => getVisibleDialogs(root).find(dialog => !existingDialogs.has(dialog)) ?? null,
    options,
  )
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}
