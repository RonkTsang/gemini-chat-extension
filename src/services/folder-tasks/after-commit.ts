import type { FolderCommit } from '@/domain/folder/types'
import type { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import type { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import { logDevError, logDevEvent } from '@/utils/devLogger'

export function dispatchFolderAfterCommit(commit: FolderCommit, sync: FolderSyncScheduler, recovery: FolderRecoveryRunner): void {
  logDevEvent('debug', '[Folders]', 'mutation.after-commit', { ...commit })
  if (commit.effect === 'organization' || commit.effect === 'sync-settings') {
    try { sync.requestRun(commit.accountScopeId, 'local-changes-committed') } catch (error) {
      logDevError('[Folders]', 'mutation.sync-wake-failed', error, { ...commit })
    }
  }
  if (commit.effect === 'organization') {
    try { recovery.requestRun(commit.accountScopeId) } catch (error) {
      logDevError('[Folders]', 'mutation.recovery-wake-failed', error, { ...commit })
    }
  }
}
