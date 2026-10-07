import type { FolderRecoveryStateRow } from '@/domain/folder/types'

// A best-effort bridge for the current worker lifetime when even the recovery
// failure record cannot be written. It never replaces durable bookkeeping.
const failures = new Map<string, { warning: NonNullable<FolderRecoveryStateRow['warning']>; expiresAt: number }>()
const FAILURE_TTL_MS = 5 * 60_000
const MAX_FAILURES = 20

export function rememberRecoveryFailure(accountScopeId: string, warning: NonNullable<FolderRecoveryStateRow['warning']>): void {
  const now = Date.now()
  for (const [scope, entry] of failures) if (entry.expiresAt <= now) failures.delete(scope)
  failures.delete(accountScopeId)
  if (failures.size >= MAX_FAILURES) failures.delete(failures.keys().next().value!)
  failures.set(accountScopeId, { warning, expiresAt: now + FAILURE_TTL_MS })
}

export function readRecoveryFailure(accountScopeId: string): FolderRecoveryStateRow['warning'] {
  const entry = failures.get(accountScopeId)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    failures.delete(accountScopeId)
    return undefined
  }
  return entry.warning
}

export function clearRecoveryFailure(accountScopeId: string): void {
  failures.delete(accountScopeId)
}
