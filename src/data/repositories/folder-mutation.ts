import { beginFolderAccess } from '../folder-access'
import type { Table } from 'dexie'

import { db } from '@/data/db'
import type { FolderCommit, FolderMutationEffect, FolderMutationResult } from '@/domain/folder/types'

/** Called inside the same transaction as the organization write. */
export async function markRecoveryPending(accountScopeId: string, dataRevision: string): Promise<void> {
  const state = await db.folder_recovery_states.get(accountScopeId)
  await db.folder_recovery_states.put({ ...state, accountScopeId, pendingRevision: dataRevision, updatedAt: new Date().toISOString() })
}

/** Keeps domain writes and their post-commit intent atomic, without running tasks. */
export async function runFolderMutation<T>(
  operation: string,
  accountScopeId: string,
  tables: Table[],
  action: () => Promise<T>,
  effect?: () => FolderMutationEffect | undefined,
): Promise<FolderMutationResult<T>> {
  let finish: ReturnType<typeof beginFolderAccess> | undefined
  let capturedRevision: string | undefined
  const pending = db.transaction('rw', [...tables, db.folder_sync_states, db.folder_recovery_states], async (transaction) => {
    if (import.meta.env.DEV) finish = beginFolderAccess(transaction, { operation, phase: 'transaction', accountScopeId })
    const prior = await db.folder_sync_states.get(accountScopeId)
    if (import.meta.env.DEV) capturedRevision = prior?.localDataRevision ?? 'uninitialized'
    const data = await action()
    const state = await db.folder_sync_states.get(accountScopeId)
    const dataRevision = state?.localDataRevision ?? 'uninitialized'
    const actualEffect = effect ? effect() : prior?.localDataRevision !== state?.localDataRevision ? 'organization' : undefined
    if (actualEffect === 'organization') await markRecoveryPending(accountScopeId, dataRevision)
    const commit: FolderCommit = { accountScopeId, baseRevision: prior?.localDataRevision ?? 'uninitialized', dataRevision, effect: actualEffect }
    return { data, commit }
  })
  if (import.meta.env.DEV) {
    return pending.then((result) => {
      finish?.('success', { capturedRevision, committedRevision: result.commit.dataRevision })
      return result
    }, (error: unknown) => {
      finish?.('rollback', { capturedRevision })
      throw error
    })
  }
  return pending
}
