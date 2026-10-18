import type { FolderAccountData, FolderOrganizationData } from './types'

/** Account ownership belongs to the transport envelope, rather than each row. */
export function toFolderOrganizationData(data: FolderAccountData): FolderOrganizationData {
  const unscoped = <T extends { accountScopeId: string }>(rows: T[]): Omit<T, 'accountScopeId'>[] =>
    rows.map(({ accountScopeId: _, ...row }) => row)
  return {
    folders: unscoped(data.folders).map(({ nameKey: _, ...row }) => row),
    memberships: unscoped(data.memberships).map(({ displayOrderKey: _, ...row }) => ({ ...row, id: `${row.folderId}:${row.chatId}` })),
    chatReferences: unscoped(data.chatReferences),
  }
}

/** Callers must validate the resulting account data before persisting it. */
export function scopeFolderOrganizationData(accountScopeId: string, data: FolderOrganizationData): FolderAccountData {
  const scoped = <T>(rows: T[]) => rows.map((row) => ({ ...row, accountScopeId }))
  return {
    accountScopeId,
    folders: scoped(data.folders),
    memberships: scoped(data.memberships).map((row) => ({ ...row, id: `${accountScopeId}:${row.folderId}:${row.chatId}` })),
    chatReferences: scoped(data.chatReferences),
  }
}
