import { describe, expect, it } from 'vitest'

import { MAX_ORDER_KEY_LENGTH, keyBetween, rebalanceOrderKeys } from './order-key'
import { folderExportPayloadSchema } from './schemas'
import { ROOT_FOLDER_ID, type FolderRow } from './types'
import { validateAndProjectFolderTree } from './tree-projection'

const scope = '0123456789abcdef'
const stamp = '0000000000001:000000:device'
const folder = (id: string, parentFolderId: string = ROOT_FOLDER_ID, orderKey = keyBetween()): FolderRow => ({ id, accountScopeId: scope, parentFolderId, name: id, iconKey: 'folder', colorValue: 'neutral', orderKey, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', versionStamp: stamp, fieldVersions: { name: stamp, iconKey: stamp, colorValue: stamp, position: stamp } })

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

  it('rejects cross-scope and dangling references at the import boundary', () => {
    const payload = { schemaVersion: 1, accountScopeId: scope, folders: [folder('a')], memberships: [{ id: 'm', accountScopeId: scope, folderId: 'missing', chatId: 'chat', orderKey: 'U', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', versionStamp: stamp, positionVersionStamp: stamp }], chatReferences: [], settings: { accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', fieldVersions: {} }, exportedAt: '2026-01-01T00:00:00.000Z' }
    expect(folderExportPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects duplicate chat references, duplicate memberships, invalid order keys, and deep trees', () => {
    const validMembership = { id: 'm', accountScopeId: scope, folderId: 'a', chatId: 'chat', orderKey: 'U', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', versionStamp: stamp, positionVersionStamp: stamp }
    const chat = { accountScopeId: scope, chatId: 'chat', cachedTitle: 'Title', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', titleVersionStamp: stamp }
    const base = { schemaVersion: 1 as const, accountScopeId: scope, folders: [folder('a')], memberships: [validMembership], chatReferences: [chat], settings: { accountScopeId: scope, enabled: true, hideOrganizedChats: false, collapsedFolderIds: [], updatedAt: '2026-01-01T00:00:00.000Z', fieldVersions: {} }, exportedAt: '2026-01-01T00:00:00.000Z' }
    expect(folderExportPayloadSchema.safeParse({ ...base, chatReferences: [chat, chat] }).success).toBe(false)
    expect(folderExportPayloadSchema.safeParse({ ...base, memberships: [validMembership, { ...validMembership, id: 'm2' }] }).success).toBe(false)
    expect(folderExportPayloadSchema.safeParse({ ...base, folders: [{ ...folder('a'), orderKey: 'not-valid!' }] }).success).toBe(false)
    const deep = Array.from({ length: 33 }, (_, index) => folder(`node-${index}`, index === 0 ? ROOT_FOLDER_ID : `node-${index - 1}`))
    expect(validateAndProjectFolderTree(deep)).toMatchObject({ ok: false, reason: 'depth-exceeded' })
  })
})
