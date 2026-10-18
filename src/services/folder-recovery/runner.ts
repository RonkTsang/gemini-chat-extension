import { db } from '@/data/db'
import { folderRepository, type FolderRepository } from '@/data/repositories/folderRepository'
import { publishFolderInvalidation } from '@/entrypoints/background/folders/invalidation'
import { logDevError, logDevEvent } from '@/utils/devLogger'
import { isRecoveryCoolingDown, rememberRecoveryFailure } from './failure-fallback'
import { classifyRecoveryFailure } from './storage'

const PAGE_SIZE = 20
const LABEL = '[Folders][recovery]'

/** One execution slot; all pending demand and group metadata stay in IndexedDB. */
export class FolderRecoveryRunner {
  private running = false
  private requested = false
  private cursor = ''

  constructor(private readonly repository: FolderRepository = folderRepository) {}

  requestRun(accountScopeId?: string): void {
    logDevEvent('debug', LABEL, 'recovery.requested', { accountScopeId, coalesced: this.running })
    if (this.running) { this.requested = true; return }
    this.running = true
    // Heavy reads and encoding start only after the command can return.
    setTimeout(() => { void this.drain() }, 0)
  }

  private async drain(): Promise<void> {
    try {
      do {
        this.requested = false
        await this.scanOnce()
      } while (this.requested)
    } catch (error) {
      logDevError(LABEL, 'recovery.scan-failed', error)
    } finally {
      this.running = false
    }
  }

  private async scanOnce(): Promise<void> {
    const maximum = (await db.folder_recovery_states.orderBy('accountScopeId').last())?.accountScopeId
    if (!maximum) return
    const pivot = this.cursor <= maximum ? this.cursor : ''
    // Fixed ranges ensure that failures/cache eviction cannot cause a rescan loop.
    for (const [lower, upper] of [[pivot, maximum], ['', pivot]]) {
      if (lower >= upper) continue
      let after = lower
      while (after < upper) {
        const rows = await db.folder_recovery_states.where('accountScopeId').between(after, upper, false, true).limit(PAGE_SIZE).toArray()
        if (!rows.length) break
        for (const state of rows) {
          this.cursor = state.accountScopeId
          if (state.pendingRevision) await this.process(state.accountScopeId, state.pendingRevision)
        }
        after = rows[rows.length - 1].accountScopeId
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
  }

  private async process(accountScopeId: string, pendingRevision: string): Promise<void> {
    if (isRecoveryCoolingDown(accountScopeId, pendingRevision)) {
      logDevEvent('debug', LABEL, 'recovery.cooldown-skipped', { accountScopeId, pendingRevision })
      return
    }
    let capturedPendingRevision = pendingRevision
    let dataRevision = 'uninitialized'
    try {
      const capture = await this.repository.getAccountDataWithRevision(accountScopeId)
      dataRevision = capture.dataRevision
      if (!capture.pendingRevision) return
      capturedPendingRevision = capture.pendingRevision
      if (isRecoveryCoolingDown(accountScopeId, capturedPendingRevision)) return
      logDevEvent('info', LABEL, 'recovery.captured', {
        accountScopeId, capturedDataRevision: capture.dataRevision, capturedPendingRevision,
      })
      const snapshot = await this.repository.createSnapshot(accountScopeId, 'automatic', false, capture)
      const current = await db.folder_recovery_states.get(accountScopeId).catch((error) => {
        logDevError(LABEL, 'recovery.completion-status-read-failed', error, { accountScopeId })
        return undefined
      })
      if (current?.pendingRevision && current.pendingRevision !== capturedPendingRevision) this.requested = true
      logDevEvent('info', LABEL, 'recovery.completed', {
        accountScopeId, snapshotId: snapshot.id, capturedDataRevision: capture.dataRevision,
        capturedPendingRevision, pendingRevision: current?.pendingRevision,
      })
    } catch (error) {
      rememberRecoveryFailure(accountScopeId, classifyRecoveryFailure(error), capturedPendingRevision)
      logDevError(LABEL, 'recovery.attempt-ended', error, { accountScopeId, capturedPendingRevision })
    }
    // Status delivery cannot restart or reclassify a completed snapshot attempt.
    void publishFolderInvalidation({ type: 'folders:data-changed', accountScopeId, dataRevision, affected: { syncStatus: true, recoveryStatus: true } })
      .catch((error) => logDevError(LABEL, 'recovery.notification-failed', error, { accountScopeId }))
  }
}
