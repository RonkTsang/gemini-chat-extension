import Dexie, { type Transaction, type IndexableType } from 'dexie'
import type { FolderAccountData, FolderRow } from '@/domain/folder/types'

export interface FolderOrganizationSummaryRow { accountScopeId: string; chatCount: number }

/** Seek index keys, stopping at the first membership whose Folder still exists. */
export async function hasValidChatMembership(transaction: Transaction, accountScopeId: string, chatId: string, folderExists?: Map<string, boolean>): Promise<boolean> {
  let lower: IndexableType[] = [accountScopeId, chatId, Dexie.minKey]
  const upper = [accountScopeId, chatId, Dexie.maxKey]
  for (;;) {
    const [key] = await transaction.table('folder_memberships').where('[accountScopeId+chatId+folderId]')
      .between(lower, upper, false, false).limit(1).keys()
    if (key === undefined) return false
    if (!Array.isArray(key) || typeof key[2] !== 'string') throw new Error('Folder membership index is invalid')
    let exists = folderExists?.get(key[2])
    if (exists === undefined) {
      const folder = await transaction.table<FolderRow, string>('folders').get(key[2])
      exists = folder?.accountScopeId === accountScopeId
      folderExists?.set(key[2], exists)
    }
    if (exists) return true
    lower = [accountScopeId, chatId, key[2]]
  }
}

/** Only schema upgrades and validated full replacements rebuild the account summary. */
export async function rebuildFolderSummary(transaction: Transaction, data: FolderAccountData): Promise<void> {
  const folderIds = new Set(data.folders.map((row) => row.id))
  const chatIds = new Set<string>()
  for (const row of data.memberships) {
    if (row.accountScopeId === data.accountScopeId && folderIds.has(row.folderId)) chatIds.add(row.chatId)
  }
  await transaction.table('folder_organization_summaries').put({ accountScopeId: data.accountScopeId, chatCount: chatIds.size })
}

/** Runs in the same transaction as the first addition or last removal of a valid chat. */
export async function changeFolderChatCount(transaction: Transaction, accountScopeId: string, delta: number): Promise<void> {
  if (!delta) return
  const summaries = transaction.table<FolderOrganizationSummaryRow, string>('folder_organization_summaries')
  const prior = await summaries.get(accountScopeId)
  const chatCount = (prior?.chatCount ?? 0) + delta
  if (chatCount < 0) throw new Error('Folder organization summary is inconsistent')
  await summaries.put({ accountScopeId, chatCount })
}
