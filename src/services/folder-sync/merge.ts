import { compareVersionStamp } from '@/domain/folder/hlc'
import { parseFolderExportPayload } from '@/domain/folder/schemas'
import type {
  ChatReferenceRow,
  FolderExportPayload,
  FolderMembershipRow,
  FolderRow,
  FolderSettingsRow,
} from '@/domain/folder/types'

function newest<T>(left: T, right: T, leftStamp: string | undefined, rightStamp: string | undefined): T {
  return compareVersionStamp(leftStamp ?? '', rightStamp ?? '') >= 0 ? left : right
}

function mergeFolder(left: FolderRow, right: FolderRow): FolderRow {
  // Tombstones are never resurrected by an older (or later stale) update.
  // Re-creating a deleted Folder must use a new ID.
  if (left.deletedAt || right.deletedAt) {
    const deleted = left.deletedAt && right.deletedAt
      ? newest(left, right, left.deleteVersionStamp, right.deleteVersionStamp)
      : left.deletedAt ? left : right
    return { ...deleted, versionStamp: newest(left, right, left.versionStamp, right.versionStamp).versionStamp }
  }
  const base = newest(left, right, left.versionStamp, right.versionStamp)
  const name = newest(left, right, left.fieldVersions.name, right.fieldVersions.name)
  const icon = newest(left, right, left.fieldVersions.iconKey, right.fieldVersions.iconKey)
  const color = newest(left, right, left.fieldVersions.colorValue, right.fieldVersions.colorValue)
  const position = newest(left, right, left.fieldVersions.position, right.fieldVersions.position)
  return {
    ...base,
    name: name.name,
    iconKey: icon.iconKey,
    colorValue: color.colorValue,
    parentFolderId: position.parentFolderId,
    orderKey: position.orderKey,
    fieldVersions: {
      name: name.fieldVersions.name,
      iconKey: icon.fieldVersions.iconKey,
      colorValue: color.fieldVersions.colorValue,
      position: position.fieldVersions.position,
    },
    deletedAt: undefined,
    deleteVersionStamp: undefined,
  }
}

function mergeMembership(left: FolderMembershipRow, right: FolderMembershipRow): FolderMembershipRow {
  if (left.deletedAt || right.deletedAt) {
    const deleted = left.deletedAt && right.deletedAt
      ? newest(left, right, left.deleteVersionStamp, right.deleteVersionStamp)
      : left.deletedAt ? left : right
    return { ...deleted, versionStamp: newest(left, right, left.versionStamp, right.versionStamp).versionStamp }
  }
  const position = newest(left, right, left.positionVersionStamp, right.positionVersionStamp)
  const base = newest(left, right, left.versionStamp, right.versionStamp)
  return {
    ...base,
    folderId: position.folderId,
    orderKey: position.orderKey,
    positionVersionStamp: position.positionVersionStamp,
    deletedAt: undefined,
    deleteVersionStamp: undefined,
  }
}

function mergeChatReference(left: ChatReferenceRow, right: ChatReferenceRow): ChatReferenceRow {
  return newest(left, right, left.titleVersionStamp, right.titleVersionStamp)
}

function mergeSettings(left: FolderSettingsRow, right: FolderSettingsRow): FolderSettingsRow {
  const enabled = newest(left, right, left.fieldVersions.enabled, right.fieldVersions.enabled)
  const hidden = newest(left, right, left.fieldVersions.hideOrganizedChats, right.fieldVersions.hideOrganizedChats)
  const collapsed = newest(left, right, left.fieldVersions.collapsedFolderIds, right.fieldVersions.collapsedFolderIds)
  const fieldVersions = { ...left.fieldVersions, ...right.fieldVersions }
  const assignVersion = (key: 'enabled' | 'hideOrganizedChats' | 'collapsedFolderIds', value: string | undefined) => {
    if (value) fieldVersions[key] = value
    else delete fieldVersions[key]
  }
  assignVersion('enabled', enabled.fieldVersions.enabled)
  assignVersion('hideOrganizedChats', hidden.fieldVersions.hideOrganizedChats)
  assignVersion('collapsedFolderIds', collapsed.fieldVersions.collapsedFolderIds)
  return {
    ...newest(left, right, left.updatedAt, right.updatedAt),
    enabled: enabled.enabled,
    hideOrganizedChats: hidden.hideOrganizedChats,
    collapsedFolderIds: collapsed.collapsedFolderIds,
    fieldVersions,
  }
}

function mergeRows<T extends { id: string }>(
  left: T[],
  right: T[],
  merge: (leftRow: T, rightRow: T) => T,
): T[] {
  const rows = new Map(left.map((row) => [row.id, row]))
  for (const row of right) rows.set(row.id, rows.has(row.id) ? merge(rows.get(row.id)!, row) : row)
  return [...rows.values()]
}

/** Deterministically merges two validated account snapshots without trusting wall-clock timestamps. */
export function mergeFolderExportPayloads(local: FolderExportPayload, remote: FolderExportPayload): FolderExportPayload {
  if (local.accountScopeId !== remote.accountScopeId) throw new Error('Cannot merge different Folder account scopes')
  const folders = mergeRows(local.folders, remote.folders, mergeFolder)
  let memberships = mergeRows(local.memberships, remote.memberships, mergeMembership)
  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  memberships = memberships.map((membership) => {
    const folder = folderById.get(membership.folderId)
    if (!folder?.deletedAt || membership.deletedAt) return membership
    return {
      ...membership,
      deletedAt: folder.deletedAt,
      deleteVersionStamp: folder.deleteVersionStamp,
      versionStamp: folder.deleteVersionStamp ?? membership.versionStamp,
      updatedAt: folder.updatedAt,
    }
  })
  const references = new Map<string, ChatReferenceRow>()
  for (const reference of [...local.chatReferences, ...remote.chatReferences]) {
    const prior = references.get(reference.chatId)
    references.set(reference.chatId, prior ? mergeChatReference(prior, reference) : reference)
  }
  return parseFolderExportPayload({
    schemaVersion: 1,
    accountScopeId: local.accountScopeId,
    folders,
    memberships,
    chatReferences: [...references.values()],
    settings: mergeSettings(local.settings, remote.settings),
    exportedAt: new Date().toISOString(),
  })
}
