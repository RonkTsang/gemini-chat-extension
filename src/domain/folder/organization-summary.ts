import type { FolderMembershipRow, FolderRow } from './types'

export interface FolderOrganizationCounts {
  folderCount: number
  chatCount: number
}

/** Count live organization, deduplicating chats shared by multiple folders. */
export function countFolderOrganization(
  folders: Pick<FolderRow, 'id'>[],
  memberships: Pick<FolderMembershipRow, 'folderId' | 'chatId'>[],
): FolderOrganizationCounts {
  const folderIds = new Set(folders.map((folder) => folder.id))
  const chatIds = new Set(memberships
    .filter((membership) => folderIds.has(membership.folderId))
    .map((membership) => membership.chatId))
  return { folderCount: folderIds.size, chatCount: chatIds.size }
}
