import { describe, expect, it } from 'vitest'

import type { FolderAccountData, FolderMembershipRow, FolderRow } from '@/domain/folder/types'
import { ROOT_FOLDER_ID } from '@/domain/folder/types'
import { mergeFolderAccountData } from './merge'
import { keyBetween } from '@/domain/folder/order-key'

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
  const membershipData = (patch: Partial<FolderMembershipRow> = {}): FolderAccountData => ({
    ...payload([folder()]),
    memberships: [{
      id: 'membership-a', accountScopeId: scope, folderId: 'folder-a', chatId: 'chat-a',
      orderKey: keyBetween(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      versionStamp: baseStamp, positionVersionStamp: baseStamp, ...patch,
    }],
    chatReferences: [{ accountScopeId: scope, chatId: 'chat-a', cachedTitle: 'A chat', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', titleVersionStamp: baseStamp }],
  })

  it('merges an independent pin and ordinary reorder in either direction', () => {
    const pin = membershipData({ pinnedOrderKey: keyBetween(), pinVersionStamp: newerStamp, versionStamp: newerStamp })
    const move = membershipData({ orderKey: keyBetween(keyBetween()), positionVersionStamp: '0000000000003:000000:device-c', versionStamp: '0000000000003:000000:device-c' })
    const expected = { orderKey: move.memberships[0].orderKey, pinnedOrderKey: pin.memberships[0].pinnedOrderKey, pinVersionStamp: newerStamp }
    expect(mergeFolderAccountData(pin, move).memberships[0]).toMatchObject(expected)
    expect(mergeFolderAccountData(move, pin).memberships[0]).toMatchObject(expected)
  })

  it('keeps a newer unpin against a stale pin and keeps pin data against a legacy reorder', () => {
    const pin = membershipData({ pinnedOrderKey: keyBetween(), pinVersionStamp: baseStamp })
    const unpin = membershipData({ pinVersionStamp: newerStamp, versionStamp: newerStamp })
    expect(mergeFolderAccountData(pin, unpin).memberships[0].pinnedOrderKey).toBeUndefined()
    expect(mergeFolderAccountData(unpin, pin).memberships[0].pinnedOrderKey).toBeUndefined()
    const legacy = membershipData({ positionVersionStamp: newerStamp, versionStamp: newerStamp })
    expect(mergeFolderAccountData(legacy, pin).memberships[0].pinnedOrderKey).toBe(pin.memberships[0].pinnedOrderKey)
  })

  it('does not resurrect a removed membership when another device pins it', () => {
    const deleted = membershipData({ deletedAt: '2026-01-02T00:00:00.000Z', deleteVersionStamp: baseStamp })
    const pin = membershipData({ pinnedOrderKey: keyBetween(), pinVersionStamp: newerStamp, versionStamp: newerStamp })
    expect(mergeFolderAccountData(deleted, pin).memberships[0].deletedAt).toBeDefined()
  })

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
