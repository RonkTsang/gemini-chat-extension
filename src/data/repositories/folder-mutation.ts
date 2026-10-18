import type { Table } from 'dexie'

import { db } from '@/data/db'
import type { FolderCommit, FolderMutationEffect, FolderMutationResult } from '@/domain/folder/types'
import { logDevError, logDevEvent } from '@/utils/devLogger'

/** Called inside the same transaction as the organization write. */
export async function markRecoveryPending(accountScopeId: string, dataRevision: string): Promise<void> {
  const state = await db.folder_recovery_states.get(accountScopeId)
  await db.folder_recovery_states.put({ ...state, accountScopeId, pendingRevision: dataRevision, updatedAt: new Date().toISOString() })
}

/** Keeps domain writes and their post-commit intent atomic, without running tasks. */
export async function runFolderMutation<T>(
  accountScopeId: string,
  tables: Table[],
  action: () => Promise<T>,
  effect?: () => FolderMutationEffect | undefined,
): Promise<FolderMutationResult<T>> {
  logDevEvent('debug', '[Folders]', 'mutation.transaction-started', { accountScopeId })
  try {
    const result = await db.transaction('rw', [...tables, db.folder_sync_states, db.folder_recovery_states], async () => {
      const prior = await db.folder_sync_states.get(accountScopeId)
      const data = await action()
      const state = await db.folder_sync_states.get(accountScopeId)
      const dataRevision = state?.localDataRevision ?? 'uninitialized'
      const actualEffect = effect ? effect() : prior?.localDataRevision !== state?.localDataRevision ? 'organization' : undefined
      if (actualEffect === 'organization') await markRecoveryPending(accountScopeId, dataRevision)
      const commit: FolderCommit = { accountScopeId, dataRevision, effect: actualEffect }
      return { data, commit }
    })
    logDevEvent('info', '[Folders]', 'mutation.transaction-committed', { ...result.commit })
    return result
  } catch (error) {
    logDevError('[Folders]', 'mutation.transaction-rolled-back', error, { accountScopeId })
    throw error
  }
}
