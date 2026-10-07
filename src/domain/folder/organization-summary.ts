import type { FolderMembershipRow, FolderRow } from './types'

export interface FolderOrganizationCounts {
  folderCount: number
  chatCount: number
}

/** Count live organization, deduplicating chats shared by multiple folders. */
export function countFolderOrganization(
  folders: Pick<FolderRow, 'id' | 'deletedAt'>[],
  memberships: Pick<FolderMembershipRow, 'folderId' | 'chatId' | 'deletedAt'>[],
): FolderOrganizationCounts {
  const folderIds = new Set(folders.filter((folder) => !folder.deletedAt).map((folder) => folder.id))
  const chatIds = new Set(memberships
    .filter((membership) => !membership.deletedAt && folderIds.has(membership.folderId))
    .map((membership) => membership.chatId))
  return { folderCount: folderIds.size, chatCount: chatIds.size }
}
