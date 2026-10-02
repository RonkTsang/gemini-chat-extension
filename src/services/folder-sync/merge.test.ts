import { describe, expect, it } from 'vitest'

import type { FolderAccountData, FolderRow } from '@/domain/folder/types'
import { ROOT_FOLDER_ID } from '@/domain/folder/types'
import { mergeFolderAccountData } from './merge'

const scope = 'account-scope-0001'
const baseStamp = '0000000000001:000000:device-a'
const newerStamp = '0000000000002:000000:device-b'

function folder(patch: Partial<FolderRow> = {}): FolderRow {
  return {
    id: 'folder-a', accountScopeId: scope, parentFolderId: ROOT_FOLDER_ID,
    name: 'Local', iconKey: 'folder', colorValue: 'neutral', orderKey: 'U'.padStart(32, '0'),
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', versionStamp: baseStamp,
    fieldVersions: { name: baseStamp, iconKey: baseStamp, colorValue: baseStamp, position: baseStamp },
    ...patch,
  }
}

function payload(folders: FolderRow[]): FolderAccountData {
  return {
    accountScopeId: scope, folders, memberships: [], chatReferences: [],
  }
}

describe('mergeFolderAccountData', () => {
  it('merges independent fields while keeping a position atomic', () => {
    const local = payload([folder({ name: 'Local rename', colorValue: '#abcdef', fieldVersions: { name: newerStamp, iconKey: baseStamp, colorValue: newerStamp, position: baseStamp }, versionStamp: newerStamp })])
    const remote = payload([folder({ iconKey: 'favorites', orderKey: 'V'.padStart(32, '0'), fieldVersions: { name: baseStamp, iconKey: newerStamp, colorValue: baseStamp, position: newerStamp }, versionStamp: newerStamp })])
    const merged = mergeFolderAccountData(local, remote)
    expect(merged.folders[0]).toMatchObject({ name: 'Local rename', iconKey: 'favorites', colorValue: '#abcdef', orderKey: remote.folders[0].orderKey })
  })

  it('keeps a tombstone when another device still has the live row', () => {
    const deleted = folder({ deletedAt: '2026-01-02T00:00:00.000Z', deleteVersionStamp: newerStamp, versionStamp: newerStamp })
    const merged = mergeFolderAccountData(payload([folder()]), payload([deleted]))
    expect(merged.folders[0]).toMatchObject({ deletedAt: '2026-01-02T00:00:00.000Z', deleteVersionStamp: newerStamp })
  })
})
