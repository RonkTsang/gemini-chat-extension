import { browser } from 'wxt/browser'

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

/**
 * The Set only coalesces work during one service-worker lifetime. Every fact
 * that makes a later run necessary remains in IndexedDB or storage.sync.
 */
export class FolderSyncScheduler {
  private readonly running = new Set<string>()
  // A bounded, best-effort cross-tab rate limiter. Correctness never depends
  // on it: writes, alarms, and manifest changes all bypass this cache.
  private readonly lastActivityHintAt = new Map<string, number>()

  constructor(private readonly coordinator = new FolderSyncCoordinator()) {}

  requestRun(accountScopeId: string, reason: FolderSyncRunReason): void {
    if (reason === 'content-activity-hint' && !this.acceptActivityHint(accountScopeId)) return
    if (this.running.has(accountScopeId)) return
    this.running.add(accountScopeId)
    void this.coordinator.sync(accountScopeId)
      .catch(() => this.scheduleRetry(accountScopeId))
      .finally(() => this.running.delete(accountScopeId))
  }

  async scheduleRetry(accountScopeId: string): Promise<void> {
    await browser.alarms.create(`${ALARM_PREFIX}${accountScopeId}`, { delayInMinutes: 1 })
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
