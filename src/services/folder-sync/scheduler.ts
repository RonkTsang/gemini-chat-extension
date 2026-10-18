import { browserSyncChangeAuthor, folderSyncKeyScope } from '@/services/folder-sync/providers/browser-sync'
import { runtimeFolderDeviceIdProvider, type FolderDeviceIdProvider } from '@/services/folder-data/device-id'
import { browser } from 'wxt/browser'

import { logDevError, logDevEvent } from '@/utils/devLogger'
import { FolderSyncCoordinator } from './coordinator'
import type { BrowserSyncRecreationRequest, FolderSyncRunResult } from '@/domain/folder/types'

export type FolderSyncRunReason =
  | 'local-changes-committed'
  | 'browser-sync-area-changed'
  | 'background-resume'
  | 'retry-alarm'
  | 'content-activity-hint'
  | 'user-retry'

const ALARM_PREFIX = 'gpk-folders-retry:'
const ACTIVITY_HINT_MIN_INTERVAL_MS = 30_000
const MAX_ACTIVITY_HINT_SCOPES = 128
const LOG_LABEL = '[Folders][sync]'

interface SyncWake {
  reason: FolderSyncRunReason
  traceId?: string
}

function preferWake(current: SyncWake | undefined, incoming: SyncWake): SyncWake {
  const priority = (reason: FolderSyncRunReason): number => reason === 'content-activity-hint' ? 0 : reason === 'browser-sync-area-changed' ? 1 : 2
  return !current || priority(incoming.reason) >= priority(current.reason) ? incoming : current
}

/**
 * The Map only coalesces work during one service-worker lifetime. Every fact
 * that makes a later run necessary remains in IndexedDB or storage.sync.
 */
export class FolderSyncScheduler {
  private readonly runs = new Map<string, { started: boolean; request: SyncWake; trailing?: SyncWake }>()
  // A bounded, best-effort cross-tab rate limiter. Correctness never depends
  // on it: writes, alarms, and manifest changes all bypass this cache.
  private readonly lastActivityHintAt = new Map<string, number>()

  constructor(private readonly coordinator = new FolderSyncCoordinator(),
    private readonly deviceIdProvider: FolderDeviceIdProvider = runtimeFolderDeviceIdProvider) {}

  requestRun(accountScopeId: string, reason: FolderSyncRunReason, traceId?: string): void {
    if (reason === 'content-activity-hint' && !this.acceptActivityHint(accountScopeId)) return
    this.startRun(accountScopeId, reason, traceId)
  }

  async retry(accountScopeId: string, recreation?: BrowserSyncRecreationRequest): Promise<FolderSyncRunResult> {
    if (this.runs.has(accountScopeId)) return { outcome: 'busy' }
    const run = { started: true, request: { reason: 'user-retry' as const } }
    this.runs.set(accountScopeId, run)
    try {
      const result = recreation ? await this.coordinator.recreateMissingReplica(accountScopeId, recreation)
        : await this.coordinator.sync(accountScopeId)
      await this.finishRun(accountScopeId, result)
      return result
    } finally {
      const current = this.runs.get(accountScopeId)
      this.runs.delete(accountScopeId)
      if (current?.trailing) this.startRun(accountScopeId, current.trailing.reason, current.trailing.traceId)
    }
  }

  async resolveConflict(accountScopeId: string, choice: 'remote' | 'local', expectedRevision: string, snapshotId: string): Promise<FolderSyncRunResult> {
    const result = await this.coordinator.resolveConflict(accountScopeId, choice, expectedRevision, snapshotId)
    await this.finishRun(accountScopeId, result)
    return result
  }

  requestStorageChanges(changes: Record<string, unknown>, traceId?: string): void {
    // Retain only bounded metadata while identity loads, never notification payloads.
    const authors = new Map<string, string | undefined>()
    for (const [key, change] of Object.entries(changes)) {
      const scope = folderSyncKeyScope(key)
      if (!scope) continue
      const did = browserSyncChangeAuthor(key, change)
      authors.set(scope, authors.has(scope) && authors.get(scope) !== did ? undefined : did)
    }
    const candidates: Array<[string, string]> = []
    for (const [scope, did] of authors) {
      if (did === undefined) this.requestRun(scope, 'browser-sync-area-changed', traceId)
      else candidates.push([scope, did])
    }
    if (!candidates.length) return
    void Promise.resolve().then(() => this.deviceIdProvider.getDeviceId()).then((localDid) => {
      for (const [scope, did] of candidates) {
        if (did === localDid) logDevEvent('debug', LOG_LABEL, 'browser-sync.storage.own-echo-skipped', { accountScopeId: scope, traceId })
        else this.requestRun(scope, 'browser-sync-area-changed', traceId)
      }
    }).catch(() => {
      // Identity is an optimization: failure must preserve the ordinary full check.
      for (const [scope] of candidates) this.requestRun(scope, 'browser-sync-area-changed', traceId)
    })
  }

  private startRun(accountScopeId: string, reason: FolderSyncRunReason, traceId?: string): void {
    const current = this.runs.get(accountScopeId)
    if (current) {
      // Requests received before execution are covered by its first read.
      // Once execution starts, keep one trailing pass for concurrent changes.
      if (current.started) current.trailing = preferWake(current.trailing, { reason, traceId })
      else current.request = preferWake(current.request, { reason, traceId })
      logDevEvent('debug', LOG_LABEL, 'browser-sync.scheduler.coalesced', { accountScopeId, reason, traceId, phase: current.started ? 'running' : 'queued' })
      return
    }
    logDevEvent('debug', LOG_LABEL, 'browser-sync.scheduler.requested', { accountScopeId, reason, traceId })
    const run: { started: boolean; request: SyncWake; trailing?: SyncWake } = { started: false, request: { reason, traceId } }
    this.runs.set(accountScopeId, run)
    void new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(() => {
        run.started = true
        return run.request.reason === 'browser-sync-area-changed'
          ? this.coordinator.sync(accountScopeId, run.request.traceId, true)
          : this.coordinator.sync(accountScopeId, run.request.traceId)
      })
      .then((result) => this.finishRun(accountScopeId, result))
      .catch(() => this.scheduleRetry(accountScopeId))
      .finally(() => {
        this.runs.delete(accountScopeId)
        const trailing = run.trailing
        if (!trailing) return
        // The hint was rate-limited when it originally arrived. Do not apply
        // the same throttle again while consuming the accepted trailing work.
        this.startRun(accountScopeId, trailing.reason, trailing.traceId)
      })
      .catch((error) => logDevError(LOG_LABEL, 'browser-sync.retry-alarm-failed', error, { accountScopeId }))
  }

  async scheduleRetry(accountScopeId: string, retryAt?: string): Promise<void> {
    const delayInMinutes = retryAt
      ? Math.max(1, (Date.parse(retryAt) - Date.now()) / 60_000)
      : 1
    const name = `${ALARM_PREFIX}${accountScopeId}`
    const existing = await browser.alarms.get(name)
    if (existing && existing.scheduledTime <= Date.now() + delayInMinutes * 60_000) return
    await browser.alarms.create(name, { delayInMinutes })
    logDevEvent('debug', LOG_LABEL, 'browser-sync.retry.scheduled', { accountScopeId, retryAt, delayInMinutes })
  }

  private async finishRun(accountScopeId: string, result: FolderSyncRunResult): Promise<void> {
    if (result.retryAt) await this.scheduleRetry(accountScopeId, result.retryAt)
    else await browser.alarms.clear(`${ALARM_PREFIX}${accountScopeId}`)
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
