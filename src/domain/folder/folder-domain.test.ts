import { describe, expect, it } from 'vitest'

import { MAX_ORDER_KEY_LENGTH, keyBetween, rebalanceOrderKeys } from './order-key'
import { folderExportPayloadSchema, folderOrganizationDataSchema, folderSyncDataSchema } from './schemas'
import { ROOT_FOLDER_ID, type FolderRow } from './types'
import { validateAndProjectFolderTree } from './tree-projection'
import { toFolderOrganizationData } from './organization-data'

const scope = '0123456789abcdef'
const stamp = '0000000000001:000000:device'
const folder = (id: string, parentFolderId: string = ROOT_FOLDER_ID, orderKey = keyBetween()): FolderRow => ({ id, accountScopeId: scope, parentFolderId, name: id, iconKey: 'folder', colorValue: 'neutral', orderKey, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'})

describe('folder domain contracts', () => {
  it('makes ASCII-stable fractional keys and rejects reversed bounds', () => {
    const first = keyBetween(); const head = keyBetween(undefined, first); const tail = keyBetween(first); const middle = keyBetween(head, first)
    expect(head < first).toBe(true); expect(first < tail).toBe(true); expect(() => keyBetween(tail, first)).toThrow()
    expect(head < middle && middle < first).toBe(true)
    expect(() => keyBetween('U', 'U0')).toThrow('current fixed-width')
    expect(() => keyBetween('z'.repeat(MAX_ORDER_KEY_LENGTH))).toThrow()
    expect([...rebalanceOrderKeys(['a', 'b', 'c']).values()]).toEqual([...rebalanceOrderKeys(['a', 'b', 'c']).values()])
    expect([...rebalanceOrderKeys(['a', 'b', 'c']).values()].map((key) => key.length)).toEqual([32, 32, 32])
  })

  it('supports sustained head, tail, and middle insertion without protocol drift', () => {
    let head: string | undefined
    for (let index = 0; index < 100; index += 1) head = keyBetween(undefined, head)
    let tail: string | undefined
    for (let index = 0; index < 100; index += 1) tail = keyBetween(tail)
    const ordered = [keyBetween()]
    for (let index = 0; index < 100; index += 1) {
      const at = (index * 37) % (ordered.length + 1)
      ordered.splice(at, 0, keyBetween(ordered[at - 1], ordered[at]))
    }
    expect(ordered).toEqual([...ordered].sort())
  })

  it('reports malformed trees instead of silently promoting orphan folders', () => {
    expect(validateAndProjectFolderTree([folder('orphan', 'missing')])).toMatchObject({ ok: false, reason: 'orphan' })
    expect(validateAndProjectFolderTree([folder('a', 'b'), folder('b', 'a')])).toMatchObject({ ok: false, reason: 'cycle' })
  })

  it('uses one core schema and rejects row-level account ownership or embedded settings', () => {
    expect(folderSyncDataSchema).toBe(folderOrganizationDataSchema)
    const data = toFolderOrganizationData({ accountScopeId: scope, folders: [folder('a')], memberships: [], chatReferences: [] })
    const payload = { schemaVersion: 1, accountScopeId: scope, exportedAt: '2026-01-01T00:00:00.000Z', data }
    expect(folderExportPayloadSchema.safeParse(payload).success).toBe(true)
    expect(folderExportPayloadSchema.safeParse({ ...payload, settings: { enabled: true, hideOrganizedChats: false } }).success).toBe(false)
    expect(folderExportPayloadSchema.safeParse({ ...payload, data: { ...data, folders: [folder('a')] } }).success).toBe(false)
  })

  it('rejects dangling references at the import boundary', () => {
    const payload = { schemaVersion: 1, accountScopeId: scope, exportedAt: '2026-01-01T00:00:00.000Z', data: toFolderOrganizationData({
      accountScopeId: scope, folders: [folder('a')],
      memberships: [{ id: 'm', accountScopeId: scope, folderId: 'missing', chatId: 'chat', orderKey: keyBetween(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}],
      chatReferences: [],
    }) }
    expect(folderExportPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects duplicate chat references, duplicate memberships, invalid order keys, and deep trees', () => {
    const validMembership = { id: 'm', folderId: 'a', chatId: 'chat', orderKey: keyBetween(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}
    const chat = { chatId: 'chat', cachedTitle: 'Title', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'}
    const data = { ...toFolderOrganizationData({ accountScopeId: scope, folders: [folder('a')], memberships: [], chatReferences: [] }), memberships: [validMembership], chatReferences: [chat] }
    const base = { schemaVersion: 1 as const, accountScopeId: scope, data, exportedAt: '2026-01-01T00:00:00.000Z' }
    expect(folderExportPayloadSchema.safeParse(base).success).toBe(true)
    expect(folderExportPayloadSchema.safeParse({ ...base, data: { ...data, chatReferences: [chat, chat] } }).success).toBe(false)
    expect(folderExportPayloadSchema.safeParse({ ...base, data: { ...data, memberships: [validMembership, { ...validMembership, id: 'm2' }] } }).success).toBe(false)
    expect(folderExportPayloadSchema.safeParse({ ...base, data: { ...data, folders: [{ ...data.folders[0], orderKey: 'not-valid!' }] } }).success).toBe(false)
    const deep = Array.from({ length: 33 }, (_, index) => folder(`node-${index}`, index === 0 ? ROOT_FOLDER_ID : `node-${index - 1}`))
    expect(validateAndProjectFolderTree(deep)).toMatchObject({ ok: false, reason: 'depth-exceeded' })
    expect(folderExportPayloadSchema.safeParse({ ...base, data: toFolderOrganizationData({ accountScopeId: scope, folders: deep, memberships: [], chatReferences: [] }) }).success).toBe(false)
  })
})
