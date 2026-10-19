import { nanoid } from 'nanoid'
import { logDevEvent } from '@/utils/devLogger'
import { folderAffectedSchema, folderChangeSchema, type FolderChange } from '@/domain/folder/changes'
import type { FolderRpcMethod } from '@/domain/folder/rpc'
import type { BrowserSyncRecreationRequest, FolderSyncRunResult } from '@/domain/folder/types'
import type { FolderColorValue, FolderIconKey } from '@/domain/folder/appearance'
import type { FolderUpdateInput } from '@/domain/folder/commands'
import type {
  ChatReferenceRow,
  FolderMembershipRow,
  FolderProjection,
  FolderRow,
  FolderSnapshotSummary,
  FolderSnapshotProtection,
  FolderLocalStorageStatus,
  FolderSettingsRow,
} from '@/domain/folder/types'
import type { FolderAccountHistory } from '@/domain/folder/account-history'
import { folderAccountHistory } from '@/services/gemini-identity/account-history'
import { geminiIdentityService, type GeminiIdentityResult } from '@/services/gemini-identity'
import { geminiApi } from '@/services/gemini-api'
import { tt } from '@/utils/i18n'
import { deleteGeminiChat } from './native-chat-delete'
import { browser } from 'wxt/browser'
import { eventBus } from '@/utils/eventbus'
import { folderBackgroundClient, type BrowserSyncStatusProjection } from './client'
import {
  createFolderTraceId,
  logFolderTrace,
  logFolderTraceError,
} from '@/utils/folderTrace'

export interface FolderPickerState {
  chatId: string
  anchorRect: DOMRect
  traceId: string
  cachedTitle?: string
}

export type FolderMenuState =
  | {
      kind: 'folder'
      folderId: string
      folderName: string
      anchorElement: HTMLElement
      anchorRect: DOMRect
    }
  | {
      kind: 'chat'
      folderId: string
      chatId: string
      chatTitle: string
      anchorElement: HTMLElement
      anchorRect: DOMRect
    }

export type FolderDialogState =
  | {
      kind: 'create'
      addToChat?: {
        chatId: string
        cachedTitle?: string
        traceId: string
      }
    }
  | { kind: 'edit'; folderId: string; expectedRevision?: string }
  | { kind: 'delete-folder'; folderId: string; affectedChatCount: number }
  | { kind: 'remove-membership'; folderId: string; chatId: string }
  | { kind: 'delete-chat'; folderId: string; chatId: string }
  | { kind: 'rename-chat'; folderId: string; chatId: string; chatTitle: string; expectedRevision?: string }

export interface FolderRuntimeState {
  loadingChatFolderIds?: string[]
  identity: GeminiIdentityResult
  projection?: FolderProjection
  syncState?: BrowserSyncStatusProjection
  picker?: FolderPickerState
  menu?: FolderMenuState
  dialog?: FolderDialogState
  error?: string
}

type Listener = () => void
interface ProjectionLoad {
  accountScopeId: string
  refreshNeeded: boolean
  syncStatusNeeded: boolean
  settingsChange?: FolderChange
  requestId?: string
}

const ACTIVITY_HINT_COOLDOWN_MS = 30_000

/**
 * The sole content-side command boundary for Folders. React consumes its
 * projection and commands; only this runtime talks to the background client.
 */
export class FolderRuntime {
  private state: FolderRuntimeState = { identity: geminiIdentityService.getCurrent() }
  private readonly listeners = new Set<Listener>()
  private unsubscribeIdentity?: () => void
  private identityLoad?: Promise<void>
  private sequence = 0
  private invalidationListenerStarted = false
  private lastActivityHint?: { accountScopeId: string; requestedAt: number }
  private projectionLoad?: ProjectionLoad
  private viewTask?: Promise<void>
  private lastChangeRequestId?: string
  private settingsSequence = 0
  private accountSequence = 0

  private readonly handleBackgroundMessage = (message: unknown): void => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'folders:data-changed') return
    const changed = message as { accountScopeId?: unknown; affected?: unknown }
    const identity = this.state.identity
    if (identity.status !== 'available' || changed.accountScopeId !== identity.identity.accountScopeId) return
    const affected = folderAffectedSchema.safeParse(changed.affected).data
    if (affected?.recoveryStatus === true) eventBus.emit('folders:recovery-changed', { accountScopeId: identity.identity.accountScopeId })
    const onlySyncStatusChanged = affected?.syncStatus === true && !affected.all && !affected.folders
      && affected.folderMetadataIds === undefined && affected.folderIds === undefined && affected.chatIds === undefined && !affected.settings
    if (onlySyncStatusChanged) {
      if (this.projectionLoad) this.projectionLoad.syncStatusNeeded = true
      else void this.refreshSyncStatus().catch((error: unknown) => this.reportRefreshError(identity.identity.accountScopeId, error))
      return
    }
    if (affected?.settings) ++this.settingsSequence
    const change = folderChangeSchema.safeParse(message)
    void this.applyChange(identity.identity.accountScopeId, change.success ? change.data : undefined, 'broadcast')
      .catch((error: unknown) => this.reportRefreshError(identity.identity.accountScopeId, error))
  }

  private readonly handleSyncSignal = (): void => {
    this.requestBrowserSync(undefined, true)
  }

  getSnapshot = (): FolderRuntimeState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(next: Partial<FolderRuntimeState>): void {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((listener) => listener())
  }

  async start(): Promise<void> {
    if (!this.invalidationListenerStarted) {
      browser.runtime.onMessage.addListener(this.handleBackgroundMessage)
      window.addEventListener('focus', this.handleSyncSignal)
      window.addEventListener('online', this.handleSyncSignal)
      this.invalidationListenerStarted = true
    }
    await geminiIdentityService.start()
    if (!this.unsubscribeIdentity) {
      let initialLoad: Promise<void> | undefined
      this.unsubscribeIdentity = geminiIdentityService.subscribe((result) => {
        const load = this.loadIdentity(result, undefined, initialLoad ? 'identity' : 'startup')
        this.identityLoad = load
        initialLoad ??= load
        void load
      })
      // subscribe() synchronously supplies the current identity. Waiting for
      // that one load keeps startup deterministic without issuing a second
      // getSidebarState/getSyncStatus pair after identity initialization.
      await initialLoad
    }
    // The initial projection already includes the current sync status. The
    // startup activity hint only schedules background work, so reading that
    // same status again would be redundant.
    this.requestBrowserSync(undefined, false)
  }

  stop(): void {
    ++this.sequence
    this.unsubscribeIdentity?.()
    this.unsubscribeIdentity = undefined
    this.identityLoad = undefined
    this.projectionLoad = undefined
    this.viewTask = undefined
    this.lastChangeRequestId = undefined
    ++this.settingsSequence
    ++this.accountSequence
    geminiIdentityService.stop()
    if (this.invalidationListenerStarted) {
      browser.runtime.onMessage.removeListener(this.handleBackgroundMessage)
      window.removeEventListener('focus', this.handleSyncSignal)
      window.removeEventListener('online', this.handleSyncSignal)
      this.invalidationListenerStarted = false
    }
    this.state = { identity: { status: 'unavailable', reason: 'surface-not-ready' } }
    this.lastActivityHint = undefined
    this.listeners.forEach((listener) => listener())
  }

  private loadIdentity(identity: GeminiIdentityResult, traceId = import.meta.env.DEV ? `folder-view-${nanoid(10)}` : undefined, source = 'identity'): Promise<void> {
    const task = this.captureIdentity(identity, traceId, source)
    this.viewTask = task
    return task
  }

  private async captureIdentity(identity: GeminiIdentityResult, traceId: string | undefined, source: string): Promise<void> {
    const startedAt = import.meta.env.DEV ? performance.now() : 0
    if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.started', { traceId, source, mode: 'full', context: 'content', phase: 'projection' })
    const sequence = ++this.sequence
    this.publish({ loadingChatFolderIds: [] })
    const currentIdentity = this.state.identity
    const isSameAccount = currentIdentity.status === 'available'
      && identity.status === 'available'
      && currentIdentity.identity.accountScopeId === identity.identity.accountScopeId
    if (identity.status !== 'available') {
      ++this.accountSequence
      this.lastChangeRequestId = undefined
      this.projectionLoad = undefined
      this.publish({ identity, projection: undefined, syncState: undefined, picker: undefined, menu: undefined, dialog: undefined, error: undefined })
      return
    }

    const loading: ProjectionLoad = { accountScopeId: identity.identity.accountScopeId, refreshNeeded: false, syncStatusNeeded: false }
    this.projectionLoad = loading

    if (!isSameAccount) {
      ++this.accountSequence
      this.lastChangeRequestId = undefined
      ++this.settingsSequence
      this.publish({ identity, projection: undefined, syncState: undefined, picker: undefined, menu: undefined, dialog: undefined, error: undefined })
    }
    try {
      const projection = await folderBackgroundClient.getProjection(
        identity.identity.accountScopeId,
        identity.identity.source,
        isSameAccount ? this.state.projection : undefined,
        traceId,
      )
      const syncState = await folderBackgroundClient.getSyncStatus(identity.identity.accountScopeId, identity.identity.source, traceId)
      if (sequence === this.sequence) {
        if (syncState.localRevision && projection.dataRevision !== syncState.localRevision) {
          loading.refreshNeeded = true
          if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.fallback', { context: 'content', phase: 'projection', source, reason: 'status-revision-gap' })
        }
        // A sync refresh is also requested whenever the Gemini tab regains
        // focus. Keep active same-account UI surfaces so an unrelated refresh
        // cannot dismiss an editor or action menu mid-interaction. Account
        // changes still clear every transient UI surface.
        this.publish({
          identity,
          projection,
          syncState,
          picker: undefined,
          menu: isSameAccount ? this.state.menu : undefined,
          dialog: isSameAccount ? this.state.dialog : undefined,
          error: undefined,
        })
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.updated', { traceId, source, mode: 'full', context: 'content', phase: 'projection', result: 'success',
          durationMs: performance.now() - startedAt, dataRevision: projection.dataRevision, folders: projection.folders.length, memberships: projection.memberships.length })
        if (!isSameAccount) this.requestBrowserSync(undefined, false)
      } else {
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.discarded', { traceId, context: 'content', phase: 'projection', result: 'discarded', reason: 'sequence-changed', durationMs: performance.now() - startedAt })
      }
    } catch (error) {
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.failed', { traceId, context: 'content', phase: 'projection', result: 'failed', durationMs: performance.now() - startedAt })
      if (sequence === this.sequence) {
        this.publish({
          identity,
          projection: isSameAccount ? this.state.projection : undefined,
          syncState: isSameAccount ? this.state.syncState : undefined,
          picker: undefined,
          menu: isSameAccount ? this.state.menu : undefined,
          dialog: isSameAccount ? this.state.dialog : undefined,
          error: error instanceof Error && error.message === 'STALE_REVISION'
            ? tt('folders_save_failed', 'Could not complete this action.')
            : error instanceof Error ? error.message : 'Folders are unavailable',
        })
      }
    } finally {
      await this.finishProjectionLoad(loading, sequence, source)
    }
  }

  private scope(): string {
    const identity = this.state.identity
    if (identity.status !== 'available' || !this.state.projection) {
      throw new Error('Folders are unavailable until the Gemini identity is confirmed')
    }
    return identity.identity.accountScopeId
  }

  private projection(): FolderProjection {
    this.scope()
    if (!this.state.projection) throw new Error('Folders are unavailable until the Gemini identity is confirmed')
    return this.state.projection
  }

  private refresh(traceId?: string, source = 'command'): Promise<void> {
    if (this.projectionLoad) {
      this.projectionLoad.refreshNeeded = true
      return this.viewTask ?? Promise.resolve()
    }
    return this.loadIdentity(this.state.identity, traceId, source)
  }

  private reportRefreshError(accountScopeId: string, error: unknown): void {
    if (this.state.identity.status === 'available' && this.state.identity.identity.accountScopeId === accountScopeId) {
      this.publish({ error: error instanceof Error ? error.message : 'Folders are unavailable' })
    }
  }

  private async finishProjectionLoad(loading: ProjectionLoad, sequence: number, source: string): Promise<void> {
    if (this.projectionLoad !== loading) return
    this.projectionLoad = undefined
    if (sequence !== this.sequence) return
    // Keep at most one trailing refresh; unknown ranges require a complete baseline.
    if (loading.refreshNeeded) await this.refresh(undefined, source)
    else if (loading.settingsChange) await this.applyChange(loading.accountScopeId, loading.settingsChange, 'broadcast')
    else if (loading.syncStatusNeeded) await this.refreshSyncStatus()
  }

  private async applyChange(accountScopeId: string, change: FolderChange | undefined, source: string, returned?: { settings?: FolderSettingsRow; reference?: ChatReferenceRow }): Promise<void> {
    if (this.state.identity.status !== 'available' || this.state.identity.identity.accountScopeId !== accountScopeId) return
    if (change && change.accountScopeId !== accountScopeId) change = undefined
    if (change && change.requestId === this.lastChangeRequestId) {
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.deduplicated', { context: 'content', phase: 'projection', source, reason: 'request-id' })
      return
    }
    const loading = this.projectionLoad
    if (loading) {
      if (!change || change.requestId !== loading.requestId) {
        const affected = change?.affected
        if (change && affected?.settings && !affected.all && !affected.folders && !affected.folderMetadataIds && !affected.folderIds && !affected.chatIds) loading.settingsChange = change
        else loading.refreshNeeded = true
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.merged', { context: 'content', phase: 'projection', source, fallback: loading.refreshNeeded })
      }
      await this.viewTask
      return
    }
    const previous = this.state.projection
    const affected = change?.affected
    const localView = change && change.baseRevision === change.dataRevision && affected?.settings
      && !affected.all && !affected.folders && !affected.folderMetadataIds && !affected.folderIds && !affected.chatIds
    const knownRange = affected && (affected.folders || affected.folderMetadataIds?.length || affected.folderIds?.length || affected.chatIds?.length || affected.settings)
    if (!change || change.affected.all || !knownRange || !previous || (!localView && (!previous.dataRevision || previous.dataRevision !== change.baseRevision))) {
      // Equal organization revisions can deduplicate organization events, but not settings changes.
      if (change && knownRange && !change.affected.settings && !change.affected.all && previous?.dataRevision === change.dataRevision) return
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.fallback', { context: 'content', phase: 'projection', source,
        reason: !change ? 'unknown-change' : change.affected.all ? 'replacement' : 'revision-gap' })
      await this.refresh(undefined, source)
      return
    }
    const task = this.refreshChangedProjection(previous, change, source, returned)
    this.viewTask = task
    await task
  }

  private async refreshChangedProjection(previous: FolderProjection, change: FolderChange, source: string, returned?: { settings?: FolderSettingsRow; reference?: ChatReferenceRow }): Promise<void> {
    const startedAt = import.meta.env.DEV ? performance.now() : 0
    const sequence = ++this.sequence
    const loading: ProjectionLoad = { accountScopeId: change.accountScopeId, refreshNeeded: false, syncStatusNeeded: false, requestId: change.requestId }
    this.projectionLoad = loading
    this.publish({ loadingChatFolderIds: [] })
    try {
      const projection = await folderBackgroundClient.getChangedProjection(previous, change, this.identitySource(), returned)
      if (sequence !== this.sequence) {
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.discarded', {
          context: 'content', phase: 'projection', source, mode: 'partial', requestId: change.requestId, reason: 'sequence-changed',
        })
        return
      }
      this.lastChangeRequestId = change.requestId
      this.publish({ projection, error: undefined })
      if (change.dataRevision !== change.baseRevision) await this.refreshSyncStatus()
      if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.updated', {
        context: 'content', phase: 'projection', source, mode: 'partial', requestId: change.requestId, dataRevision: projection.dataRevision,
        result: 'success', durationMs: performance.now() - startedAt,
      })
    } catch (error) {
      if (sequence === this.sequence) {
        if (error instanceof Error && error.message === 'STALE_REVISION') {
          loading.refreshNeeded = true
          if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.fallback', { context: 'content', phase: 'projection', source, reason: 'query-revision-changed' })
        } else {
          this.reportRefreshError(change.accountScopeId, error)
          if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.failed', {
            context: 'content', phase: 'projection', source, mode: 'partial', requestId: change.requestId, result: 'failed', durationMs: performance.now() - startedAt,
          })
        }
      }
    } finally {
      await this.finishProjectionLoad(loading, sequence, source)
    }
  }

  private async command<T>(method: FolderRpcMethod, params: unknown, traceId?: string): Promise<T> {
    const accountScopeId = this.scope()
    const accountSequence = this.accountSequence
    const accountPath = window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
    const isCurrentAccount = () => accountSequence === this.accountSequence && this.state.identity.status === 'available' && this.state.identity.identity.accountScopeId === accountScopeId
      && (window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? '') === accountPath
    const result = traceId
      ? await folderBackgroundClient.request<T>(accountScopeId, this.identitySource(), method, params, traceId)
      : await folderBackgroundClient.request<T>(accountScopeId, this.identitySource(), method, params)
    if (!isCurrentAccount()) throw new Error('The Gemini account changed during this action')
    await this.applyChange(accountScopeId, result.change, 'command', method === 'updateChatTitle' ? { reference: result.data as ChatReferenceRow } : undefined)
    if (!isCurrentAccount()) throw new Error('The Gemini account changed during this action')
    return result.data
  }

  async loadMoreChats(folderId: string): Promise<void> {
    const cursor = this.state.projection?.chatCursors?.[folderId]
    if (!cursor || this.projectionLoad || this.state.loadingChatFolderIds?.includes(folderId)) return
    const accountScopeId = this.scope()
    const sequence = this.sequence
    this.publish({ loadingChatFolderIds: [...(this.state.loadingChatFolderIds ?? []), folderId] })
    try {
      const page = await folderBackgroundClient.getChatPage(accountScopeId, this.identitySource(), folderId, cursor)
      if (sequence !== this.sequence || !this.state.projection) return
      const projection = this.state.projection
      if (projection.dataRevision && page.dataRevision !== projection.dataRevision) throw new Error('STALE_REVISION')
      const memberships = new Map(projection.memberships.map((row) => [row.id, row]))
      const references = new Map(projection.chatReferences.map((row) => [row.chatId, row]))
      page.memberships.forEach((row) => memberships.set(row.id, row))
      page.chatReferences.forEach((row) => references.set(row.chatId, row))
      this.publish({
        projection: {
          ...projection,
          memberships: [...memberships.values()],
          chatReferences: [...references.values()],
          chatCursors: { ...projection.chatCursors, [folderId]: page.nextCursor },
        },
        error: undefined,
      })
    } catch (error) {
      if (sequence === this.sequence) {
        if (error instanceof Error && error.message === 'STALE_REVISION') {
          await this.refresh(undefined, 'pagination')
          return
        }
        this.publish({ error: error instanceof Error ? error.message : 'Unable to load Folder chats' })
      }
    } finally {
      if (sequence === this.sequence) {
        this.publish({ loadingChatFolderIds: this.state.loadingChatFolderIds?.filter((id) => id !== folderId) })
      }
    }
  }

  private async refreshSyncStatus(): Promise<void> {
    const identity = this.state.identity
    if (identity.status !== 'available') return
    const sequence = this.sequence
    const syncState = await folderBackgroundClient.getSyncStatus(
      identity.identity.accountScopeId,
      identity.identity.source,
    )
    if (
      sequence === this.sequence && this.state.identity.status === 'available'
      && this.state.identity.identity.accountScopeId === identity.identity.accountScopeId
    ) {
      this.publish({ syncState })
      if (syncState.localRevision && this.state.projection?.dataRevision && syncState.localRevision !== this.state.projection.dataRevision) {
        if (import.meta.env.DEV) logDevEvent('debug', '[Folders][projection]', 'projection.fallback', { context: 'content', phase: 'projection', source: 'status', reason: 'status-revision-gap' })
        if (this.projectionLoad) this.projectionLoad.refreshNeeded = true
        else await this.refresh(undefined, 'status-revision-gap')
      }
    }
  }

  private requestBrowserSync(traceId?: string, refreshStatus = false): void {
    const identity = this.state.identity
    if (identity.status !== 'available') {
      if (traceId) logFolderTrace(traceId, 'sync.skipped', { reason: 'identity-unavailable' })
      return
    }
    const now = Date.now()
    if (
      this.lastActivityHint?.accountScopeId === identity.identity.accountScopeId
      && now - this.lastActivityHint.requestedAt < ACTIVITY_HINT_COOLDOWN_MS
    ) {
      if (traceId) logFolderTrace(traceId, 'sync.skipped', { reason: 'recent-activity-hint' })
      return
    }
    this.lastActivityHint = { accountScopeId: identity.identity.accountScopeId, requestedAt: now }
    if (traceId) {
      if (import.meta.env.DEV) logFolderTrace(traceId, 'sync.requested', {
        accountScopeId: identity.identity.accountScopeId,
      })
    }
    void folderBackgroundClient.request(identity.identity.accountScopeId, identity.identity.source, 'activityHint', {})
      .then(async () => {
        if (refreshStatus) await this.refreshSyncStatus()
        if (traceId) {
          if (import.meta.env.DEV) logFolderTrace(traceId, 'sync.completed', {
            accountScopeId: identity.identity.accountScopeId,
          })
        }
      })
      .catch(async (error) => {
        if (traceId) {
          if (import.meta.env.DEV) logFolderTraceError(traceId, 'sync.failed', error, {
            accountScopeId: identity.identity.accountScopeId,
          })
        }
        // Local Folder changes stay durable in IndexedDB. Reload only the
        // separately persisted sync status without a second Sidebar query.
        if (refreshStatus) await this.refreshSyncStatus()
      })
  }

  async syncNow(): Promise<FolderSyncRunResult> {
    const identity = this.state.identity
    if (identity.status !== 'available') {
      throw new Error('Browser Sync requires an identified Gemini account')
    }
    try {
      return (await folderBackgroundClient.request<FolderSyncRunResult>(identity.identity.accountScopeId, identity.identity.source, 'retrySync', {})).data
    } finally {
      await this.refresh()
    }
  }

  async recreateSyncReplica(request: BrowserSyncRecreationRequest): Promise<FolderSyncRunResult> {
    const scope = this.scope()
    try {
      return (await folderBackgroundClient.request<FolderSyncRunResult>(scope, this.identitySource(), 'recreateSyncReplica', request)).data
    } finally {
      if (this.state.identity.status === 'available' && this.state.identity.identity.accountScopeId === scope) await this.refresh()
    }
  }

  async resolveSyncConflict(choice: 'remote' | 'local'): Promise<FolderSyncRunResult> {
    const scope = this.scope()
    const conflict = this.state.syncState?.conflict
    if (!conflict) return { outcome: 'deferred' }
    const result = await folderBackgroundClient.request<FolderSyncRunResult>(scope, this.identitySource(), 'resolveSyncConflict', {
      choice, expectedRevision: conflict.localRevision, snapshotId: conflict.snapshotId,
    })
    if (this.scope() === scope) await this.refresh()
    return result.data
  }

  async dismissCapacityNotice(displayedUsagePercent: number): Promise<void> {
    const identity = this.state.identity
    if (identity.status !== 'available') return
    await folderBackgroundClient.request(
      identity.identity.accountScopeId,
      identity.identity.source,
      'dismissCapacityNotice',
      { displayedUsagePercent },
    )
    await this.refreshSyncStatus()
  }

  async measureBrowserSyncUsage(): Promise<void> {
    const identity = this.state.identity
    if (identity.status !== 'available') return
    const result = await folderBackgroundClient.request<BrowserSyncStatusProjection>(
      identity.identity.accountScopeId,
      identity.identity.source,
      'measureBrowserSyncUsage',
      {},
    )
    if (this.state.identity.status === 'available'
      && this.state.identity.identity.accountScopeId === identity.identity.accountScopeId) {
      this.publish({ syncState: result.data })
    }
  }

  async reload(): Promise<void> {
    const sequence = this.sequence
    await geminiIdentityService.refresh()
    if (sequence === this.sequence) await this.refresh(undefined, 'manual')
    else await this.identityLoad
  }

  async createFolder(
    name: string,
    iconKey?: FolderIconKey,
    colorValue?: FolderColorValue,
    addToChat?: { chatId: string; cachedTitle?: string; traceId: string },
  ): Promise<FolderRow> {
    const identity = this.state.identity
    if (identity.status !== 'available') throw new Error('Folders are unavailable')
    let folder: FolderRow
    if (addToChat) {
      folder = (await this.command<{ folder: FolderRow }>('createFolderAndAddChat', { folder: { name, iconKey, colorValue }, chatId: addToChat.chatId, cachedTitle: addToChat.cachedTitle })).folder
    } else {
      folder = await this.command<FolderRow>('createFolder', { name, iconKey, colorValue })
    }
    this.closeDialog()
    this.closePicker()
    return folder
  }

  async updateFolder(folderId: string, patch: FolderUpdateInput): Promise<FolderRow> {
    const folder = await this.command<FolderRow>('updateFolder', { folderId, patch })
    this.closeDialog()
    return folder
  }

  async moveFolder(folderId: string, beforeId?: string, afterId?: string): Promise<void> {
    await this.command('moveFolder', { folderId, beforeId, afterId })
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.command('deleteFolder', { folderId })
    this.closeDialog()
  }

  async addMembership(
    folderId: string,
    chatId: string,
    cachedTitle?: string,
    traceId = import.meta.env.DEV ? createFolderTraceId() : '',
  ): Promise<FolderMembershipRow> {
    let accountScopeId: string | undefined
    try {
      accountScopeId = this.scope()
      if (import.meta.env.DEV) logFolderTrace(traceId, 'runtime.command-started', { accountScopeId, folderId, chatId })
      const membership = await this.command<FolderMembershipRow>('addMembership', { folderId, chatId, cachedTitle }, traceId)
      this.closePicker()
      const projected = import.meta.env.DEV && (this.state.projection?.memberships.some((row) => row.id === membership.id) ?? false)
      if (import.meta.env.DEV) logFolderTrace(traceId, 'runtime.projection-refreshed', {
        accountScopeId,
        folderId,
        chatId,
        membershipId: membership.id,
        projected,
      })
      return membership
    } catch (error) {
      if (import.meta.env.DEV) logFolderTraceError(traceId, 'runtime.command-failed', error, {
        accountScopeId,
        folderId,
        chatId,
      })
      throw error
    }
  }

  async moveMembership(folderId: string, chatId: string, beforeId?: string, afterId?: string): Promise<void> {
    await this.command('moveMembership', { folderId, targetFolderId: folderId, chatId, beforeId, afterId })
  }

  async completeNewChatTitle(chatId: string, title: string, expectedTitle: string): Promise<void> {
    await this.command<ChatReferenceRow>('updateChatTitle', { chatId, title, expectedTitle })
  }

  async setMembershipPinned(folderId: string, chatId: string, pinned: boolean): Promise<void> {
    const accountScopeId = this.scope()
    const accountPath = window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
    const isCurrentAccount = () => this.state.identity.status === 'available'
      && this.state.identity.identity.accountScopeId === accountScopeId
      && (window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? '') === accountPath
    this.closeMenu()
    try {
      await this.command('setMembershipPinned', { folderId, chatId, pinned })
    } catch (error) {
      if (isCurrentAccount()) this.publish({ error: error instanceof Error ? error.message : 'Unable to update chat pin' })
    }
  }

  async removeMembership(folderId: string, chatId: string): Promise<void> {
    await this.command('removeMembership', { folderId, chatId })
    this.closeDialog()
  }

  async deleteChat(folderId: string, chatId: string): Promise<void> {
    const accountScopeId = this.scope()
    const identitySource = this.identitySource()
    const protection = (await folderBackgroundClient.request<FolderSnapshotProtection>(accountScopeId, identitySource, 'prepareChatDeletion', {})).data
    try {
      if (this.scope() !== accountScopeId) throw new Error('The Gemini account changed during deletion')
      await deleteGeminiChat(chatId)
      await this.command('removeChatAfterGeminiDelete', {
        chatId, deletionReceipt: 'gemini-native-confirmed', protectionSnapshotId: protection.id,
      })
      this.closeDialog()
    } finally {
      try { await folderBackgroundClient.request(accountScopeId, identitySource, 'releaseSnapshot', { snapshotId: protection.id, protectionToken: protection.protectionToken }) } catch (error) {
        if (import.meta.env.DEV) logFolderTraceError('native-delete', 'recovery.protection-release-failed', error, { accountScopeId })
      }
    }
  }

  async renameChat(folderId: string, chatId: string, title: string): Promise<void> {
    const accountScopeId = this.scope()
    const dialog = this.state.dialog
    const accountPath = window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
    const isCurrentAccount = () => this.state.identity.status === 'available'
      && this.state.identity.identity.accountScopeId === accountScopeId
      && (window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? '') === accountPath
    const normalizedTitle = title.normalize('NFKC').trim()
    if (!normalizedTitle) throw new Error(tt('folders_chat_title_required', 'Enter a chat title.'))
    if (!this.projection().memberships.some((row) => row.folderId === folderId && row.chatId === chatId)) {
      throw new Error('The requested Folder chat is unavailable')
    }

    const reference = await this.command<ChatReferenceRow>('updateChatTitle', { chatId, title: normalizedTitle, expectedRevision: dialog?.kind === 'rename-chat' ? dialog.expectedRevision : undefined })
    if (!isCurrentAccount()) throw new Error('The Gemini account changed during rename')

    this.publish({
      syncState: this.state.syncState?.state === 'accepted-by-browser-storage'
        ? { ...this.state.syncState, state: 'local-changes-pending' }
        : this.state.syncState,
    })

    const result = await geminiApi.conversations.renameChat({ chat_id: chatId, title: reference.cachedTitle })
    if (!isCurrentAccount()) return
    if (!result.ok) {
      throw new Error(result.outcome === 'unknown'
        ? tt('folders_chat_rename_unknown', "Title saved in Folders. Gemini's rename result could not be confirmed. Check Gemini before trying again.")
        : tt('folders_chat_rename_failed', 'Title saved in Folders, but Gemini could not be renamed. Try again.'))
    }
    if (result.data.conversationId !== (chatId.startsWith('c_') ? chatId : `c_${chatId}`)
      || result.data.title !== reference.cachedTitle) {
      throw new Error(tt('folders_chat_rename_unknown', "Title saved in Folders. Gemini's rename result could not be confirmed. Check Gemini before trying again."))
    }
    if (this.state.dialog === dialog) this.closeDialog()
  }

  async updateSettings(patch: {
    enabled?: boolean
    hideOrganizedChats?: boolean
    collapsedFolderIds?: string[]
  }): Promise<void> {
    const accountScopeId = this.scope()
    const accountSequence = this.accountSequence
    const sequence = ++this.settingsSequence
    const result = await folderBackgroundClient.request<FolderSettingsRow>(accountScopeId, this.identitySource(), 'updateSettings', { patch })
    if (accountSequence === this.accountSequence) await this.applyChange(accountScopeId, result.change, 'command', sequence === this.settingsSequence ? { settings: result.data } : undefined)
  }

  async setFolderCollapsed(folderId: string, collapsed: boolean): Promise<void> {
    const collapsedFolderIds = new Set(this.projection().settings.collapsedFolderIds)
    if (collapsed) collapsedFolderIds.add(folderId)
    else collapsedFolderIds.delete(folderId)
    await this.updateSettings({ collapsedFolderIds: [...collapsedFolderIds] })
  }

  async getLocalStorageStatus(): Promise<FolderLocalStorageStatus> {
    return (await folderBackgroundClient.request<FolderLocalStorageStatus>(this.scope(), this.identitySource(), 'getLocalStorageStatus', {})).data
  }

  async createSnapshot(): Promise<FolderSnapshotSummary> {
    return (await folderBackgroundClient.request<FolderSnapshotSummary>(this.scope(), this.identitySource(), 'createSnapshot', {})).data
  }

  openPicker(
    chatId: string,
    anchorRect: DOMRect,
    traceId = import.meta.env.DEV ? createFolderTraceId() : '',
    cachedTitle?: string,
  ): void {
    if (this.state.projection && this.state.identity.status === 'available') {
      if (import.meta.env.DEV) logFolderTrace(traceId, 'runtime.picker-opened', {
        accountScopeId: this.state.identity.identity.accountScopeId,
        chatId,
      })
      this.publish({ picker: { chatId, anchorRect, traceId, cachedTitle }, menu: undefined })
    } else {
      if (import.meta.env.DEV) logFolderTrace(traceId, 'runtime.picker-rejected', {
        chatId,
        identityStatus: this.state.identity.status,
        projectionReady: Boolean(this.state.projection),
      })
    }
  }

  closePicker(): void {
    if (this.state.picker) this.publish({ picker: undefined })
  }

  openFolderMenu(folderId: string, folderName: string, anchorElement: HTMLElement): void {
    if (this.projection().folders.some((folder) => folder.id === folderId)) {
      this.publish({
        picker: undefined,
        menu: {
          kind: 'folder',
          folderId,
          folderName,
          anchorElement,
          anchorRect: anchorElement.getBoundingClientRect(),
        },
      })
    }
  }

  openChatMenu(folderId: string, chatId: string, chatTitle: string, anchorElement: HTMLElement): void {
    if (this.projection().memberships.some((membership) => (
      membership.folderId === folderId && membership.chatId === chatId
    ))) {
      this.publish({
        picker: undefined,
        menu: {
          kind: 'chat',
          folderId,
          chatId,
          chatTitle,
          anchorElement,
          anchorRect: anchorElement.getBoundingClientRect(),
        },
      })
    }
  }

  closeMenu(): void {
    if (this.state.menu) this.publish({ menu: undefined })
  }

  openCreateDialog(addToChat?: { chatId: string; cachedTitle?: string; traceId: string }): void {
    if (this.state.projection) this.publish({ menu: undefined, dialog: { kind: 'create', addToChat } })
  }

  openEditDialog(folderId: string): void {
    if (this.projection().folders.some((folder) => folder.id === folderId)) {
      this.publish({ menu: undefined, dialog: { kind: 'edit', folderId, expectedRevision: this.state.projection?.dataRevision ?? this.state.syncState?.localRevision } })
    }
  }

  openDeleteFolderDialog(folderId: string): void {
    const projection = this.projection()
    const subtreeFolderIds = new Set<string>([folderId])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of projection.folders) {
        if (!subtreeFolderIds.has(folder.id) && subtreeFolderIds.has(folder.parentFolderId)) {
          subtreeFolderIds.add(folder.id)
          changed = true
        }
      }
    }
    const affectedChatCount = new Set(
      projection.memberships
        .filter((membership) => subtreeFolderIds.has(membership.folderId))
        .map((membership) => membership.chatId),
    ).size
    this.publish({ menu: undefined, dialog: { kind: 'delete-folder', folderId, affectedChatCount } })
  }

  openRemoveMembershipDialog(folderId: string, chatId: string): void {
    if (this.projection().memberships.some((membership) => membership.folderId === folderId && membership.chatId === chatId)) {
      this.publish({ menu: undefined, dialog: { kind: 'remove-membership', folderId, chatId } })
    }
  }

  openDeleteChatDialog(folderId: string, chatId: string): void {
    if (this.projection().memberships.some((membership) => membership.folderId === folderId && membership.chatId === chatId)) {
      this.publish({ menu: undefined, dialog: { kind: 'delete-chat', folderId, chatId } })
    }
  }

  openRenameChatDialog(folderId: string, chatId: string, chatTitle: string): void {
    if (this.projection().memberships.some((row) => row.folderId === folderId && row.chatId === chatId)) {
      this.publish({ menu: undefined, dialog: { kind: 'rename-chat', folderId, chatId, chatTitle, expectedRevision: this.state.projection?.dataRevision ?? this.state.syncState?.localRevision } })
    }
  }

  closeDialog(): void {
    if (this.state.dialog) this.publish({ dialog: undefined })
  }

  async listSnapshots(): Promise<FolderSnapshotSummary[]> {
    return (await folderBackgroundClient.request<{ items: FolderSnapshotSummary[] }>(this.scope(), this.identitySource(), 'listSnapshots', { limit: 100 })).data.items
  }

  async restore(snapshot: FolderSnapshotSummary): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'restoreSnapshot', { snapshotId: snapshot.id })
    await this.refresh()
  }

  async exportJson(): Promise<string> {
    return JSON.stringify((await folderBackgroundClient.request(this.scope(), this.identitySource(), 'exportBackup', {})).data, null, 2)
  }

  async importJson(value: string): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'importBackup', { payload: JSON.parse(value) })
    await this.refresh()
  }

  async confirmManualEmail(email: string): Promise<void> {
    const identity = await geminiIdentityService.confirmManualEmail(email, true)
    if (identity.status !== 'available') throw new Error(tt('folders_account_save_error', 'Could not save this email. Try again.'))
    await this.identityLoad
  }

  getAccountHistory(): Promise<FolderAccountHistory> {
    return folderAccountHistory.get()
  }

  async selectSavedAccount(email: string): Promise<void> {
    const identity = await geminiIdentityService.confirmManualEmail(email, true, 'history')
    if (identity.status !== 'available') throw new Error(tt('folders_account_save_error', 'Could not save this email. Try again.'))
    await this.identityLoad
  }

  forgetAccount(accountScopeId: string): Promise<FolderAccountHistory> {
    return folderAccountHistory.forget(accountScopeId)
  }

  clearManualEmail(): void {
    geminiIdentityService.clearManualEmail()
  }

  private identitySource(): 'observed' | 'manual-confirmed' {
    const identity = this.state.identity
    if (identity.status !== 'available') throw new Error('Folders are unavailable')
    return identity.identity.source
  }
}

export const folderRuntime = new FolderRuntime()
