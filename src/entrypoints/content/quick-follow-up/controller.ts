import './style.css'
import 'tippy.js/dist/tippy.css'

import { toaster } from '@/components/ui/toaster'
import { type AppEvents } from '@/common/event'
import { QUICK_FOLLOW_PLACEHOLDER, type QuickFollowPrompt } from '@/domain/quick-follow/types'
import { quickFollowStore } from '@/stores/quickFollowStore'
import { t } from '@/utils/i18n'
import { i18nCache } from '@/utils/i18nCache'
import { eventBus } from '@/utils/eventbus'
import { logDevEvent } from '@/utils/devLogger'
import { browser } from 'wxt/browser'
import { createHistoryAnchorTracker } from './history-anchors'
import { closeActiveFollowUpPopovers, mountDraftCards, renderHistory, restoreHistory } from './cards'
import {
  appendRequestText,
  captureCandidate,
  captureEditorDraft,
  hasEditorDraft,
  hideNativeAskMenu,
  getConversationScope,
  isReadyToSubmit,
  listUserQueries,
  queriesAffectedBy,
  removedUserQueries,
  chatWindowAddedOrRemoved,
  editorStructureChanged,
  currentSentinelIds,
  findCurrentChatWindow,
  jumpToQuoteAnchor,
  highlightQuoteAnchor,
  readQuoteAnchorPosition,
  jumpToQuoteSource,
  clearQuoteHighlight,
  observeSubmissionClearTransition,
  readRequest,
  replaceRequestText,
  resolveInput,
  resolveEditor,
  resolveInputContainer,
  resolveMessageContent,
  resolveNativeSubmitButton,
  restoreEditorDraft,
  writePrefix,
  syncRequestHeading,
  type Candidate,
  type EditorSnapshot,
  type EditorBinding,
} from './dom'
import { effectiveComment, MAX_SELECTIONS, type SelectionItem, type QuoteAnchor } from './protocol'

const NOTICE_KEYS = [
  'quickFollow.multiSelection.addFailed',
  'quickFollow.multiSelection.maxSelections',
  'quickFollow.multiSelection.updateFailed',
  'quickFollow.multiSelection.sendFailed',
  'quickFollow.multiSelection.unsupportedDraft',
] as const

export type FollowUpUI =
  | { mode: 'closed' }
  | { mode: 'capsule'; candidate: Candidate; hasDraftCards: boolean }
  | { mode: 'comment'; selectionId: string; selectionText: string; commentDraft: string; position: Candidate['position']; sourceAnchor?: QuoteAnchor }

export type FollowUpController = ReturnType<typeof createFollowUpController>

type DraftBackup = {
  scope: string
  items: SelectionItem[]
  editorState: EditorSnapshot
  editor: HTMLElement
  request: string
  cleared: boolean
  clearObserver?: () => void
}

function copyItems(items: readonly SelectionItem[]): SelectionItem[] {
  return items.map(item => ({ ...item, anchor: item.anchor ? { ...item.anchor } : undefined }))
}

function expandPrompt(prompt: QuickFollowPrompt, candidate: Candidate): string {
  return prompt.template.split(QUICK_FOLLOW_PLACEHOLDER).join(candidate.text)
}

function notice(key: string, action?: { label: string; onClick: () => void }): void {
  toaster.create({ type: 'error', title: t(key), action })
}

export function createFollowUpController(
  onUIChange: (ui: FollowUpUI) => void,
  onSelectionsChange: (items: readonly SelectionItem[]) => void = () => undefined,
) {
  let started = false
  let enabled = quickFollowStore.getState().settings.enabled
  let items: SelectionItem[] = []
  let currentUI: FollowUpUI = { mode: 'closed' }
  let chatWindow: HTMLElement | null = null
  let binding: EditorBinding | null = null
  let cards: ReturnType<typeof mountDraftCards> | null = null
  let bodyObserver: MutationObserver | null = null
  let chatObserver: MutationObserver | null = null
  let editorObserver: MutationObserver | null = null
  let editorInputCleanup: (() => void) | null = null
  let settingsUnsubscribe: (() => void) | null = null
  let restoreNativeAskMenu: (() => void) | null = null
  let promptSend: object | null = null
  let followUpSend: object | null = null
  const historyAnchors = createHistoryAnchorTracker()
  let backup: DraftBackup | null = null
  const cancelReadinessWaits = new Set<() => void>()
  let currentScope = getConversationScope()
  let historyDisposers = new Map<Element, () => void>()

  const setUI = (ui: FollowUpUI) => {
    const sameComment = ui.mode === 'comment' && currentUI.mode === 'comment'
      && ui.selectionId === currentUI.selectionId
    if (!sameComment) {
      if (currentUI.mode === 'comment') clearQuoteHighlight()
      if (ui.mode === 'comment') {
        const anchor = items.find(item => item.id === ui.selectionId)?.anchor
        if (anchor) highlightQuoteAnchor(anchor)
      }
    }
    currentUI = ui
    onUIChange(ui)
  }

  const syncCards = () => {
    historyAnchors.update(items, chatWindow, currentScope)
    cards?.render(items)
    cards?.setDisabled(isBusy())
    const commentId = currentUI.mode === 'comment' ? currentUI.selectionId : null
    if (commentId && !items.some(item => item.id === commentId)) {
      setUI({ mode: 'closed' })
    }
    onSelectionsChange(chatWindow ? copyItems(items) : [])
  }

  const clearBackup = () => {
    backup?.clearObserver?.()
    backup = null
  }

  const dismissNotice = (key: string) => notice(key)

  const resolveCurrentBinding = (): EditorBinding | null => chatWindow ? resolveEditor(chatWindow) : null
  const isCurrentBinding = (candidate: EditorBinding | null): candidate is EditorBinding => {
    if (!candidate || !candidate.editor.isConnected || !candidate.chatWindow.isConnected) return false
    const live = resolveCurrentBinding()
    return live?.editor === candidate.editor && live.richTextarea === candidate.richTextarea
  }

  const mountEditor = (nextBinding: EditorBinding) => {
    if (binding?.editor === nextBinding.editor) {
      binding = nextBinding
      return
    }
    editorObserver?.disconnect()
    editorInputCleanup?.()
    cards?.destroy()
    binding = nextBinding
    cards = mountDraftCards(nextBinding.editor, {
      onRemove: id => remove(id),
      onComment: id => openQuickComment(id),
      onJumpToSource: id => {
        const anchor = items.find(item => item.id === id)?.anchor
        if (anchor) jumpToQuoteAnchor(anchor)
      },
    })
    syncCards()
    if (enabled && items.length && !writePrefix(nextBinding.editor, items)) {
      dismissNotice('quickFollow.multiSelection.updateFailed')
    }
    if (backup?.scope === currentScope && backup.editor !== nextBinding.editor) {
      backup.clearObserver?.()
      backup.editor = nextBinding.editor
      backup.cleared ||= readRequest(nextBinding.editor) === ''
      if (!restoreBackup()) observeBackupClear(backup)
    }
    let composing = false
    const reconcileDraft = () => {
      if (!enabled || !isCurrentBinding(nextBinding) || composing) return
      const liveIds = new Set(currentSentinelIds(nextBinding.editor))
      const next = items.filter(item => liveIds.has(item.id))
      if (next.length !== items.length) {
        historyAnchors.retire()
        items = next
        syncCards()
        if (!writePrefix(nextBinding.editor, items)) dismissNotice('quickFollow.multiSelection.updateFailed')
      } else {
        syncRequestHeading(nextBinding.editor, items.length > 0)
      }
    }
    const onCompositionStart = () => { composing = true }
    const onCompositionEnd = () => { composing = false; reconcileDraft() }
    nextBinding.editor.addEventListener('input', reconcileDraft)
    nextBinding.editor.addEventListener('compositionstart', onCompositionStart)
    nextBinding.editor.addEventListener('compositionend', onCompositionEnd)
    editorInputCleanup = () => {
      nextBinding.editor.removeEventListener('input', reconcileDraft)
      nextBinding.editor.removeEventListener('compositionstart', onCompositionStart)
      nextBinding.editor.removeEventListener('compositionend', onCompositionEnd)
    }
    editorObserver = new MutationObserver(reconcileDraft)
    editorObserver.observe(nextBinding.editor, { childList: true, characterData: true, subtree: true })
  }

  const renderQuery = (query: Element) => {
    historyAnchors.link(query, currentScope)
    const dispose = renderHistory(query, i18nCache.get('regardingThis'), { onJumpToSource: jumpToQuoteSource })
    historyDisposers.set(query, dispose)
  }

  const reconcileAffectedQueries = (records: readonly MutationRecord[]) => {
    if (!chatWindow) return
    for (const query of removedUserQueries(records)) {
      historyDisposers.get(query)?.()
      historyDisposers.delete(query)
    }
    for (const query of queriesAffectedBy(records, chatWindow)) {
      renderQuery(query)
    }
  }

  const attachChatWindow = (nextWindow: HTMLElement | null) => {
    if (chatWindow === nextWindow) {
      const nextBinding = resolveCurrentBinding()
      if (nextBinding) mountEditor(nextBinding)
      return
    }
    detachChatWindow()
    if (!nextWindow) return
    chatWindow = nextWindow
    binding = null
    chatWindow.addEventListener('mouseup', handleMouseUp)
    chatObserver = new MutationObserver(records => {
      reconcileAffectedQueries(records)
      if (!editorStructureChanged(records)) return
      const nextBinding = resolveCurrentBinding()
      if (nextBinding) {
        if (binding?.editor !== nextBinding.editor) cancelReadinessWaits.forEach(cancel => cancel())
        mountEditor(nextBinding)
      } else {
        cancelReadinessWaits.forEach(cancel => cancel())
      }
    })
    chatObserver.observe(chatWindow, { childList: true, subtree: true, characterData: true })
    const nextBinding = resolveCurrentBinding()
    if (nextBinding) mountEditor(nextBinding)
    listUserQueries(chatWindow).forEach(renderQuery)
  }

  const detachChatWindow = () => {
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding) writePrefix(binding.editor, [])
    if (chatWindow) {
      chatWindow.removeEventListener('mouseup', handleMouseUp)
    }
    chatObserver?.disconnect()
    editorObserver?.disconnect()
    editorInputCleanup?.()
    editorInputCleanup = null
    backup?.clearObserver?.()
    chatObserver = null
    editorObserver = null
    cards?.destroy()
    cards = null
    binding = null
    for (const dispose of historyDisposers.values()) dispose()
    historyDisposers.clear()
    chatWindow = null
    onSelectionsChange([])
    clearQuoteHighlight()
  }

  const restoreBackup = (): boolean => {
    const state = backup
    if (!state?.cleared || !started || !enabled || state.scope !== currentScope
      || getConversationScope() !== state.scope) return false
    const currentBinding = resolveCurrentBinding()
    if (currentBinding?.editor !== state.editor || readRequest(state.editor) !== '') return false
    const previous = items
    items = copyItems(state.items)
    if (!restoreEditorDraft(state.editor, state.editorState)) {
      items = previous
      return false
    }
    clearBackup()
    syncCards()
    return true
  }

  const observeBackupClear = (state: DraftBackup | null) => {
    if (!state || state.cleared) return
    state.clearObserver?.()
    state.clearObserver = observeSubmissionClearTransition(state.editor, state.request, () => {
      if (backup !== state) return
      state.cleared = true
      restoreBackup()
    })
  }

  const sendFollowUp = async (): Promise<boolean> => {
    const currentBinding = resolveCurrentBinding()
    if (!started || !enabled || !currentBinding || !items.length || promptSend || followUpSend) return false
    const request = readRequest(currentBinding.editor)
    if (request === null || !writePrefix(currentBinding.editor, items)) {
      notice('quickFollow.multiSelection.updateFailed')
      return false
    }
    const scope = currentScope
    const draft = items
    const operation = {}
    followUpSend = operation
    const valid = () => followUpSend === operation && currentScope === scope && !isBusy()
      && items === draft && readRequest(currentBinding.editor) === request
    closeActiveFollowUpPopovers()
    try {
      currentBinding.editor.dispatchEvent(new Event('input', { bubbles: true }))
      const ready = await waitUntilReady(currentBinding, valid)
      if (!ready || !valid() || !isCurrentBinding(currentBinding)) {
        if (started && enabled && currentScope === scope) notice('quickFollow.multiSelection.sendFailed')
        return false
      }
      const result = sendMessage(currentBinding.chatWindow)
      if (!result.success) notice('quickFollow.multiSelection.sendFailed')
      return result.success
    } finally {
      if (followUpSend === operation) followUpSend = null
    }
  }

  const sendMessage = (chat: HTMLElement) => {
    const binding = resolveInput(chat)
    if (!binding || !isReadyToSubmit(binding)) return { success: false, reason: 'input_not_ready' }
    const nativeButton = resolveNativeSubmitButton(binding)
    if (!nativeButton) return { success: false, reason: 'send_button_not_found' }
    try {
      nativeButton.click()
      return { success: true, reason: 'success' }
    } catch {
      return { success: false, reason: 'failed_to_send' }
    }
  }

  const restoreAfterSendFailure = (state: DraftBackup | null) => {
    if (!state || backup !== state || state.scope !== currentScope || items.length
      || resolveCurrentBinding()?.editor !== state.editor || readRequest(state.editor) !== state.request) return
    state.clearObserver?.()
    if (!replaceRequestText(state.editor, '')) return
    state.cleared = true
    restoreBackup()
  }

  const sendCustomPrompt = async (prompt: QuickFollowPrompt, candidate: Candidate): Promise<boolean> => {
    if (!started || !enabled || promptSend || followUpSend || candidate.scope !== currentScope) return false
    const currentBinding = resolveCurrentBinding()
    if (!currentBinding) {
      notice('quickFollow.multiSelection.sendFailed')
      return false
    }
    const { editor } = currentBinding
    const scope = currentScope
    const request = expandPrompt(prompt, candidate)
    // Replacing an unsent shortcut keeps the original draft in the single backup slot.
    const previous = backup?.scope === scope && backup.editor === editor && !backup.cleared
      && readRequest(editor) === backup.request && !items.length ? backup : null
    const state: DraftBackup | null = previous ?? (items.length || hasEditorDraft(editor) ? {
      scope, items: copyItems(items), editorState: captureEditorDraft(editor),
      editor, request, cleared: false,
    } : null)
    clearBackup()
    backup = state
    if (state) state.request = request
    items = []
    syncCards()
    const operation = {}
    promptSend = operation
    const valid = () => promptSend === operation && currentScope === scope && !items.length
      && readRequest(editor) === request
    try {
      if (!writePrefix(editor, []) || !replaceRequestText(editor, request)) {
        notice('quickFollow.multiSelection.sendFailed')
        return false
      }
      observeBackupClear(state)
      setUI({ mode: 'closed' })
      closeActiveFollowUpPopovers()
      const ready = await waitUntilReady(currentBinding, valid)
      if (!ready || !valid()) {
        restoreAfterSendFailure(state)
        if (started && enabled && currentScope === scope) notice('quickFollow.multiSelection.sendFailed')
        return false
      }
      const result = sendMessage(currentBinding.chatWindow)
      if (!result.success) {
        restoreAfterSendFailure(state)
        notice('quickFollow.multiSelection.sendFailed')
      }
      return result.success
    } finally {
      if (promptSend === operation) promptSend = null
    }
  }

  const sendPromptSeparately = (prompt: QuickFollowPrompt, candidate: Candidate): Promise<boolean> =>
    sendCustomPrompt(prompt, candidate)

  const waitUntilReady = (currentBinding: EditorBinding, valid: () => boolean): Promise<boolean> => {
    const ready = () => {
      const live = resolveInput(currentBinding.chatWindow)
      return live?.editor === currentBinding.editor && isReadyToSubmit(live)
    }
    if (!started || !enabled || !valid() || !isCurrentBinding(currentBinding)) return Promise.resolve(false)
    if (ready()) return Promise.resolve(true)
    return new Promise(resolve => {
      let finished = false
      const observer = new MutationObserver(check)
      const timer = setTimeout(() => finish(false), 2_500)
      const cancel = () => finish(false)
      const finish = (ready: boolean) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        observer.disconnect()
        cancelReadinessWaits.delete(cancel)
        resolve(ready)
      }
      function check() {
        if (!started || !enabled || !valid() || !isCurrentBinding(currentBinding)) {
          finish(false)
          return
        }
        if (ready()) finish(true)
      }
      cancelReadinessWaits.add(cancel)
      const inputContainer = resolveInputContainer(currentBinding.chatWindow)
      if (!inputContainer) {
        finish(false)
        return
      }
      observer.observe(inputContainer, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-disabled', 'disabled'],
      })
      check()
    })
  }

  const runPrompt = (prompt: QuickFollowPrompt, candidate: Candidate): Promise<boolean> =>
    items.length ? Promise.resolve(false) : sendCustomPrompt(prompt, candidate)

  function handleMouseUp(event: MouseEvent): void {
    if (!enabled || !chatWindow) return
    if (event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-quick-follow-marker'))) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount !== 1) return setUI({ mode: 'closed' })
    const pathTarget = event.composedPath().find(node => node instanceof Element) as Element | undefined
    const messageContent = resolveMessageContent(pathTarget ?? null, chatWindow)
    if (!messageContent) return setUI({ mode: 'closed' })
    const candidate = captureCandidate(selection.getRangeAt(0), messageContent, {
      clientX: event.clientX,
      clientY: event.clientY,
    })
    if (!candidate) return setUI({ mode: 'closed' })
    setUI({ mode: 'capsule', candidate, hasDraftCards: items.length > 0 })
  }

  const onChatChange = (event: AppEvents['chatchange']) => {
    const nextScope = getConversationScope(event.currentUrl)
    if (nextScope === currentScope) return
    if (currentScope === 'new-chat' && event.isFromNewChat) {
      historyAnchors.retire()
      historyAnchors.migrate(currentScope, nextScope, chatWindow)
    } else historyAnchors.clear()
    cancelReadinessWaits.forEach(cancel => cancel())
    backup?.clearObserver?.()
    if (backup?.scope === 'new-chat' && currentScope === 'new-chat' && event.isFromNewChat) {
      backup.scope = nextScope
      backup.items = backup.items.map(item => item.anchor?.conversationId === 'new-chat'
        ? { ...item, anchor: { ...item.anchor, conversationId: nextScope } } : item)
      currentScope = nextScope
      restoreBackup()
      observeBackupClear(backup)
      return
    }
    items = []
    if (currentBindingSafe()) writePrefix(currentBindingSafe()!.editor, [])
    currentScope = nextScope
    syncCards()
    if (backup?.scope === nextScope) {
      const currentBinding = resolveCurrentBinding()
      if (currentBinding) backup.editor = currentBinding.editor
      restoreBackup()
      observeBackupClear(backup)
    }
    setUI({ mode: 'closed' })
  }

  const currentBindingSafe = () => resolveCurrentBinding()

  const onQuickFollowStorageChanged = (changes: Record<string, unknown>, namespace: string) => {
    if (namespace === 'sync' && 'enableQuickQuote' in changes) {
      void quickFollowStore.getState().hydrate().catch(error => console.warn('Failed to refresh Follow-up settings:', error))
    }
  }

  const handleEnabledChanged = (nextEnabled: boolean) => {
    enabled = nextEnabled
    restoreNativeAskMenu?.()
    restoreNativeAskMenu = enabled ? hideNativeAskMenu() : null
    if (enabled) {
      bindBodyObserver()
      return
    }
    historyAnchors.clear()
    followUpSend = null
    promptSend = null
    bodyObserver?.disconnect()
    bodyObserver = null
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding) writePrefix(binding.editor, [])
    restoreHistoryForChat()
    clearBackup()
    items = []
    syncCards()
    setUI({ mode: 'closed' })
    detachChatWindow()
  }

  const restoreHistoryForChat = () => {
    for (const [query, dispose] of historyDisposers) {
      dispose()
      restoreHistory(query)
    }
    historyDisposers.clear()
  }

  const bindBodyObserver = () => {
    if (!enabled || bodyObserver) return
    const reconcile = () => attachChatWindow(findCurrentChatWindow())
    bodyObserver = new MutationObserver(records => {
      if (chatWindowAddedOrRemoved(records)) reconcile()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    reconcile()
  }

  const start = () => {
    if (started) return
    started = true
    for (const key of NOTICE_KEYS) i18nCache.preCache([{ key }])
    settingsUnsubscribe = quickFollowStore.subscribe((state, previous) => {
      if (state.settings.enabled !== previous.settings.enabled) handleEnabledChanged(state.settings.enabled)
    })
    browser.storage.onChanged.addListener(onQuickFollowStorageChanged)
    quickFollowStore.getState().hydrate().catch(error => console.warn('Failed to hydrate Follow-up settings:', error))
    eventBus.on('chatchange', onChatChange)
    handleEnabledChanged(quickFollowStore.getState().settings.enabled)
  }

  const stop = () => {
    if (!started) return
    started = false
    restoreNativeAskMenu?.()
    restoreNativeAskMenu = null
    historyAnchors.clear()
    followUpSend = null
    promptSend = null
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding) writePrefix(binding.editor, [])
    clearQuoteHighlight()
    restoreHistoryForChat()
    bodyObserver?.disconnect()
    bodyObserver = null
    detachChatWindow()
    clearBackup()
    settingsUnsubscribe?.()
    settingsUnsubscribe = null
    browser.storage.onChanged.removeListener(onQuickFollowStorageChanged)
    eventBus.off('chatchange', onChatChange)
    items = []
    onSelectionsChange([])
    setUI({ mode: 'closed' })
  }

  const add = (candidate: Candidate): string | null => {
    logDevEvent('info', '[QuickFollowUp]', 'selection.add.requested', { selectionCount: items.length })
    const reject = (reason: string) => {
      logDevEvent('warn', '[QuickFollowUp]', 'selection.add.rejected', { reason })
      notice('quickFollow.multiSelection.addFailed')
      return null
    }
    if (!enabled) return reject('disabled')
    if (candidate.scope !== currentScope) return reject('scope_changed')
    const liveBinding = resolveCurrentBinding()
    if (!liveBinding || !isCurrentBinding(liveBinding)) return reject('input_unavailable')
    mountEditor(liveBinding)
    if (items.length >= MAX_SELECTIONS) {
      logDevEvent('warn', '[QuickFollowUp]', 'selection.add.rejected', { reason: 'selection_limit' })
      notice('quickFollow.multiSelection.maxSelections')
      return null
    }
    const request = readRequest(liveBinding.editor)
    if (request === null) {
      return reject('unsupported_editor_content')
    }
    const item: SelectionItem = {
      id: candidate.anchor.quoteId,
      revision: 1,
      selectedText: candidate.text,
      comment: '',
      commentDraft: '',
      anchor: candidate.anchor,
    }
    const next = [...items, item]
    if (!writePrefix(liveBinding.editor, next)) return reject('prefix_write_failed')
    items = next
    syncCards()
    logDevEvent('info', '[QuickFollowUp]', 'selection.add.completed', { selectionCount: items.length })
    setUI({ mode: 'comment', selectionId: item.id, selectionText: item.selectedText, commentDraft: item.commentDraft ?? '', position: candidate.position })
    return item.id
  }

  const update = (id: string, next: (item: SelectionItem) => SelectionItem): boolean => {
    if (!isCurrentBinding(binding)) return false
    const index = items.findIndex(item => item.id === id)
    if (index < 0) return false
    const previous = items
    const updated = items.map(item => item.id === id ? next(item) : item)
    if (!writePrefix(binding.editor, updated)) {
      writePrefix(binding.editor, previous)
      notice('quickFollow.multiSelection.updateFailed')
      return false
    }
    items = updated
    syncCards()
    return true
  }

  const changeQuickComment = (id: string, value: string) => {
    // Existing comments stay unchanged in the card and submission prefix until Save.
    if (currentUI.mode === 'comment' && currentUI.selectionId === id && currentUI.sourceAnchor) {
      if (!isCurrentBinding(binding) || !items.some(item => item.id === id)) return false
      setUI({ ...currentUI, commentDraft: value })
      return true
    }
    const changed = update(id, item => ({ ...item, commentDraft: value, revision: item.revision + 1 }))
    if (changed && currentUI.mode === 'comment' && currentUI.selectionId === id) {
      setUI({ ...currentUI, commentDraft: value })
    }
    return changed
  }

  const addComment = (id: string) => {
    if (currentUI.mode === 'comment' && currentUI.selectionId === id && currentUI.sourceAnchor) {
      return saveComment(id, currentUI.commentDraft)
    }
    const item = items.find(selection => selection.id === id)
    if (!item) return false
    const updated = update(id, current => ({
      ...current,
      comment: effectiveComment(current),
      commentDraft: undefined,
      revision: current.revision + 1,
    }))
    if (updated && currentUI.mode === 'comment' && currentUI.selectionId === id) setUI({ mode: 'closed' })
    return updated
  }

  const openQuickComment = (id: string): boolean => {
    if (!enabled || !isCurrentBinding(binding)) return false
    const item = items.find(selection => selection.id === id)
    if (!item) return false
    let position = item.anchor ? readQuoteAnchorPosition(item.anchor) : null
    if (!position && item.anchor && jumpToQuoteAnchor(item.anchor, 'instant')) {
      position = readQuoteAnchorPosition(item.anchor)
    }
    if (!position || !item.anchor) {
      logDevEvent('warn', '[QuickFollowUp]', 'comment.edit.rejected', { reason: 'source_unavailable' })
      notice('quickFollow.multiSelection.updateFailed')
      return false
    }
    closeActiveFollowUpPopovers()
    setUI({ mode: 'comment', selectionId: id, selectionText: item.selectedText,
      commentDraft: effectiveComment(item), position, sourceAnchor: item.anchor })
    return true
  }

  const saveComment = (id: string, comment: string): boolean => {
    const saved = update(id, item => ({
      ...item,
      comment,
      commentDraft: undefined,
      revision: item.revision + 1,
    }))
    if (saved && currentUI.mode === 'comment' && currentUI.selectionId === id) setUI({ mode: 'closed' })
    return saved
  }

  const remove = (id: string): boolean => {
    if (!isCurrentBinding(binding)) return false
    const previous = items
    const next = items.filter(item => item.id !== id)
    if (next.length === previous.length) return false
    if (!writePrefix(binding.editor, next)) {
      writePrefix(binding.editor, previous)
      notice('quickFollow.multiSelection.updateFailed')
      return false
    }
    items = next
    syncCards()
    if (currentUI.mode === 'comment' && currentUI.selectionId === id) setUI({ mode: 'closed' })
    return true
  }

  const appendPrompt = (prompt: QuickFollowPrompt, candidate: Candidate): boolean => {
    if (!isCurrentBinding(binding) || candidate.scope !== currentScope) return false
    const expanded = expandPrompt(prompt, candidate)
    const success = appendRequestText(binding.editor, expanded)
    if (!success) notice('quickFollow.multiSelection.unsupportedDraft')
    return success
  }

  const requestSend = (): Promise<boolean> => sendFollowUp()

  const dismiss = () => {
    // Outside pointerdown runs before mouseup, which must not recapture the dismissed range.
    if (currentUI.mode === 'capsule') window.getSelection()?.removeAllRanges()
    setUI({ mode: 'closed' })
  }

  const previewSelectionSource = (id: string | null): void => {
    // Marker unmount/leave must not clear the highlight owned by an open editor.
    if (currentUI.mode === 'comment') return
    const anchor = id && enabled && !isBusy() ? items.find(item => item.id === id)?.anchor : undefined
    if (anchor) highlightQuoteAnchor(anchor)
    else clearQuoteHighlight()
  }

  const isBusy = () => false
  const hasDraftCards = () => items.length > 0

  return {
    start,
    stop,
    add,
    changeQuickComment,
    addComment,
    openQuickComment,
    saveComment,
    remove,
    appendPrompt,
    sendPromptSeparately,
    runPrompt,
    requestSend,
    dismiss,
    previewSelectionSource,
    hasDraftCards,
    isBusy,
  }
}
