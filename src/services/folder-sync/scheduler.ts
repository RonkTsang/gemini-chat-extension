import { browser } from 'wxt/browser'

import { logDevEvent } from '@/utils/devLogger'
import { FolderSyncCoordinator } from './coordinator'

export type FolderSyncRunReason =
  | 'outbox-created'
  | 'browser-sync-area-changed'
  | 'background-resume'
  | 'retry-alarm'
  | 'content-activity-hint'
  | 'user-retry'

const ALARM_PREFIX = 'gpk-folders-retry:'
const ACTIVITY_HINT_MIN_INTERVAL_MS = 30_000
const MAX_ACTIVITY_HINT_SCOPES = 128
const LOG_LABEL = '[Folders][sync]'

/**
 * The Set only coalesces work during one service-worker lifetime. Every fact
 * that makes a later run necessary remains in IndexedDB or storage.sync.
 */
export class FolderSyncScheduler {
  private readonly running = new Set<string>()
  /** One trailing pass per scope prevents commands committed mid-run from being lost. */
  private readonly rerunRequested = new Map<string, { reason: FolderSyncRunReason; traceId?: string }>()
  // A bounded, best-effort cross-tab rate limiter. Correctness never depends
  // on it: writes, alarms, and manifest changes all bypass this cache.
  private readonly lastActivityHintAt = new Map<string, number>()

  constructor(private readonly coordinator = new FolderSyncCoordinator()) {}

  requestRun(accountScopeId: string, reason: FolderSyncRunReason, traceId?: string): void {
    if (reason === 'content-activity-hint' && !this.acceptActivityHint(accountScopeId)) return
    this.startRun(accountScopeId, reason, traceId)
  }

  private startRun(accountScopeId: string, reason: FolderSyncRunReason, traceId?: string): void {
    if (this.running.has(accountScopeId)) {
      const trailing = this.rerunRequested.get(accountScopeId)
      // A background activity hint is advisory. It must not downgrade an
      // already queued command, storage, alarm, or explicit retry wake-up.
      if (!trailing || trailing.reason === 'content-activity-hint' || reason !== 'content-activity-hint') {
        this.rerunRequested.set(accountScopeId, { reason, traceId })
      }
      logDevEvent('debug', LOG_LABEL, 'browser-sync.scheduler.coalesced', { accountScopeId, reason, traceId })
      return
    }
    logDevEvent('debug', LOG_LABEL, 'browser-sync.scheduler.requested', { accountScopeId, reason, traceId })
    this.running.add(accountScopeId)
    void this.coordinator.sync(accountScopeId, traceId)
      .then((result) => result.retryAt ? this.scheduleRetry(accountScopeId, result.retryAt) : undefined)
      .catch(() => this.scheduleRetry(accountScopeId))
      .finally(() => {
        this.running.delete(accountScopeId)
        const trailing = this.rerunRequested.get(accountScopeId)
        if (!trailing) return
        this.rerunRequested.delete(accountScopeId)
        // The hint was rate-limited when it originally arrived. Do not apply
        // the same throttle again while consuming the accepted trailing work.
        this.startRun(accountScopeId, trailing.reason, trailing.traceId)
      })
  }

  async scheduleRetry(accountScopeId: string, retryAt?: string): Promise<void> {
    const delayInMinutes = retryAt
      ? Math.max(1, (Date.parse(retryAt) - Date.now()) / 60_000)
      : 1
    await browser.alarms.create(`${ALARM_PREFIX}${accountScopeId}`, { delayInMinutes })
    logDevEvent('debug', LOG_LABEL, 'browser-sync.retry.scheduled', { accountScopeId, retryAt, delayInMinutes })
  }

  handleAlarm(name: string): void {
    if (!name.startsWith(ALARM_PREFIX)) return
    const accountScopeId = name.slice(ALARM_PREFIX.length)
    if (/^[A-Za-z0-9_-]{16,128}$/u.test(accountScopeId)) this.requestRun(accountScopeId, 'retry-alarm')
  }

  private acceptActivityHint(accountScopeId: string): boolean {
    const now = Date.now()
    const previous = this.lastActivityHintAt.get(accountScopeId)
    if (previous !== undefined && now - previous < ACTIVITY_HINT_MIN_INTERVAL_MS) return false
    // Refresh insertion order, then cap the in-memory hint cache.
    this.lastActivityHintAt.delete(accountScopeId)
    this.lastActivityHintAt.set(accountScopeId, now)
    while (this.lastActivityHintAt.size > MAX_ACTIVITY_HINT_SCOPES) {
      const oldest = this.lastActivityHintAt.keys().next().value
      if (oldest === undefined) break
      this.lastActivityHintAt.delete(oldest)
    }
    return true
  }
}
