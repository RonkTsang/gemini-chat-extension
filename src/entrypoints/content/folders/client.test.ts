import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/integrations/extension-rpc/client', () => ({
  ExtensionRpcClient: class { request = transport.request },
}))

import { FolderBackgroundClient } from './client'

const accountScopeId = 'account-scope-0001'
const folder = (index: number) => ({
  id: `folder-${index}`,
  parentFolderId: '__root__',
  name: `Folder ${index}`,
  iconKey: 'folder',
  colorValue: 'blue',
  orderKey: String(index).padStart(3, '0'),
})
const settings = { collapsedFolderIds: ['folder-7'], enabled: true }
const response = (data: unknown) => ({ ok: true, data, dataRevision: 'revision-1' })

describe('FolderBackgroundClient SideNav projection', () => {
  beforeEach(() => { transport.request.mockReset() })

  it('follows every folder page and loads chats beyond the five-folder preview', async () => {
    transport.request.mockImplementation(async (request) => {
      if (request.method === 'getSidebarState') {
        return response({ settings, folders: [1, 2, 3, 4, 5].map(folder), nextCursor: '005.folder-5' })
      }
      if (request.method === 'listFolders') {
        return request.params.cursor === '005.folder-5'
          ? response({ items: [folder(6)], nextCursor: '006.folder-6' })
          : response({ items: [folder(7)] })
      }
      if (request.method === 'listFolderChats') {
        if (request.params.folderId === 'folder-6') {
          return request.params.cursor
            ? response({ items: [{ chatId: 'chat-2', cachedTitle: 'Second chat', orderKey: 'V' }] })
            : response({ items: [{ chatId: 'chat-1', cachedTitle: 'First chat', orderKey: 'U' }], nextCursor: 'U.chat-1' })
        }
        return response({ items: [] })
      }
      throw new Error(`Unexpected method: ${request.method}`)
    })

    const projection = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed')

    expect(projection.folders.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7].map((index) => `folder-${index}`))
    expect(projection.memberships.map((row) => [row.folderId, row.chatId])).toEqual([
      ['folder-6', 'chat-1'],
    ])
    expect(projection.chatReferences.map((row) => row.cachedTitle)).toEqual(['First chat'])
    expect(projection.chatCursors?.['folder-6']).toBe('U.chat-1')
    const page = await new FolderBackgroundClient().getChatPage(accountScopeId, 'observed', 'folder-6', 'U.chat-1')
    expect(page.memberships.map((row) => row.chatId)).toEqual(['chat-2'])
    expect(page.nextCursor).toBeUndefined()
    const requests = transport.request.mock.calls.map(([request]) => request)
    expect(requests.filter((request) => request.method === 'listFolders').map((request) => request.params)).toEqual([
      { cursor: '005.folder-5', limit: 100 }, { cursor: '006.folder-6', limit: 100 },
    ])
    expect(requests.some((request) => request.method === 'listFolderChats' && request.params.folderId === 'folder-7')).toBe(false)
    expect(requests.filter((request) => request.method === 'listFolderChats').every((request) => request.params.limit === 10)).toBe(true)
    expect(requests.every((request) => request.accountScopeId === accountScopeId && request.identitySource === 'observed')).toBe(true)
  })

  it('does not request another folder page when the preview is complete', async () => {
    transport.request.mockResolvedValue(response({ settings: { ...settings, collapsedFolderIds: ['folder-1'] }, folders: [folder(1)] }))

    const projection = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed')

    expect(projection.folders).toHaveLength(1)
    expect(transport.request).toHaveBeenCalledTimes(1)
  })
})
