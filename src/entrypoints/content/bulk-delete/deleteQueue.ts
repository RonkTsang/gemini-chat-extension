import {
  findActionMenuButton,
  findConversationRowByKey,
} from './deleteQueue.dom'

const DELETE_MENU_BUTTON_SELECTORS = [
  'button[data-test-id="delete-button"]',
  '[data-test-id*="delete" i]',
  'button[aria-label*="delete" i]',
  '[role="menuitem"][aria-label*="delete" i]',
]

const CONFIRM_DELETE_BUTTON_SELECTORS = [
  'mat-dialog-actions gem-button[cdkfocusinitial] button',
  'mat-dialog-actions [cdkfocusinitial] button',
  'button[data-test-id="confirm-button"]',
  '[data-test-id="confirm-button"]',
  'button[aria-label*="confirm" i]',
  'button[aria-label*="delete" i]',
]

const OVERLAY_SELECTORS = ['div.cdk-overlay-container', '[role="dialog"]', '.modal-container', '.overlay-container']

let forceBulkDeleteFailureForDev = false

export function setDevForceBulkDeleteFailure(enabled: boolean): void {
  if (import.meta.env.DEV) {
    forceBulkDeleteFailureForDev = enabled
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      reject(new Error('aborted'))
    }, { once: true })
  })
}

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && element.offsetParent !== null
}

function findFirstVisible(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (isVisibleElement(element) && !element.hasAttribute('disabled')) {
      return element
    }
  }
  return null
}

function findFirst(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element && !element.hasAttribute('disabled')) {
      return element
    }
  }
  return null
}

function getElementSearchText(element: Element): string {
  return [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('data-test-id'),
    element.getAttribute('class'),
    element.textContent,
  ].filter(Boolean).join(' ').toLowerCase()
}

function findFirstVisibleByKeywords(keywords: string[], root: ParentNode = document): HTMLElement | null {
  const normalizedKeywords = keywords.map(keyword => keyword.toLowerCase())
  return Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], [role="menuitem"]'))
    .find((element) => {
      if (!isVisibleElement(element) || element.hasAttribute('disabled')) {
        return false
      }
      const text = getElementSearchText(element)
      return normalizedKeywords.some(keyword => text.includes(keyword))
    }) ?? null
}

async function waitForActionable(
  selectors: string[],
  root: ParentNode = document,
  timeoutMs = 7000,
  signal?: AbortSignal,
  fallbackKeywords: string[] = [],
): Promise<HTMLElement | null> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      throw new Error('aborted')
    }
    const element = findFirstVisible(selectors, root)
      ?? (fallbackKeywords.length > 0 ? findFirstVisibleByKeywords(fallbackKeywords, root) : null)
    if (element) {
      return element
    }
    await wait(150, signal)
  }
  return null
}

function findConfirmDeleteButton(dialog: ParentNode): HTMLElement | null {
  const focusedConfirmButton = dialog.querySelector<HTMLElement>([
    'mat-dialog-actions gem-button[cdkfocusinitial] button:not([disabled])',
    'mat-dialog-actions [cdkfocusinitial] button:not([disabled])',
  ].join(','))

  return focusedConfirmButton ?? findFirstVisible(CONFIRM_DELETE_BUTTON_SELECTORS, dialog)
}

async function waitForRowRemoved(row: HTMLElement, timeoutMs = 15000, signal?: AbortSignal): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      throw new Error('aborted')
    }
    if (!document.body.contains(row) || row.offsetParent === null) {
      return
    }
    await wait(100, signal)
  }
  throw new Error('conversation row did not disappear')
}

async function deleteOneConversation(originalRow: HTMLElement, signal?: AbortSignal): Promise<void> {
  const conversationKey = originalRow.dataset.gpkConversationKey
  if (!conversationKey) {
    throw new Error('conversation key not found')
  }

  const row = findConversationRowByKey(conversationKey)
  if (!row) {
    throw new Error('conversation row not found')
  }

  row.scrollIntoView({ block: 'center', inline: 'nearest' })
  const actionButton = findActionMenuButton(row)
  if (!actionButton) {
    throw new Error('actions menu button not found')
  }

  actionButton.click()
  await wait(150, signal)

  const overlay = findFirst(OVERLAY_SELECTORS) ?? document
  const deleteButton = await waitForActionable(
    DELETE_MENU_BUTTON_SELECTORS,
    overlay,
    7000,
    signal,
    ['delete'],
  )
  if (!deleteButton) {
    throw new Error('delete menu item not found')
  }

  deleteButton.click()
  await wait(200, signal)

  const dialog = findFirst(['[role="dialog"]'], overlay) ?? overlay
  const confirmButton = findConfirmDeleteButton(dialog)
    ?? await waitForActionable(
      CONFIRM_DELETE_BUTTON_SELECTORS,
      dialog,
      7000,
      signal,
      ['delete', 'confirm', 'yes'],
    )
  if (!confirmButton) {
    throw new Error('confirm delete button not found')
  }

  confirmButton.click()
  await waitForRowRemoved(row, 15000, signal)
}

export type DeleteQueueResult = {
  status: 'completed'
  succeeded: number
} | {
  status: 'cancelled'
  succeeded: number
} | {
  status: 'failed'
  succeeded: number
  error: unknown
}

export interface DeleteQueueCallbacks {
  onDeleted?: () => Promise<void> | void
  onFailed?: () => Promise<void> | void
  onSkipped?: () => Promise<void> | void
}

export async function deleteConversationRows(
  rows: HTMLElement[],
  signal?: AbortSignal,
  callbacks: DeleteQueueCallbacks = {},
): Promise<DeleteQueueResult> {
  let succeeded = 0

  for (const row of Array.from(rows).reverse()) {
    if (signal?.aborted) {
      return { status: 'cancelled', succeeded }
    }
    if (!document.body.contains(row) && !row.dataset.gpkConversationKey) {
      await callbacks.onSkipped?.()
      continue
    }
    try {
      if (import.meta.env.DEV && forceBulkDeleteFailureForDev) {
        throw new Error('Bulk Delete failure forced by development debug flag')
      }
      await deleteOneConversation(row, signal)
      succeeded++
      await callbacks.onDeleted?.()
    } catch (error) {
      if (signal?.aborted) {
        return { status: 'cancelled', succeeded }
      }
      await callbacks.onFailed?.()
      return { status: 'failed', succeeded, error }
    }
  }

  return { status: 'completed', succeeded }
}

export const __deleteQueueTestApi = {
  findConfirmDeleteButton,
  findFirst,
}
