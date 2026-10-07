import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', sendMessage: transport.send } } }))
vi.mock('@/utils/i18n', () => ({ tt: (_key: string, fallback: string) => fallback }))

import { FolderAccountHistoryStore, createFolderAccountHistoryHandler, FOLDER_ACCOUNT_HISTORY_KEY } from '@/entrypoints/background/folders/account-history'
import { folderAccountHistory } from './account-history'

describe('Account history content/background contract', () => {
  beforeEach(() => transport.send.mockReset())
  afterEach(() => vi.useRealTimers())

  it('saves, reads and forgets accounts through the actual message handler', async () => {
    const values: Record<string, unknown> = {}
    const store = new FolderAccountHistoryStore({
      get: async () => structuredClone(values),
      set: async (next) => { Object.assign(values, structuredClone(next)) },
    })
    const handler = createFolderAccountHistoryHandler(store)
    transport.send.mockImplementation((message) => handler(message, { id: 'test-extension', url: 'https://gemini.google.com/app' }))
    await folderAccountHistory.remember(' USER@example.com ', 'account-scope-0001')
    expect(await folderAccountHistory.get()).toMatchObject({
      accounts: [{ email: 'user@example.com', accountScopeId: 'account-scope-0001' }], recentAccountScopeId: 'account-scope-0001',
    })
    expect(await folderAccountHistory.forget('account-scope-0001')).toMatchObject({ accounts: [] })
    expect(Object.keys(values)).toEqual([FOLDER_ACCOUNT_HISTORY_KEY])
    expect(transport.send).toHaveBeenNthCalledWith(1, { namespace: 'folder-accounts', protocolVersion: 1, requestId: expect.any(String), method: 'remember', params: { email: ' USER@example.com ', accountScopeId: 'account-scope-0001' } })
  })

  it('rejects failed or malformed background responses without claiming persistence', async () => {
    transport.send.mockImplementationOnce((request) => ({ ok: false, requestId: request.requestId }))
    await expect(folderAccountHistory.remember('user@example.com', 'account-scope-0001')).rejects.toThrow('Could not save this email')
    transport.send.mockImplementationOnce((request) => ({ ok: true, requestId: request.requestId, data: { accounts: 'invalid' } }))
    await expect(folderAccountHistory.get()).rejects.toThrow('Could not load account history')
  })
  it('rejects a valid response belonging to another request', async () => {
    transport.send.mockResolvedValueOnce({ ok: true, requestId: 'other-request', data: { accounts: [] } })
    await expect(folderAccountHistory.get()).rejects.toThrow('Could not load account history')
  })

  it('uses the RPC timeout when the background does not respond', async () => {
    vi.useFakeTimers()
    transport.send.mockImplementationOnce(() => new Promise(() => {}))
    const failure = expect(folderAccountHistory.get()).rejects.toThrow('Extension RPC timed out after 15000ms')
    await vi.advanceTimersByTimeAsync(15_000)
    await failure
    expect(vi.getTimerCount()).toBe(0)
  })

})
