import { z } from 'zod'
import { GEM_EXT_EVENTS } from '@/common/event'
import { eventBus } from '@/utils/eventbus'
import { openNewChat } from '@/utils/chatActions'
import { tt } from '@/utils/i18n'
import type { StreamGenerateControl } from '@/utils/streamGenerateProtocol'
import { folderRuntime, type FolderRuntime } from './runtime'
import { getAccountPath, getRouteChatId, isBlankComposerReady, isOrdinaryNewChat } from './new-chat.dom'

const observationSchema = z.object({
  token: z.string().min(1).max(100),
  phase: z.enum(['armed', 'started', 'metadata', 'finished']),
  requestId: z.string().min(1).max(100).optional(),
  conversationId: z.string().regex(/^c_[a-f0-9]+$/u).optional(),
  prompt: z.string().trim().min(1).max(500).optional(),
  title: z.string().trim().min(1).max(500).optional(),
})

export interface FolderNewChatIntent {
  token: string
  accountScopeId: string
  accountPath: string
  folderId: string
  phase: 'opening' | 'armed' | 'submitted' | 'saving' | 'saved' | 'failed'
  requestId?: string
  chatId?: string
  title?: string
  initialTitle?: string
  titleSaved?: boolean
  titleSaving?: boolean
  writeInFlight?: boolean
  error?: string
}

export class FolderNewChatController {
  private intent?: FolderNewChatIntent
  private snapshot?: FolderNewChatIntent
  private listeners = new Set<() => void>()
  private unsubscribe?: () => void
  private observer?: MutationObserver
  private timer?: ReturnType<typeof setTimeout>
  private armAcknowledgement?: () => void
  private started = false

  constructor(private readonly runtime: FolderRuntime) {}
  getSnapshot = (): FolderNewChatIntent | undefined => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private publish(): void {
    this.snapshot = this.intent ? { ...this.intent } : undefined
    this.listeners.forEach((listener) => listener())
  }
  private command(data: StreamGenerateControl): void {
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, { detail: data }))
  }
  start(): void {
    if (this.started) return
    this.started = true
    window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, this.handleObservation)
    eventBus.on('urlchange', this.reconcile)
    this.unsubscribe = this.runtime.subscribe(this.reconcile)
    this.observer = new MutationObserver(this.reconcile)
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] })
  }
  stop(): void {
    this.cancel()
    this.started = false
    window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, this.handleObservation)
    eventBus.off('urlchange', this.reconcile)
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.observer?.disconnect()
    this.observer = undefined
  }
  cancel = (): void => {
    if (this.intent) this.command({ action: 'cancel', token: this.intent.token })
    this.armAcknowledgement?.()
    this.armAcknowledgement = undefined
    clearTimeout(this.timer)
    this.intent = undefined
    this.publish()
  }
  private valid(intent: FolderNewChatIntent): boolean {
    const state = this.runtime.getSnapshot()
    return this.intent === intent && state.identity.status === 'available'
      && state.identity.identity.accountScopeId === intent.accountScopeId
      && getAccountPath() === intent.accountPath
      && state.projection?.settings.enabled === true
      && Boolean(state.projection.folders.some((folder) => folder.id === intent.folderId && !folder.deletedAt))
  }
  async open(folderId: string): Promise<void> {
    this.start()
    this.cancel()
    const state = this.runtime.getSnapshot()
    if (state.identity.status !== 'available' || !state.projection?.folders.some((folder) => folder.id === folderId)) return
    const intent: FolderNewChatIntent = {
      token: crypto.randomUUID(), accountScopeId: state.identity.identity.accountScopeId,
      accountPath: getAccountPath(), folderId, phase: 'opening',
    }
    this.intent = intent
    this.publish()
    try {
      await openNewChat({ reset: !isOrdinaryNewChat() && location.pathname.endsWith('/app') })
      const deadline = Date.now() + 3000
      while (this.valid(intent) && !isBlankComposerReady() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!this.valid(intent)) return
      if (!isBlankComposerReady()) throw new Error('New chat editor is not ready')
      let acknowledged = false
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { this.armAcknowledgement = undefined; resolve() }, 1500)
        this.armAcknowledgement = () => { clearTimeout(timeout); acknowledged = true; resolve() }
        this.command({ action: 'arm', token: intent.token, accountPath: intent.accountPath })
      })
      if (!this.valid(intent)) return
      if (!acknowledged) throw new Error('StreamGenerate observer is unavailable')
      intent.phase = 'armed'
      this.timer = setTimeout(this.cancel, 30 * 60_000)
      this.publish()
    } catch (error) {
      if (!this.valid(intent)) return
      intent.phase = 'failed'
      intent.error = tt('folders_new_chat_failed', 'Could not save this chat to the Folder. Retry.')
      console.warn('[Folders] New chat could not start', error)
      this.publish()
    }
  }
  private reconcile = (): void => {
    const intent = this.intent
    if (!intent) return
    if (!this.valid(intent)) { this.cancel(); return }
    if (intent.phase === 'opening') return
    if (intent.phase === 'armed' || (intent.phase === 'failed' && !intent.requestId)) {
      if (!isOrdinaryNewChat()) this.cancel()
      return
    }
    const routeId = getRouteChatId()
    // Metadata can arrive shortly after Gemini changes its own route. Wait for
    // that matching request, but never derive a conversation ID from the URL.
    if (intent.chatId && routeId && routeId !== intent.chatId) { this.cancel(); return }
  }
  private handleObservation = (event: Event): void => {
    const parsed = observationSchema.safeParse((event as CustomEvent<unknown>).detail)
    const intent = this.intent
    if (!parsed.success || !intent || !this.valid(intent) || parsed.data.token !== intent.token) return
    const data = parsed.data
    if (data.phase === 'armed') { this.armAcknowledgement?.(); this.armAcknowledgement = undefined; return }
    if (data.phase === 'started' && intent.phase === 'armed' && data.requestId) {
      intent.requestId = data.requestId
      intent.initialTitle = data.prompt ?? ''
      intent.phase = 'submitted'
      clearTimeout(this.timer)
      this.timer = setTimeout(this.cancel, 120_000)
      this.publish()
      return
    }
    if (!data.requestId || intent.requestId !== data.requestId) return
    if (data.phase === 'metadata' && data.conversationId) {
      const chatId = data.conversationId.slice(2)
      if (intent.chatId && intent.chatId !== chatId) return
      intent.chatId = chatId
      // The sidebar can initially label this chat with the first prompt.
      // Only the claimed stream's generated title completes this one-shot write.
      if (data.title && !intent.titleSaved) intent.title = data.title
      const routeId = getRouteChatId()
      if (routeId && routeId !== chatId) { this.cancel(); return }
      if (intent.phase === 'submitted') void this.save(intent)
      else if (intent.phase === 'saved') void this.saveTitle(intent)
    } else if (data.phase === 'finished') {
      if (!intent.chatId) {
        intent.phase = 'failed'
        intent.error = tt('folders_new_chat_failed', 'Could not save this chat to the Folder. Retry.')
        this.publish()
      } else if (intent.phase === 'saved') this.reconcile()
    }
  }
  retry = (): void => {
    const intent = this.intent
    if (!intent || !this.valid(intent)) return
    if (intent.phase === 'saved') void this.saveTitle(intent)
    else if (intent.chatId) void this.save(intent)
    else void this.open(intent.folderId)
  }
  private async save(intent: FolderNewChatIntent): Promise<void> {
    if (!this.valid(intent) || !intent.chatId || intent.writeInFlight) return
    intent.phase = 'saving'
    intent.writeInFlight = true
    intent.error = undefined
    this.publish()
    try {
      // Conditional title writes protect user renames, including on retries.
      await this.runtime.addMembership(intent.folderId, intent.chatId)
      if (!this.valid(intent)) return
      if (intent.initialTitle) {
        await this.runtime.completeNewChatTitle(intent.chatId, intent.initialTitle, '')
        if (!this.valid(intent)) return
      }
      intent.phase = 'saved'
      intent.writeInFlight = false
      await this.runtime.setFolderCollapsed(intent.folderId, false)
      if (!this.valid(intent)) return
      this.publish()
      this.reconcile()
      await this.saveTitle(intent)
    } catch (error) {
      if (!this.valid(intent)) return
      intent.writeInFlight = false
      intent.phase = 'failed'
      intent.error = tt('folders_new_chat_failed', 'Could not save this chat to the Folder. Retry.')
      console.warn('[Folders] New chat archive failed', error)
      this.publish()
    }
  }
  private async saveTitle(intent: FolderNewChatIntent): Promise<void> {
    if (!this.valid(intent) || !intent.chatId || !intent.title || intent.titleSaved || intent.titleSaving) return
    intent.titleSaving = true
    try {
      await this.runtime.completeNewChatTitle(intent.chatId, intent.title, intent.initialTitle ?? '')
      if (!this.valid(intent)) return
      intent.titleSaved = true
      this.cancel()
    } catch (error) {
      if (this.valid(intent)) {
        intent.error = tt('folders_new_chat_failed', 'Could not save this chat to the Folder. Retry.')
        this.publish()
      }
      console.warn('[Folders] New chat title could not be saved', error)
    } finally { intent.titleSaving = false }
  }
}

export const folderNewChat = new FolderNewChatController(folderRuntime)
