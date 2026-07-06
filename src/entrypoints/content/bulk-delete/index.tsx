import { createRoot, type Root } from 'react-dom/client'
import { t } from '@/utils/i18n'
import { BulkDeleteEntry } from './BulkDeleteEntry'
import {
  cleanupChatCheckboxes,
  ensureBulkMenu,
  ensureEntryMount,
  findBulkMenu,
  findChatHeader,
  getChatRows,
  isPinnedChatRow,
  loadLatestChatRows,
  reconcileChatCheckboxes,
  removeBulkMenu,
  removeEntryMount,
  shouldIgnoreBulkDeleteMutations,
  showLoadFailedWarning,
  updateBulkMenu,
} from './dom'
import { deleteConversationRows } from './deleteQueue'
import './style.css'

let observer: MutationObserver | null = null
let entryRoot: Root | null = null
let entryMount: HTMLElement | null = null
let reconcileFrame: number | null = null
let active = false
let loading = false
let deleting = false
let selectedKeys = new Set<string>()
let abortController: AbortController | null = null

function renderEntry(): void {
  const header = findChatHeader()
  if (!header) {
    return
  }

  const mount = ensureEntryMount(header)
  if (mount !== entryMount) {
    entryRoot?.unmount()
    entryMount = mount
    entryRoot = createRoot(mount)
  }

  entryRoot?.render(
    <BulkDeleteEntry
      active={active}
      onToggle={() => {
        if (active) {
          exitBulkDeleteMode()
        } else {
          enterBulkDeleteMode()
        }
      }}
    />,
  )
}

function updateMenu(): void {
  const header = findChatHeader()
  if (!header) {
    return
  }
  const menu = active
    ? ensureBulkMenu(header, {
      onSelectLatest: () => void selectLatest50(),
      onSelectUnpinned: selectUnpinned,
      onDelete: () => void deleteSelected(),
    })
    : findBulkMenu(header)

  if (menu) {
    updateBulkMenu(menu, selectedKeys.size, { loading, deleting })
  }
}

function handleCheckboxChange(key: string, selected: boolean): void {
  selectedKeys = new Set(selectedKeys)
  if (selected) {
    selectedKeys.add(key)
  } else {
    selectedKeys.delete(key)
  }
  updateMenu()
}

function syncCheckboxes(): void {
  if (!active) {
    return
  }

  reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
}

function reconcile(): void {
  reconcileFrame = null
  renderEntry()
  if (active) {
    syncCheckboxes()
    updateMenu()
  }
}

function scheduleReconcile(): void {
  if (reconcileFrame !== null) {
    return
  }
  reconcileFrame = window.requestAnimationFrame(reconcile)
}

function handleMutations(mutations: MutationRecord[]): void {
  if (shouldIgnoreBulkDeleteMutations(mutations)) {
    return
  }
  scheduleReconcile()
}

function enterBulkDeleteMode(): void {
  active = true
  selectedKeys = new Set()
  abortController = new AbortController()
  syncCheckboxes()
  updateMenu()
  renderEntry()
}

function exitBulkDeleteMode(): void {
  active = false
  loading = false
  deleting = false
  selectedKeys = new Set()
  abortController?.abort()
  abortController = null
  removeBulkMenu()
  cleanupChatCheckboxes()
  renderEntry()
}

async function selectLatest50(): Promise<void> {
  if (!active || loading || deleting) {
    return
  }

  loading = true
  updateMenu()
  abortController = new AbortController()

  try {
    const result = await loadLatestChatRows(50, selectedKeys, handleCheckboxChange, abortController.signal)
    if (!result.completed && result.reason !== 'scroller-not-found') {
      showLoadFailedWarning()
    }

    const rows = reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
    selectedKeys = new Set(rows.slice(0, 50).map(row => row.key))
    reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.warn('[BulkDelete] Failed to select latest chats:', error)
      showLoadFailedWarning()
    }
  } finally {
    loading = false
    updateMenu()
  }
}

function selectUnpinned(): void {
  if (!active || loading || deleting) {
    return
  }

  const nextSelectedKeys = new Set(selectedKeys)
  const rows = reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
  rows.forEach((row) => {
    if (!isPinnedChatRow(row.row)) {
      nextSelectedKeys.add(row.key)
    }
  })
  selectedKeys = nextSelectedKeys
  reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
  updateMenu()
}

async function deleteSelected(): Promise<void> {
  if (!active || loading || deleting || selectedKeys.size === 0) {
    return
  }

  const selectedCount = selectedKeys.size
  if (!window.confirm(t('bulkDelete.confirmDelete', String(selectedCount)))) {
    return
  }

  deleting = true
  updateMenu()
  abortController = new AbortController()

  try {
    const rowsToDelete = getChatRows()
      .filter(row => selectedKeys.has(row.key))
      .map(row => row.row)
    await deleteConversationRows(rowsToDelete, abortController.signal)
  } finally {
    deleting = false
    selectedKeys = new Set()
    cleanupChatCheckboxes()
    syncCheckboxes()
    updateMenu()
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!active || event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  event.preventDefault()
  exitBulkDeleteMode()
}

export function startBulkDelete(): void {
  if (observer) {
    return
  }

  renderEntry()
  observer = new MutationObserver(handleMutations)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
  document.addEventListener('keydown', handleKeyDown)
}

export function stopBulkDelete(): void {
  observer?.disconnect()
  observer = null
  document.removeEventListener('keydown', handleKeyDown)
  exitBulkDeleteMode()
  entryRoot?.unmount()
  entryRoot = null
  if (entryMount) {
    removeEntryMount(entryMount)
    entryMount = null
  }
  if (reconcileFrame !== null) {
    window.cancelAnimationFrame(reconcileFrame)
    reconcileFrame = null
  }
}

export const __bulkDeleteTestApi = {
  enterBulkDeleteMode,
  exitBulkDeleteMode,
  selectLatest50,
  selectUnpinned,
  deleteSelected,
}
