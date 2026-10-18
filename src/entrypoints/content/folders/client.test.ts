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

  it('retains folder-specific pin state from bundled and subsequent chat pages', async () => {
    transport.request.mockImplementation(async (request) => response(request.method === 'getSidebarState'
      ? { settings, folders: [folder(1)], chatsByFolder: { 'folder-1': { items: [{ chatId: 'pinned', cachedTitle: 'Pinned', orderKey: 'original', pinnedOrderKey: 'pin-order' }], nextCursor: 'cursor' } } }
      : { items: [{ chatId: 'regular', cachedTitle: 'Regular', orderKey: 'normal-order' }] }))
    const client = new FolderBackgroundClient()
    const projection = await client.getProjection(accountScopeId, 'observed')
    expect(projection.memberships[0]).toMatchObject({ folderId: 'folder-1', orderKey: 'original', pinnedOrderKey: 'pin-order' })
    expect(projection.memberships[1].pinnedOrderKey).toBeUndefined()
    const page = await client.getChatPage(accountScopeId, 'observed', 'folder-1', 'cursor')
    expect(page.memberships[0]).toMatchObject({ chatId: 'regular', orderKey: 'normal-order' })
  })

  it('follows every folder page and loads chats beyond the five-folder preview', async () => {
    transport.request.mockImplementation(async (request) => {
      if (request.method === 'getSidebarState') {
        return response({ settings, folders: [1, 2, 3, 4, 5].map(folder), chatsByFolder: Object.fromEntries([1, 2, 3, 4, 5].map((index) => [`folder-${index}`, { items: [] }])), nextCursor: '005.folder-5' })
      }
      if (request.method === 'listFolders') {
        return request.params.cursor === '005.folder-5'
          ? response({ items: [folder(6)], nextCursor: '006.folder-6' })
          : response({ items: [folder(7)] })
      }
      if (request.method === 'listFolderChats') {
        if (request.params.folderId === 'folder-6') {
          return request.params.cursor
            ? response({ items: [{ chatId: 'chat-11', cachedTitle: 'Second chat', orderKey: 'V' }] })
            : response({ items: Array.from({ length: 10 }, (_, index) => ({ chatId: `chat-${index + 1}`, cachedTitle: 'First chat', orderKey: `U${index}` })), nextCursor: 'U.chat-1' })
        }
        return response({ items: [] })
      }
      throw new Error(`Unexpected method: ${request.method}`)
    })

    const projection = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed')

    expect(projection.folders.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7].map((index) => `folder-${index}`))
    expect(projection.memberships).toHaveLength(10)
    expect(projection.memberships.every((row) => row.folderId === 'folder-6')).toBe(true)
    expect(projection.chatReferences.map((row) => row.cachedTitle)).toEqual(Array(10).fill('First chat'))
    expect(projection.chatCursors?.['folder-6']).toBe('U.chat-1')
    const page = await new FolderBackgroundClient().getChatPage(accountScopeId, 'observed', 'folder-6', 'U.chat-1')
    expect(page.memberships.map((row) => row.chatId)).toEqual(['chat-11'])
    expect(page.nextCursor).toBeUndefined()
    const refreshed = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed', {
      ...projection, memberships: [...projection.memberships, ...page.memberships],
    })
    expect(refreshed.memberships).toHaveLength(11)
    expect(new Set(refreshed.memberships.map((row) => row.id)).size).toBe(11)
    expect(refreshed.chatCursors?.['folder-6']).toBeUndefined()

    const requests = transport.request.mock.calls.map(([request]) => request)
    expect(requests.filter((request) => request.method === 'listFolders').slice(0, 2).map((request) => request.params)).toEqual([
      { cursor: '005.folder-5', limit: 100 }, { cursor: '006.folder-6', limit: 100 },
    ])
    expect(requests.some((request) => request.method === 'listFolderChats' && request.params.folderId === 'folder-7')).toBe(true)
    expect(requests.some((request) => request.method === 'listFolderChats' && ['folder-1', 'folder-2', 'folder-3', 'folder-4', 'folder-5'].includes(request.params.folderId))).toBe(false)
    expect(requests.filter((request) => request.method === 'listFolderChats').every((request) => request.params.limit === 10)).toBe(true)
    expect(requests.every((request) => request.accountScopeId === accountScopeId && request.identitySource === 'observed')).toBe(true)
  })

  it('uses bundled chats and cursors for a collapsed folder without any additional request', async () => {
    transport.request.mockImplementation(async (request) => response(request.method === 'getSidebarState'
      ? { settings: { ...settings, collapsedFolderIds: ['folder-1'] }, folders: [folder(1)], chatsByFolder: { 'folder-1': { items: Array.from({ length: 10 }, (_, index) => ({ chatId: `chat-${index + 1}`, cachedTitle: 'Bundled chat', orderKey: `U${index}` })), nextCursor: 'U.chat-10' } } }
      : { items: [], nextCursor: undefined }))

    const projection = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed')

    expect(projection.folders).toHaveLength(1)
    expect(transport.request).toHaveBeenCalledTimes(1)
    expect(projection.memberships).toHaveLength(10)
    expect(projection.chatReferences[0].cachedTitle).toBe('Bundled chat')
    expect(projection.chatCursors?.['folder-1']).toBe('U.chat-10')
  })
})

it.each(['folder', 'chat'])('retries a mixed %s page once, then refuses a mixed projection', async (kind) => {
  let starts = 0
  transport.request.mockImplementation(async (request) => {
    if (request.method === 'getSidebarState') {
      starts += 1
      return response({ settings, folders: [folder(1)], chatsByFolder: { 'folder-1': { items: [], nextCursor: kind === 'chat' ? 'chat-cursor' : undefined } }, nextCursor: kind === 'folder' ? 'folder-cursor' : undefined })
    }
    return { ok: true, dataRevision: 'revision-2', data: { items: kind === 'folder' ? [folder(2)] : [] } }
  })
  await expect(new FolderBackgroundClient().getProjection(accountScopeId, 'observed')).rejects.toThrow('STALE_REVISION')
  expect(starts).toBe(2)
})

it('recovers a projection on the bounded retry after pagination changed revision', async () => {
  let starts = 0
  transport.request.mockImplementation(async (request) => {
    if (request.method === 'getSidebarState') {
      starts += 1
      return { ok: true, dataRevision: starts === 1 ? 'revision-1' : 'revision-2', data: { settings, folders: [folder(1)], chatsByFolder: { 'folder-1': { items: [] } }, nextCursor: starts === 1 ? 'cursor' : undefined } }
    }
    return { ok: true, dataRevision: 'revision-2', data: { items: [folder(2)] } }
  })
  const projection = await new FolderBackgroundClient().getProjection(accountScopeId, 'observed')
  expect(projection.dataRevision).toBe('revision-2')
  expect(projection.folders).toHaveLength(1)
  expect(starts).toBe(2)
})

it('correlates projection RPCs and serializes response bytes only with explicit diagnostics', async () => {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const toJSON = vi.fn(() => ({ cachedTitle: 'PRIVATE-TITLE', payload: 'PRIVATE-PAYLOAD' }))
  transport.request.mockImplementation(async () => response({ toJSON }))
  const client = new FolderBackgroundClient()
  try {
    vi.stubEnv('VITE_FOLDER_DIAGNOSTIC_RPC_BYTES', 'false')
    await client.request(accountScopeId, 'observed', 'getSettings', {}, 'flow-trace')
    expect(toJSON).not.toHaveBeenCalled()
    expect(transport.request.mock.calls.at(-1)?.[0]).toMatchObject({ traceId: 'flow-trace' })
    vi.stubEnv('VITE_FOLDER_DIAGNOSTIC_RPC_BYTES', 'true')
    await client.request(accountScopeId, 'observed', 'getSettings', {}, 'flow-trace')
    expect(toJSON).toHaveBeenCalledTimes(1)
    const reports = debug.mock.calls.map(([, value]) => JSON.parse(String(value)))
    expect(reports.at(-1)).toMatchObject({ event: 'rpc.completed', traceId: 'flow-trace', responseBytes: expect.any(Number) })
    expect(JSON.stringify(reports)).not.toMatch(/PRIVATE-TITLE|PRIVATE-PAYLOAD/)
    vi.stubEnv('DEV', false)
    const clock = vi.spyOn(performance, 'now')
    await client.request(accountScopeId, 'observed', 'getSettings', {}, 'flow-trace')
    expect(clock).not.toHaveBeenCalled()
    clock.mockRestore()
    expect(transport.request.mock.calls.at(-1)?.[0]).not.toHaveProperty('traceId')
    expect(transport.request.mock.calls.at(-1)?.[0]).toMatchObject({ requestId: expect.any(String), method: 'getSettings' })
    expect(toJSON).toHaveBeenCalledTimes(1)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      transport.request.mockImplementationOnce(async (request) => ({ ok: false, requestId: request.requestId, error: { code: 'INTERNAL_ERROR', message: 'Failed', retryable: true } }))
      await expect(client.request(accountScopeId, 'observed', 'getSettings', {}, 'flow-trace')).rejects.toThrow('Failed')
      expect(error).toHaveBeenCalledWith('[Folders][rpc] background rejected request', expect.objectContaining({
        requestId: transport.request.mock.calls.at(-1)?.[0].requestId, method: 'getSettings', code: 'INTERNAL_ERROR',
      }))
    } finally { error.mockRestore() }
  } finally { vi.unstubAllEnvs(); debug.mockRestore() }
})
