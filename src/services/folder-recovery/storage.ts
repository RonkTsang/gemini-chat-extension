import { browser } from 'wxt/browser'

import { db } from '@/data/db'
import type { FolderLocalStorageStatus, FolderRecoveryStateRow, FolderSnapshotRow } from '@/domain/folder/types'
import { logDevError } from '@/utils/devLogger'
import { readRecoveryFailure } from './failure-fallback'

export const SNAPSHOT_LIMIT = 10
export const SNAPSHOT_PRIORITY_LIMIT = 3
export const SNAPSHOT_BUDGET_BYTES = 20 * 1024 * 1024
export const SNAPSHOT_GROUP_GAP_MS = 60_000
export const SNAPSHOT_GROUP_MAX_MS = 5 * 60_000
export const SNAPSHOT_PROTECTION_TTL_MS = 15 * 60_000

export interface LocalStorageEstimate { usage?: number; quota?: number }
export interface FolderRecoveryOptions {
  budgetBytes?: number
}

export class FolderRecoveryError extends Error {
  constructor(readonly code: 'LOCAL_STORAGE_FULL' | 'SNAPSHOT_BUDGET_EXCEEDED' | 'SNAPSHOT_TOO_LARGE' | 'SNAPSHOT_PROTECTION_FAILED', options?: ErrorOptions) {
    super(code, options)
    this.name = 'FolderRecoveryError'
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'QuotaExceededError' || error.name === 'QuotaExceeded'
    || ('inner' in error && isQuotaError(error.inner))
}

export function classifyRecoveryFailure(error: unknown): NonNullable<FolderRecoveryStateRow['warning']> {
  if (error instanceof FolderRecoveryError) {
    if (error.code === 'LOCAL_STORAGE_FULL') return 'quota-exceeded'
    if (error.code === 'SNAPSHOT_TOO_LARGE') return 'snapshot-too-large'
    if (error.code === 'SNAPSHOT_BUDGET_EXCEEDED') return 'budget-exceeded'
  }
  return isQuotaError(error) ? 'quota-exceeded' : 'snapshot-failed'
}

export async function estimateLocalStorage(): Promise<LocalStorageEstimate | undefined> {
  // This module runs in the extension origin, never in a Gemini content script.
  if (!navigator.storage?.estimate) return undefined
  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (usage === undefined || quota === undefined || !Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return undefined
    return { usage, quota }
  } catch (error) {
    logDevError('[Folders]', 'recovery.storage-estimate-failed', error)
    return undefined
  }
}

export async function hasUnlimitedStorage(): Promise<boolean> {
  return browser.permissions?.contains
    ? browser.permissions.contains({ permissions: ['unlimitedStorage'] })
    : false
}

/** Logical UTF-8 budget; browser disk usage also includes indexes and overhead. */
export function snapshotBytes(row: FolderSnapshotRow): number {
  return new TextEncoder().encode(JSON.stringify(row)).byteLength
}

export function isImportant(row: FolderSnapshotRow): boolean {
  return row.reason !== 'automatic' || !!row.reasons?.some((reason) => reason !== 'automatic')
}

export function newestSnapshots(rows: FolderSnapshotRow[]): FolderSnapshotRow[] {
  return [...rows].sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
    || right.id.localeCompare(left.id))
}

export async function pruneRecoveryHistory(): Promise<void> {
  await db.transaction('rw', db.folder_snapshots, () => trimSnapshots(SNAPSHOT_BUDGET_BYTES))
}

/** Must be called inside a snapshots read/write transaction. */
export async function trimSnapshots(budgetBytes: number, keepIds: string[] = [], reclaimBytes = 0): Promise<void> {
  const rows = newestSnapshots(await db.folder_snapshots.toArray())
  const locked = new Set(rows.filter((row) => Date.parse(row.protectedUntil ?? '') > Date.now()).map((row) => row.id))
  keepIds.forEach((id) => locked.add(id))
  const retained = new Set<string>(locked)
  const scopes = new Set(rows.map((row) => row.accountScopeId))
  for (const scope of scopes) {
    const accountRows = rows.filter((row) => row.accountScopeId === scope)
    const selected = new Set(accountRows.filter((row) => locked.has(row.id)).map((row) => row.id))
    if (selected.size > SNAPSHOT_LIMIT) throw new FolderRecoveryError('SNAPSHOT_BUDGET_EXCEEDED')
    for (const row of accountRows.filter(isImportant).slice(0, SNAPSHOT_PRIORITY_LIMIT)) {
      if (selected.size < SNAPSHOT_LIMIT) selected.add(row.id)
    }
    for (const row of accountRows) {
      if (selected.size < SNAPSHOT_LIMIT) selected.add(row.id)
    }
    selected.forEach((id) => retained.add(id))
  }
  let total = rows.filter((row) => retained.has(row.id)).reduce((sum, row) => sum + snapshotBytes(row), 0)
  let reclaimed = rows.filter((row) => !retained.has(row.id)).reduce((sum, row) => sum + snapshotBytes(row), 0)
  const candidates = [...rows].reverse().filter((row) => retained.has(row.id) && !locked.has(row.id))
    .sort((left, right) => Number(isImportant(left)) - Number(isImportant(right)))
  for (const row of candidates) {
    if (total <= budgetBytes && reclaimed >= reclaimBytes) break
    const bytes = snapshotBytes(row)
    retained.delete(row.id)
    total -= bytes
    reclaimed += bytes
  }
  if (total > budgetBytes) throw new FolderRecoveryError('SNAPSHOT_BUDGET_EXCEEDED')
  await db.folder_snapshots.bulkDelete(rows.filter((row) => !retained.has(row.id)).map((row) => row.id))
}

export async function getLocalStorageStatus(accountScopeId: string): Promise<FolderLocalStorageStatus> {
  const [estimate, unlimited, rows, state] = await Promise.all([
    estimateLocalStorage(), hasUnlimitedStorage(), db.folder_snapshots.toArray(), db.folder_recovery_states.get(accountScopeId),
  ])
  const bytes = rows.reduce((sum, row) => sum + snapshotBytes(row), 0)
  const transientWarning = readRecoveryFailure(accountScopeId)
  const accountSnapshots = newestSnapshots(rows.filter((row) => row.accountScopeId === accountScopeId))
  return {
    snapshotCount: accountSnapshots.length,
    lastSnapshotAt: accountSnapshots[0]?.updatedAt ?? accountSnapshots[0]?.createdAt,
    usageBytes: estimate?.usage, quotaBytes: estimate?.quota,
    snapshotBytes: bytes, snapshotBudgetBytes: SNAPSHOT_BUDGET_BYTES, unlimited,
    low: (transientWarning ?? state?.warning) === 'quota-exceeded',
    warning: transientWarning ?? state?.warning,
    automaticSnapshotFailed: !!transientWarning || state?.automaticSnapshotFailed,
  }
}
