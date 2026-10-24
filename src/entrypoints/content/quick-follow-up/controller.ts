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
import { closeActiveFollowUpPopovers, mountDraftCards, renderHistory, restoreHistory } from './cards'
import {
  appendRequestText,
  baselineQueries,
  captureCandidate,
  captureEditorDraft,
  getConversationScope,
  isReadyToSubmit,
  supportsPlainTextSend,
  listUserQueries,
  queriesAffectedBy,
  removedUserQueries,
  chatWindowAddedOrRemoved,
  inputStructureChanged,
  currentSentinelIds,
  removedSentinelIds,
  findCurrentChatWindow,
  findNewMatchingQuery,
  attachSelectionAnchors,
  jumpToQuoteAnchor,
  highlightQuoteAnchor,
  readQuoteAnchorPosition,
  jumpToQuoteSource,
  clearQuoteHighlight,
  observeSubmissionClearTransition,
  observeFollowUpClearTransition,
  readRawQuery,
  readRequest,
  replaceRequestText,
  resolveInput,
  resolveInputContainer,
  resolveMessageContent,
  resolveNativeSubmitButton,
  restoreEditorDraft,
  writePrefix,
  type Candidate,
  type EditorSnapshot,
  type InputBinding,
} from './dom'
import { effectiveComment, MAX_SELECTIONS, serializeMessage, serializePrefix, type SelectionItem, type QuoteAnchor } from './protocol'

const NOTICE_KEYS = [
  'quickFollow.multiSelection.addFailed',
  'quickFollow.multiSelection.maxSelections',
  'quickFollow.multiSelection.updateFailed',
  'quickFollow.multiSelection.sendFailed',
  'quickFollow.multiSelection.sendUnknown',
  'quickFollow.multiSelection.restoreDraft',
  'quickFollow.multiSelection.restoreFailed',
  'quickFollow.multiSelection.unsupportedDraft',
] as const
const SEND_CONFIRMATION_TIMEOUT_MS = 15_000

export type FollowUpUI =
  | { mode: 'closed' }
  | { mode: 'capsule'; candidate: Candidate; hasDraftCards: boolean }
  | { mode: 'comment'; selectionId: string; selectionText: string; commentDraft: string; position: Candidate['position']; sourceAnchor?: QuoteAnchor }

export type FollowUpController = ReturnType<typeof createFollowUpController>

type Attempt = {
  kind: 'follow-up' | 'custom'
  scope: string
  raw: string
  versions: Array<{ id: string; revision: number }>
  baselineQueries: WeakSet<Element>
  phase: 'waiting' | 'unknown'
  timer: ReturnType<typeof setTimeout>
  clearObserver?: () => void
  submitted: boolean
  cleared: boolean
  requestText: string
}

type DraftBackup = {
  scope: string
  items: SelectionItem[]
  editorState: EditorSnapshot
  submitted: boolean
  cleared: boolean
  raw?: string
  restoreAfterSubmit: boolean
}

type PendingFollowUp = Pick<Attempt, 'scope' | 'raw' | 'baselineQueries'> & {
  items: SelectionItem[]
  expiresAt: number
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

function isNativeSendIntent(event: Event, binding: InputBinding): boolean {
  if (event.type === 'keydown') {
    const keyboard = event as KeyboardEvent
    return keyboard.target === binding.editor && keyboard.key === 'Enter'
      && !keyboard.shiftKey && !keyboard.isComposing && !keyboard.defaultPrevented
  }
  return event.type === 'click' && event.composedPath().some(node => node === binding.sendButton)
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
  let binding: InputBinding | null = null
  let cards: ReturnType<typeof mountDraftCards> | null = null
  let bodyObserver: MutationObserver | null = null
  let chatObserver: MutationObserver | null = null
  let editorObserver: MutationObserver | null = null
  let settingsUnsubscribe: (() => void) | null = null
  let attempt: Attempt | null = null
  // Retain only the most recent cleared send for delayed source-anchor attachment.
  let pendingFollowUp: PendingFollowUp | null = null
  let backup: DraftBackup | null = null
  let ownSendInProgress = false
  const cancelReadinessWaits = new Set<() => void>()
  let currentScope = getConversationScope()
  let pendingNewChatScope: string | null = null
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
    cards?.render(items)
    cards?.setDisabled(isBusy())
    const commentId = currentUI.mode === 'comment' ? currentUI.selectionId : null
    if (commentId && !items.some(item => item.id === commentId)) {
      setUI({ mode: 'closed' })
    }
    onSelectionsChange(chatWindow ? copyItems(items) : [])
  }

  const clearAttempt = () => {
    if (!attempt) return
    clearTimeout(attempt.timer)
    attempt.clearObserver?.()
    attempt = null
    pendingNewChatScope = null
    cards?.setDisabled(isBusy())
    onSelectionsChange(chatWindow ? copyItems(items) : [])
  }

  const dismissNotice = (key: string) => notice(key)

  const resolveCurrentBinding = (): InputBinding | null => chatWindow ? resolveInput(chatWindow) : null
  const isAttemptScopeActive = (scope: string): boolean => currentScope === scope
    || (scope === 'new-chat' && pendingNewChatScope === currentScope)
  const isCurrentBinding = (candidate: InputBinding | null): candidate is InputBinding => {
    if (!candidate || !candidate.editor.isConnected || !candidate.chatWindow.isConnected) return false
    const live = resolveCurrentBinding()
    return live?.editor === candidate.editor && live.richTextarea === candidate.richTextarea
  }

  const mountEditor = (nextBinding: InputBinding) => {
    if (binding?.editor === nextBinding.editor) {
      binding = nextBinding
      return
    }
    editorObserver?.disconnect()
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
    if (enabled && items.length && !attempt && !backup && !writePrefix(nextBinding.editor, items)) {
      dismissNotice('quickFollow.multiSelection.updateFailed')
    }
    if (backup && attempt?.kind === 'custom' && attempt.phase === 'waiting'
      && attempt.scope === currentScope && backup.scope === currentScope) nextBinding.editor.contentEditable = 'false'
    editorObserver = new MutationObserver(records => {
      if (!enabled || !isCurrentBinding(binding) || attempt) return
      const removedIds = removedSentinelIds(records)
      if (!removedIds.length) return
      const liveIds = new Set(currentSentinelIds(binding.editor))
      const missing = removedIds.filter(id => items.some(item => item.id === id) && !liveIds.has(id))
      if (!missing.length) return
      const removed = new Set(missing)
      items = items.filter(item => !removed.has(item.id))
      syncCards()
      if (!writePrefix(binding.editor, items)) dismissNotice('quickFollow.multiSelection.updateFailed')
    })
    editorObserver.observe(nextBinding.editor, { childList: true, subtree: true })
  }

  const renderQuery = (query: Element) => {
    if (pendingFollowUp && pendingFollowUp.expiresAt <= Date.now()) pendingFollowUp = null
    if (pendingFollowUp && query.isConnected && pendingFollowUp.scope === currentScope
      && !pendingFollowUp.baselineQueries.has(query) && readRawQuery(query) === pendingFollowUp.raw) {
      attachSelectionAnchors(query, pendingFollowUp.items.map(item => item.anchor))
      pendingFollowUp = null
    }
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
      if (attempt && query.isConnected && !attempt.baselineQueries.has(query)) confirmAttempt(query)
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
    chatWindow.addEventListener('click', handleNativeSendIntent, true)
    chatWindow.addEventListener('keydown', handleNativeSendIntent, true)
    chatObserver = new MutationObserver(records => {
      reconcileAffectedQueries(records)
      if (!inputStructureChanged(records)) return
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
    if (attempt) {
      for (const query of listUserQueries(chatWindow)) {
        if (!attempt.baselineQueries.has(query)) confirmAttempt(query)
      }
    }
  }

  const detachChatWindow = () => {
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding && (!attempt || attempt.kind === 'custom')) writePrefix(binding.editor, [])
    if (chatWindow) {
      chatWindow.removeEventListener('mouseup', handleMouseUp)
      chatWindow.removeEventListener('click', handleNativeSendIntent, true)
      chatWindow.removeEventListener('keydown', handleNativeSendIntent, true)
    }
    chatObserver?.disconnect()
    editorObserver?.disconnect()
    attempt?.clearObserver?.()
    if (attempt) attempt.clearObserver = undefined
    if (backup && binding?.editor.contentEditable === 'false') binding.editor.contentEditable = 'true'
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

  const clearDraft = (clearEditorPrefix: boolean) => {
    const currentBinding = resolveCurrentBinding()
    if (clearEditorPrefix && currentBinding) writePrefix(currentBinding.editor, [])
    items = []
    syncCards()
    setUI({ mode: 'closed' })
  }

  const startAttempt = (kind: Attempt['kind'], raw: string, versions: Attempt['versions'], currentBinding: InputBinding): Attempt => {
    clearAttempt()
    const state: Attempt = {
      kind,
      scope: currentScope,
      raw,
      versions,
      baselineQueries: baselineQueries(currentBinding.chatWindow),
      phase: 'waiting',
      timer: setTimeout(() => {
        if (attempt !== state) return
        state.phase = 'unknown'
        if (state.kind === 'custom' && backup) {
          backup.submitted = state.submitted
          backup.cleared = state.cleared
          unlockCustomEditor(state.scope)
          notice('quickFollow.multiSelection.sendUnknown', {
            label: t('quickFollow.multiSelection.restoreDraft'),
            onClick: retryRestoreDraft,
          })
        } else {
          notice('quickFollow.multiSelection.sendUnknown')
        }
      }, SEND_CONFIRMATION_TIMEOUT_MS),
      requestText: readRequest(currentBinding.editor) ?? '',
      submitted: false,
      cleared: false,
    }
    attempt = state
    cards?.setDisabled(isBusy())
    onSelectionsChange(chatWindow ? copyItems(items) : [])
    return state
  }

  const unlockCustomEditor = (scope = currentScope) => {
    if (!isAttemptScopeActive(scope)) return
    if (!binding?.editor.isConnected) return
    binding.editor.contentEditable = 'true'
  }

  const verifyAndRestoreBackup = (explicitRestore = false): boolean => {
    if (!backup || !attempt || attempt.kind !== 'custom') return false
    if (!backup.submitted || !backup.cleared || getConversationScope() !== backup.scope) return false
    if (!backup.restoreAfterSubmit && !explicitRestore) {
      const currentBinding = resolveCurrentBinding()
      if (currentBinding) currentBinding.editor.contentEditable = 'true'
      items = []
      backup = null
      clearAttempt()
      syncCards()
      return true
    }
    const currentBinding = resolveCurrentBinding()
    if (!enabled || !currentBinding || readRequest(currentBinding.editor) !== '') return false
    currentBinding.editor.contentEditable = 'true'
    if (!restoreEditorDraft(currentBinding.editor, backup.editorState)) return false
    if (!writePrefix(currentBinding.editor, backup.items) || readRequest(currentBinding.editor) !== backup.editorState.request) return false
    items = copyItems(backup.items)
    backup = null
    clearAttempt()
    syncCards()
    return true
  }

  function retryRestoreDraft(): void {
    if (backup && attempt?.submitted && getConversationScope() === backup.scope) {
      const currentBinding = resolveCurrentBinding()
      if (currentBinding && readRequest(currentBinding.editor) === '') backup.cleared = true
    }
    if (verifyAndRestoreBackup(true)) return
    notice('quickFollow.multiSelection.restoreFailed', {
      label: t('quickFollow.multiSelection.restoreDraft'),
      onClick: retryRestoreDraft,
    })
  }

  const finishFollowUpAttempt = (state: Attempt) => {
    if (attempt !== state || !state.cleared || state.kind !== 'follow-up') return
    const acknowledged = new Set(state.versions.map(version => `${version.id}:${version.revision}`))
    const sentItems = items.filter(item => acknowledged.has(`${item.id}:${item.revision}`))
    if (!state.submitted) {
      const scope = state.scope === 'new-chat' ? pendingNewChatScope ?? state.scope : state.scope
      pendingFollowUp = {
        scope,
        raw: state.raw,
        baselineQueries: state.baselineQueries,
        items: copyItems(sentItems),
        expiresAt: Date.now() + SEND_CONFIRMATION_TIMEOUT_MS,
      }
      if (pendingFollowUp.scope !== state.scope) {
        pendingFollowUp.items.forEach(item => {
          if (item.anchor) item.anchor.conversationId = scope
        })
      }
    }
    items = items.filter(item => !acknowledged.has(`${item.id}:${item.revision}`))
    const currentBinding = resolveCurrentBinding()
    if (currentBinding && !writePrefix(currentBinding.editor, items)) dismissNotice('quickFollow.multiSelection.updateFailed')
    clearAttempt()
    syncCards()
    if (currentUI.mode === 'comment') setUI({ mode: 'closed' })
  }

  const confirmAttempt = (query: Element) => {
    if (!attempt) return
    const currentAttempt = attempt
    if (pendingNewChatScope && currentAttempt.scope === 'new-chat'
      && currentScope === pendingNewChatScope && query.isConnected
      && readRawQuery(query) === currentAttempt.raw) {
      currentAttempt.scope = pendingNewChatScope
      const migratedScope = pendingNewChatScope
      items = items.map(item => item.anchor?.conversationId === 'new-chat'
        ? { ...item, anchor: { ...item.anchor, conversationId: migratedScope } }
        : item)
      if (backup?.scope === 'new-chat') {
        backup.scope = migratedScope
        backup.items = backup.items.map(item => item.anchor?.conversationId === 'new-chat'
          ? { ...item, anchor: { ...item.anchor, conversationId: migratedScope } }
          : item)
      }
      pendingNewChatScope = null
    }
    if (currentAttempt.scope !== currentScope || readRawQuery(query) !== currentAttempt.raw) return
    currentAttempt.submitted = true
    if (currentAttempt.kind === 'custom') {
      if (backup) backup.submitted = true
      verifyAndRestoreBackup()
      if (!backup && currentAttempt.cleared) clearAttempt()
      return
    }
    const sentItems = currentAttempt.versions.map(version => items.find(item => item.id === version.id
      && item.revision === version.revision))
    attachSelectionAnchors(query, sentItems.map(item => item?.anchor))
    renderQuery(query)
    finishFollowUpAttempt(currentAttempt)
  }

  const prepareFollowUpAttempt = (): Attempt | null => {
    if (!isCurrentBinding(binding) || !items.length || attempt || !enabled) return null
    const request = readRequest(binding.editor)
    if (request === null) return null
    const committed = items.map(item => {
      if (item.commentDraft === undefined) return item
      return { ...item, comment: item.commentDraft, commentDraft: undefined, revision: item.revision + 1 }
    })
    if (!writePrefix(binding.editor, committed)) {
      dismissNotice('quickFollow.multiSelection.updateFailed')
      return null
    }
    items = committed
    syncCards()
    binding.editor.dispatchEvent(new Event('input', { bubbles: true }))
    const raw = serializeMessage(items, request)
    const state = startAttempt('follow-up', raw, items.map(({ id, revision }) => ({ id, revision })), binding)
    state.requestText = request
    state.clearObserver = observeFollowUpClearTransition(binding.editor, state.versions.map(version => version.id), () => {
      if (attempt !== state) return
      state.cleared = true
      finishFollowUpAttempt(state)
    })
    return state
  }

  const sendFollowUp = async (): Promise<boolean> => {
    const currentBinding = resolveCurrentBinding()
    if (!currentBinding || !items.length || !enabled) return false
    binding = currentBinding
    const prepared = prepareFollowUpAttempt()
    if (!prepared) return false
    closeActiveFollowUpPopovers()
    const ready = await waitUntilReady(currentBinding, prepared.scope, prepared)
    if (!ready || attempt !== prepared || !isAttemptScopeActive(prepared.scope)) {
      if (attempt === prepared) clearAttempt()
      notice('quickFollow.multiSelection.sendFailed')
      return false
    }
    ownSendInProgress = true
    let result: ReturnType<typeof sendMessage>
    try { result = sendMessage(currentBinding.chatWindow) }
    finally { ownSendInProgress = false }
    if (!result.success) {
      clearAttempt()
      notice('quickFollow.multiSelection.sendFailed')
      return false
    }
    return true
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

  const tryRestoreKnownFailure = (): boolean => {
    if (!backup || !attempt) return false
    const currentBinding = resolveCurrentBinding()
    if (!currentBinding || !isAttemptScopeActive(backup.scope) || attempt.submitted || readRequest(currentBinding.editor) !== attempt.raw) return false
    if (!replaceRequestText(currentBinding.editor, '')
      || !restoreEditorDraft(currentBinding.editor, backup.editorState)) return false
    if (!writePrefix(currentBinding.editor, backup.items)) return false
    currentBinding.editor.contentEditable = 'true'
    items = copyItems(backup.items)
    syncCards()
    backup = null
    clearAttempt()
    return true
  }

  const submitCustomRequest = async (
    currentBinding: InputBinding,
    scope: string,
    request: string,
    editorState: EditorSnapshot,
    priorItems: SelectionItem[],
    restoreAfterSubmit: boolean,
  ): Promise<boolean> => {
    backup = { scope, items: copyItems(priorItems), editorState, submitted: false, cleared: false, raw: request, restoreAfterSubmit }
    currentBinding.editor.contentEditable = 'false'
    const state = startAttempt('custom', request, [], currentBinding)
    state.clearObserver = observeSubmissionClearTransition(currentBinding.editor, request, () => {
      if (attempt !== state) return
      state.cleared = true
      if (backup) {
        backup.cleared = true
        verifyAndRestoreBackup()
      } else if (state.submitted) clearAttempt()
    })
    setUI({ mode: 'closed' })
    closeActiveFollowUpPopovers()
    const ready = await waitUntilReady(currentBinding, scope, state)
    const liveBinding = resolveCurrentBinding()
    if (!ready || attempt !== state || !enabled || !isAttemptScopeActive(scope)
      || liveBinding?.editor !== currentBinding.editor || readRequest(currentBinding.editor) !== request) {
      if (liveBinding?.editor === currentBinding.editor && isAttemptScopeActive(scope)
        && !state.submitted && readRequest(currentBinding.editor) === request) {
        currentBinding.editor.contentEditable = 'true'
        tryRestoreKnownFailure()
      }
      if (attempt === state) retryRestoreDraft()
      notice('quickFollow.multiSelection.sendFailed')
      return false
    }
    ownSendInProgress = true
    let result: ReturnType<typeof sendMessage>
    try { result = sendMessage(currentBinding.chatWindow) }
    finally { ownSendInProgress = false }
    if (!result.success) {
      if (!tryRestoreKnownFailure()) retryRestoreDraft()
      notice('quickFollow.multiSelection.sendFailed')
      return false
    }
    return true
  }

  const sendPromptSeparately = async (prompt: QuickFollowPrompt, candidate: Candidate): Promise<boolean> => {
    if (attempt || backup || !binding || candidate.scope !== currentScope || !enabled) return false
    const currentBinding = resolveCurrentBinding()
    if (!currentBinding || !supportsPlainTextSend(currentBinding)) {
      notice('quickFollow.multiSelection.unsupportedDraft')
      return false
    }
    const editorState = captureEditorDraft(currentBinding.editor)
    if (!editorState) {
      notice('quickFollow.multiSelection.unsupportedDraft')
      return false
    }
    const snapshot = copyItems(items)
    const scope = currentScope
    const request = expandPrompt(prompt, candidate)
    if (!writePrefix(currentBinding.editor, [])) return false
    if (!replaceRequestText(currentBinding.editor, request)) {
      writePrefix(currentBinding.editor, snapshot)
      return false
    }
    return submitCustomRequest(currentBinding, scope, request, editorState, snapshot, true)
  }

  const waitUntilReady = (currentBinding: InputBinding, scope: string, state: Attempt): Promise<boolean> => {
    if (isReadyToSubmit(currentBinding)) return Promise.resolve(true)
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
        const latest = resolveCurrentBinding()
        if (!started || !enabled || attempt !== state || !isAttemptScopeActive(scope)
          || latest?.editor !== currentBinding.editor || readRequest(currentBinding.editor) !== state.requestText) {
          finish(false)
          return
        }
        if (isReadyToSubmit(latest)) finish(true)
      }
      cancelReadinessWaits.add(cancel)
      const inputContainer = resolveInputContainer(currentBinding.chatWindow)
      if (!inputContainer) {
        finish(false)
        return
      }
      observer.observe(inputContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-disabled', 'disabled'],
      })
      check()
    })
  }

  const runPrompt = async (prompt: QuickFollowPrompt, candidate: Candidate): Promise<boolean> => {
    if (items.length || candidate.scope !== currentScope || !enabled || attempt || backup) return false
    const currentBinding = resolveCurrentBinding()
    if (!currentBinding || !supportsPlainTextSend(currentBinding)) {
      notice('quickFollow.multiSelection.unsupportedDraft')
      return false
    }
    const editorState = captureEditorDraft(currentBinding.editor)
    const request = expandPrompt(prompt, candidate)
    if (!editorState || !replaceRequestText(currentBinding.editor, request)) {
      notice('quickFollow.multiSelection.unsupportedDraft')
      return false
    }
    return submitCustomRequest(currentBinding, currentScope, request, editorState, [], false)
  }

  function handleNativeSendIntent(event: Event): void {
    const liveBinding = resolveCurrentBinding()
    if (liveBinding && binding?.editor === liveBinding.editor) binding = liveBinding
    if (ownSendInProgress || !isCurrentBinding(binding) || !isNativeSendIntent(event, binding)) return
    if (attempt?.kind === 'custom' && backup && currentScope === attempt.scope) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (!items.length) return
    if (attempt?.phase === 'waiting') {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (attempt?.phase === 'unknown') {
      const unresolved = attempt
      const matching = findNewMatchingQuery(binding.chatWindow, unresolved.baselineQueries, unresolved.raw)
      if (matching) {
        confirmAttempt(matching)
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (attempt !== unresolved || unresolved.cleared || currentScope !== unresolved.scope
        || readRequest(binding.editor) !== unresolved.requestText || !isReadyToSubmit(binding)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      clearAttempt()
    }
    const prepared = prepareFollowUpAttempt()
    if (!prepared) {
      event.preventDefault()
      event.stopImmediatePropagation()
      notice('quickFollow.multiSelection.updateFailed')
      return
    }
  }

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
    const nextScope = event.currentUrl.match(/^https?:\/\/[^/]+\/app\/([^/?#]+)/)?.[1]
      ?? event.currentUrl.match(/^\/app\/([^/?#]+)/)?.[1]
      ?? 'new-chat'
    if (nextScope === currentScope) return
    if (pendingFollowUp?.scope === 'new-chat' && currentScope === 'new-chat' && event.isFromNewChat) {
      pendingFollowUp.scope = nextScope
      pendingFollowUp.items.forEach(item => {
        if (item.anchor) item.anchor.conversationId = nextScope
      })
    } else pendingFollowUp = null
    if (pendingNewChatScope && pendingNewChatScope !== nextScope) {
      pendingNewChatScope = null
    }
    if (attempt && attempt.scope === 'new-chat' && event.isFromNewChat && currentScope === 'new-chat') {
      currentScope = nextScope
      pendingNewChatScope = nextScope
      return
    }
    cancelReadinessWaits.forEach(cancel => cancel())
    if (backup && binding) binding.editor.contentEditable = 'true'
    if (!backup) clearAttempt()
    items = backup?.scope === nextScope ? copyItems(backup.items) : []
    syncCards()
    if (currentBindingSafe()) writePrefix(currentBindingSafe()!.editor, [])
    if (attempt && attempt.kind === 'follow-up') clearAttempt()
    currentScope = nextScope
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
    if (enabled) {
      bindBodyObserver()
      return
    }
    pendingFollowUp = null
    bodyObserver?.disconnect()
    bodyObserver = null
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding) writePrefix(binding.editor, [])
    if (backup && binding) binding.editor.contentEditable = 'true'
    restoreHistoryForChat()
    clearAttempt()
    backup = null
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

  const retryDraftRecovery = () => retryRestoreDraft()

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
    if (enabled) bindBodyObserver()
  }

  const stop = () => {
    if (!started) return
    started = false
    pendingFollowUp = null
    cancelReadinessWaits.forEach(cancel => cancel())
    if (binding) writePrefix(binding.editor, [])
    if (backup && binding) binding.editor.contentEditable = 'true'
    clearQuoteHighlight()
    restoreHistoryForChat()
    bodyObserver?.disconnect()
    bodyObserver = null
    detachChatWindow()
    clearAttempt()
    pendingNewChatScope = null
    backup = null
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
    if (attempt || backup) return reject('busy')
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
    if (!isCurrentBinding(binding) || attempt || backup) return false
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
      if (!isCurrentBinding(binding) || attempt || backup || !items.some(item => item.id === id)) return false
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
    if (!enabled || !isCurrentBinding(binding) || attempt || backup) return false
    const item = items.find(selection => selection.id === id)
    if (!item) return false
    if (!item.anchor || !jumpToQuoteAnchor(item.anchor, 'instant')) {
      logDevEvent('warn', '[QuickFollowUp]', 'comment.edit.rejected', { reason: 'source_unavailable' })
      notice('quickFollow.multiSelection.updateFailed')
      return false
    }
    const position = readQuoteAnchorPosition(item.anchor)
    if (!position) return false
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
    if (!isCurrentBinding(binding) || attempt || backup) return false
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
    if (!isCurrentBinding(binding) || candidate.scope !== currentScope || attempt || backup) return false
    const expanded = expandPrompt(prompt, candidate)
    const success = appendRequestText(binding.editor, expanded)
    if (!success) notice('quickFollow.multiSelection.unsupportedDraft')
    return success
  }

  const requestSend = (): Promise<boolean> => {
    if (attempt?.phase === 'unknown' && attempt.kind === 'follow-up') {
      const unresolved = attempt
      if (!isCurrentBinding(binding) || currentScope !== unresolved.scope || unresolved.cleared) return Promise.resolve(false)
      const matching = findNewMatchingQuery(binding.chatWindow, unresolved.baselineQueries, unresolved.raw)
      if (matching) {
        confirmAttempt(matching)
        return Promise.resolve(false)
      }
      if (readRequest(binding.editor) !== unresolved.requestText || !isReadyToSubmit(binding)) return Promise.resolve(false)
      clearAttempt()
    }
    return sendFollowUp()
  }

  const dismiss = () => setUI({ mode: 'closed' })

  const previewSelectionSource = (id: string | null): void => {
    // Marker unmount/leave must not clear the highlight owned by an open editor.
    if (currentUI.mode === 'comment') return
    const anchor = id && enabled && !isBusy() ? items.find(item => item.id === id)?.anchor : undefined
    if (anchor) highlightQuoteAnchor(anchor)
    else clearQuoteHighlight()
  }

  const isBusy = () => !!attempt || !!backup
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
    retryDraftRecovery,
    dismiss,
    previewSelectionSource,
    hasDraftCards,
    isBusy,
  }
}
