import { createRoot, type Root } from 'react-dom/client'
import { t } from '@/utils/i18n'
import { BulkDeleteEntryHint } from './BulkDeleteEntryHint'
import {
  cleanupChatCheckboxes,
  ensureBulkMenu,
  ensureEntryMount,
  findBulkMenu,
  findChatHeader,
  findHistoryScroller,
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
import { createDeleteProgressOverlay, type DeleteProgressOverlay } from './deleteProgressOverlay'
import { createStickyActionBar, type StickyActionBar } from './stickyActionBar'
import './style.css'

let observer: MutationObserver | null = null
let entryRoot: Root | null = null
let entryMount: HTMLElement | null = null
let reconcileFrame: number | null = null
let active = false
let loading = false
let deleting = false
let selectedKeys = new Set<string>()
let recentLimit = 50
let excludePinned = false
let abortController: AbortController | null = null
let deleteProgressOverlay: DeleteProgressOverlay | null = null
let stickyActionBar: StickyActionBar | null = null

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
    <BulkDeleteEntryHint
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
    stickyActionBar?.update({
      source: null,
      scroller: null,
      selectedCount: 0,
      disabled: true,
    })
    return
  }
  const menu = active
    ? ensureBulkMenu(header, {
      onSelectRecent: () => void selectRecent(),
      onRecentLimitChange: setRecentLimit,
      onExcludePinnedChange: setExcludePinned,
      onDeselectPinned: deselectPinned,
      onDeselectAll: clearSelection,
      onDelete: () => void deleteSelected(),
    })
    : findBulkMenu(header)

  if (menu) {
    updateBulkMenu(menu, selectedKeys.size, {
      loading,
      deleting,
      recentLimit,
      excludePinned,
      selectedPinnedCount: getSelectedPinnedKeys().size,
    })
  }

  stickyActionBar?.update({
    source: active ? menu : null,
    scroller: active ? findHistoryScroller() : null,
    selectedCount: active ? selectedKeys.size : 0,
    disabled: loading || deleting,
  })
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
  excludePinned = false
  abortController = new AbortController()
  stickyActionBar ??= createStickyActionBar({
    onDeselectAll: clearSelection,
    onDelete: () => void deleteSelected(),
  })
  syncCheckboxes()
  updateMenu()
  renderEntry()
}

function exitBulkDeleteMode(): void {
  active = false
  loading = false
  deleting = false
  selectedKeys = new Set()
  recentLimit = 50
  excludePinned = false
  abortController?.abort()
  abortController = null
  deleteProgressOverlay?.destroy()
  deleteProgressOverlay = null
  stickyActionBar?.destroy()
  stickyActionBar = null
  removeBulkMenu()
  cleanupChatCheckboxes()
  renderEntry()
}

async function selectRecent(): Promise<void> {
  if (!active || loading || deleting) {
    return
  }

  loading = true
  updateMenu()
  abortController = new AbortController()

  try {
    const result = await loadLatestChatRows(
      recentLimit,
      selectedKeys,
      handleCheckboxChange,
      abortController.signal,
      chatRow => !excludePinned || !isPinnedChatRow(chatRow.row),
    )
    if (!result.completed && result.reason !== 'scroller-not-found') {
      showLoadFailedWarning()
    }

    const rows = reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
    selectedKeys = new Set(
      rows
        .filter(chatRow => !excludePinned || !isPinnedChatRow(chatRow.row))
        .slice(0, recentLimit)
        .map(row => row.key),
    )
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

function setRecentLimit(limit: number): void {
  const nextLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  if (!active || loading || deleting || nextLimit === recentLimit) {
    return
  }

  recentLimit = nextLimit
  updateMenu()
}

function setExcludePinned(nextExcludePinned: boolean): void {
  if (!active || loading || deleting || nextExcludePinned === excludePinned) {
    return
  }

  excludePinned = nextExcludePinned
  updateMenu()
}

function getSelectedPinnedKeys(): Set<string> {
  return new Set(
    getChatRows()
      .filter(row => selectedKeys.has(row.key) && isPinnedChatRow(row.row))
      .map(row => row.key),
  )
}

function deselectPinned(): void {
  if (!active || loading || deleting) {
    return
  }

  const pinnedKeys = getSelectedPinnedKeys()
  if (pinnedKeys.size === 0) {
    return
  }

  selectedKeys = new Set([...selectedKeys].filter(key => !pinnedKeys.has(key)))
  reconcileChatCheckboxes(selectedKeys, handleCheckboxChange)
  updateMenu()
}

function clearSelection(): void {
  if (!active || loading || deleting || selectedKeys.size === 0) {
    return
  }

  selectedKeys = new Set()
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
    const titlesInDeleteOrder = [...rowsToDelete]
      .reverse()
      .map(row => row.link.textContent?.trim() || row.link.getAttribute('aria-label') || '')
    const elementsToDelete = rowsToDelete.map(row => row.row)
    deleteProgressOverlay = elementsToDelete.length >= 2
      ? createDeleteProgressOverlay(titlesInDeleteOrder)
      : null
    await deleteConversationRows(elementsToDelete, abortController.signal, {
      onDeleted: () => deleteProgressOverlay?.advance(),
      onFailed: () => deleteProgressOverlay?.discard(),
      onSkipped: () => deleteProgressOverlay?.discard(),
    })
    await deleteProgressOverlay?.finish()
  } finally {
    deleteProgressOverlay?.destroy()
    deleteProgressOverlay = null
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
  selectRecent,
  setRecentLimit,
  setExcludePinned,
  deselectPinned,
  deleteSelected,
}
