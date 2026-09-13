import type { FolderColorValue, FolderIconKey } from '@/domain/folder/appearance'
import type { FolderUpdateInput } from '@/domain/folder/commands'
import type {
  FolderMembershipRow,
  FolderProjection,
  FolderRow,
  FolderSnapshotRow,
} from '@/domain/folder/types'
import { geminiIdentityService, type GeminiIdentityResult } from '@/services/gemini-identity'
import { deleteGeminiChat } from './native-chat-delete'
import { browser } from 'wxt/browser'
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
  | { kind: 'edit'; folderId: string }
  | { kind: 'delete-folder'; folderId: string; affectedChatCount: number }
  | { kind: 'remove-membership'; folderId: string; chatId: string }
  | { kind: 'delete-chat'; folderId: string; chatId: string }

export interface FolderRuntimeState {
  identity: GeminiIdentityResult
  projection?: FolderProjection
  syncState?: BrowserSyncStatusProjection
  picker?: FolderPickerState
  menu?: FolderMenuState
  dialog?: FolderDialogState
  error?: string
}

type Listener = () => void

const ACTIVITY_HINT_COOLDOWN_MS = 30_000

/**
 * The sole content-side command boundary for Folders. React consumes its
 * projection and commands; only this runtime talks to the background client.
 */
export class FolderRuntime {
  private state: FolderRuntimeState = { identity: geminiIdentityService.getCurrent() }
  private readonly listeners = new Set<Listener>()
  private unsubscribeIdentity?: () => void
  private sequence = 0
  private invalidationListenerStarted = false
  private lastActivityHint?: { accountScopeId: string; requestedAt: number }

  private readonly handleBackgroundMessage = (message: unknown): void => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'folders:data-changed') return
    const changed = message as {
      accountScopeId?: unknown
      affected?: { folderIds?: unknown; chatIds?: unknown; settings?: unknown; syncStatus?: unknown }
    }
    const identity = this.state.identity
    if (identity.status !== 'available' || changed.accountScopeId !== identity.identity.accountScopeId) return
    // activityHint/retrySync publishes a syncStatus-only invalidation. It must
    // not make the content script re-query the entire Sidebar projection.
    // Folder records, memberships, and settings continue to use the complete
    // refresh path below.
    const affected = changed.affected
    const onlySyncStatusChanged = affected?.syncStatus === true
      && affected.folderIds === undefined
      && affected.chatIds === undefined
      && affected.settings === undefined
    if (onlySyncStatusChanged) {
      void this.refreshSyncStatus()
      return
    }
    void this.refresh()
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
    await geminiIdentityService.start()
    if (!this.unsubscribeIdentity) {
      let initialLoad: Promise<void> | undefined
      this.unsubscribeIdentity = geminiIdentityService.subscribe((result) => {
        const load = this.loadIdentity(result)
        initialLoad ??= load
        void load
      })
      // subscribe() synchronously supplies the current identity. Waiting for
      // that one load keeps startup deterministic without issuing a second
      // getSidebarState/getSyncStatus pair after identity initialization.
      await initialLoad
    }
    if (!this.invalidationListenerStarted) {
      browser.runtime.onMessage.addListener(this.handleBackgroundMessage)
      window.addEventListener('focus', this.handleSyncSignal)
      window.addEventListener('online', this.handleSyncSignal)
      this.invalidationListenerStarted = true
    }
    // The initial projection already includes the current sync status. The
    // startup activity hint only schedules background work, so reading that
    // same status again would be redundant.
    this.requestBrowserSync(undefined, false)
  }

  stop(): void {
    this.unsubscribeIdentity?.()
    this.unsubscribeIdentity = undefined
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

  private async loadIdentity(identity: GeminiIdentityResult): Promise<void> {
    const sequence = ++this.sequence
    const currentIdentity = this.state.identity
    const isSameAccount = currentIdentity.status === 'available'
      && identity.status === 'available'
      && currentIdentity.identity.accountScopeId === identity.identity.accountScopeId
    if (identity.status !== 'available') {
      this.publish({ identity, projection: undefined, syncState: undefined, picker: undefined, menu: undefined, dialog: undefined, error: undefined })
      return
    }

    try {
      const projection = await folderBackgroundClient.getProjection(identity.identity.accountScopeId, identity.identity.source)
      const syncState = await folderBackgroundClient.getSyncStatus(identity.identity.accountScopeId, identity.identity.source)
      if (sequence === this.sequence) {
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
      }
    } catch (error) {
      if (sequence === this.sequence) {
        this.publish({
          identity,
          projection: undefined,
          syncState: undefined,
          picker: undefined,
          menu: undefined,
          dialog: undefined,
          error: error instanceof Error ? error.message : 'Folders are unavailable',
        })
      }
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

  private async refresh(): Promise<void> {
    await this.loadIdentity(this.state.identity)
  }

  private async refreshSyncStatus(): Promise<void> {
    const identity = this.state.identity
    if (identity.status !== 'available') return
    const syncState = await folderBackgroundClient.getSyncStatus(
      identity.identity.accountScopeId,
      identity.identity.source,
    )
    if (
      this.state.identity.status === 'available'
      && this.state.identity.identity.accountScopeId === identity.identity.accountScopeId
    ) {
      this.publish({ syncState })
    }
  }

  private requestBrowserSync(traceId?: string, refreshStatus = false): void {
    const identity = this.state.identity
    if (identity.status !== 'available' || identity.identity.source !== 'observed') {
      if (traceId) logFolderTrace(traceId, 'sync.skipped', { reason: 'identity-not-observed' })
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
      logFolderTrace(traceId, 'sync.requested', {
        accountScopeId: identity.identity.accountScopeId,
      })
    }
    void folderBackgroundClient.request(identity.identity.accountScopeId, identity.identity.source, 'activityHint', {})
      .then(async () => {
        if (refreshStatus) await this.refreshSyncStatus()
        if (traceId) {
          logFolderTrace(traceId, 'sync.completed', {
            accountScopeId: identity.identity.accountScopeId,
          })
        }
      })
      .catch(async (error) => {
        if (traceId) {
          logFolderTraceError(traceId, 'sync.failed', error, {
            accountScopeId: identity.identity.accountScopeId,
          })
        }
        // Local Folder changes stay durable in IndexedDB. Reload only the
        // separately persisted sync status without a second Sidebar query.
        if (refreshStatus) await this.refreshSyncStatus()
      })
  }

  async syncNow(): Promise<void> {
    const identity = this.state.identity
    if (identity.status !== 'available' || identity.identity.source !== 'observed') {
      throw new Error('Browser Sync requires a verified Gemini account')
    }
    try {
      await folderBackgroundClient.request(identity.identity.accountScopeId, identity.identity.source, 'retrySync', {})
    } finally {
      await this.refresh()
    }
  }

  async reload(): Promise<void> {
    await this.refresh()
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
      folder = (await folderBackgroundClient.request<{ folder: FolderRow }>(this.scope(), identity.identity.source, 'createFolderAndAddChat', { folder: { name, iconKey, colorValue }, chatId: addToChat.chatId, cachedTitle: addToChat.cachedTitle })).data.folder
    } else {
      folder = (await folderBackgroundClient.request<FolderRow>(this.scope(), identity.identity.source, 'createFolder', { name, iconKey, colorValue })).data
    }
    this.closeDialog()
    this.closePicker()
    await this.refresh()
    return folder
  }

  async updateFolder(folderId: string, patch: FolderUpdateInput): Promise<FolderRow> {
    const folder = (await folderBackgroundClient.request<FolderRow>(this.scope(), this.identitySource(), 'updateFolder', { folderId, patch })).data
    this.closeDialog()
    await this.refresh()
    return folder
  }

  async moveFolder(folderId: string, beforeId?: string, afterId?: string): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'moveFolder', { folderId, beforeId, afterId })
    await this.refresh()
  }

  async deleteFolder(folderId: string): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'deleteFolder', { folderId })
    this.closeDialog()
    await this.refresh()
  }

  async addMembership(
    folderId: string,
    chatId: string,
    cachedTitle?: string,
    traceId = createFolderTraceId(),
  ): Promise<FolderMembershipRow> {
    let accountScopeId: string | undefined
    try {
      accountScopeId = this.scope()
      logFolderTrace(traceId, 'runtime.command-started', { accountScopeId, folderId, chatId })
      const membership = (await folderBackgroundClient.request<FolderMembershipRow>(accountScopeId, this.identitySource(), 'addMembership', { folderId, chatId, cachedTitle })).data
      logFolderTrace(traceId, 'runtime.repository-committed', {
        accountScopeId,
        folderId,
        chatId,
        membershipId: membership.id,
      })
      this.closePicker()
      await this.refresh()
      const projected = this.state.projection?.memberships.some((row) => (
        row.id === membership.id && !row.deletedAt
      )) ?? false
      logFolderTrace(traceId, 'runtime.projection-refreshed', {
        accountScopeId,
        folderId,
        chatId,
        membershipId: membership.id,
        projected,
      })
      return membership
    } catch (error) {
      logFolderTraceError(traceId, 'runtime.command-failed', error, {
        accountScopeId,
        folderId,
        chatId,
      })
      throw error
    }
  }

  async moveMembership(folderId: string, chatId: string, beforeId?: string, afterId?: string): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'moveMembership', { folderId, targetFolderId: folderId, chatId, beforeId, afterId })
    await this.refresh()
  }

  async removeMembership(folderId: string, chatId: string): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'removeMembership', { folderId, chatId })
    this.closeDialog()
    await this.refresh()
  }

  async deleteChat(folderId: string, chatId: string): Promise<void> {
    // The native delete adapter must report Gemini success before this method
    // is allowed to tombstone any local membership or title cache.
    await deleteGeminiChat(chatId)
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'removeChatAfterGeminiDelete', { chatId, deletionReceipt: 'gemini-native-confirmed' })
    this.closeDialog()
    await this.refresh()
  }

  async updateSettings(patch: {
    enabled?: boolean
    hideOrganizedChats?: boolean
    collapsedFolderIds?: string[]
  }): Promise<void> {
    await folderBackgroundClient.request(this.scope(), this.identitySource(), 'updateSettings', { patch })
    await this.refresh()
  }

  async setFolderCollapsed(folderId: string, collapsed: boolean): Promise<void> {
    const collapsedFolderIds = new Set(this.projection().settings.collapsedFolderIds)
    if (collapsed) collapsedFolderIds.add(folderId)
    else collapsedFolderIds.delete(folderId)
    await this.updateSettings({ collapsedFolderIds: [...collapsedFolderIds] })
  }

  async createSnapshot(): Promise<FolderSnapshotRow> {
    return (await folderBackgroundClient.request<FolderSnapshotRow>(this.scope(), this.identitySource(), 'createSnapshot', {})).data
  }

  openPicker(
    chatId: string,
    anchorRect: DOMRect,
    traceId = createFolderTraceId(),
    cachedTitle?: string,
  ): void {
    if (this.state.projection && this.state.identity.status === 'available') {
      logFolderTrace(traceId, 'runtime.picker-opened', {
        accountScopeId: this.state.identity.identity.accountScopeId,
        chatId,
      })
      this.publish({ picker: { chatId, anchorRect, traceId, cachedTitle }, menu: undefined })
    } else {
      logFolderTrace(traceId, 'runtime.picker-rejected', {
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
      this.publish({ menu: undefined, dialog: { kind: 'edit', folderId } })
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

  closeDialog(): void {
    if (this.state.dialog) this.publish({ dialog: undefined })
  }

  async listSnapshots(): Promise<FolderSnapshotRow[]> {
    return (await folderBackgroundClient.request<{ items: FolderSnapshotRow[] }>(this.scope(), this.identitySource(), 'listSnapshots', { limit: 100 })).data.items
  }

  async restore(snapshot: FolderSnapshotRow): Promise<void> {
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
    await geminiIdentityService.confirmManualEmail(email, true)
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
