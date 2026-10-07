import { describe, expect, it, vi } from 'vitest'
import { FOLDER_ACCOUNT_HISTORY_KEY, FolderAccountHistoryStore, createFolderAccountHistoryHandler } from './account-history'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension' } } }))

function fixture(initial?: unknown) {
  let value = initial
  const storage = {
    get: vi.fn(async () => ({ [FOLDER_ACCOUNT_HISTORY_KEY]: structuredClone(value) })),
    set: vi.fn(async (values: Record<string, unknown>) => { value = structuredClone(values[FOLDER_ACCOUNT_HISTORY_KEY]) }),
  }
  return { storage, store: new FolderAccountHistoryStore(storage), value: () => value }
}
const remember = (email: string, accountScopeId: string) => ({ method: 'remember' as const, params: { email, accountScopeId } })
const get = { method: 'get' as const, params: {} }
const envelope = (command: typeof get | ReturnType<typeof remember>) => ({ namespace: 'folder-accounts', protocolVersion: 1, requestId: 'history-test', ...command })

describe('Folder account history', () => {
  it('serializes concurrent updates without losing accounts and persists the latest choice', async () => {
    const { store, storage } = fixture()
    await Promise.all([
      store.execute(remember('first@example.com', 'account-scope-0001')),
      store.execute(remember('second@example.com', 'account-scope-0002')),
    ])
    expect(await new FolderAccountHistoryStore(storage).execute(get)).toMatchObject({
      accounts: expect.arrayContaining([{ email: 'first@example.com', accountScopeId: 'account-scope-0001', lastUsedAt: expect.any(String) },
        { email: 'second@example.com', accountScopeId: 'account-scope-0002', lastUsedAt: expect.any(String) }]),
      recentAccountScopeId: 'account-scope-0002',
    })
    await store.execute(remember('first@example.com', 'account-scope-0001'))
    expect((await store.execute(get)).accounts).toHaveLength(2)
    expect((await store.execute(get)).recentAccountScopeId).toBe('account-scope-0001')
  })

  it('removes only the history entry and clears the recent pointer without picking another account', async () => {
    const { store, storage } = fixture()
    await store.execute(remember('first@example.com', 'account-scope-0001'))
    await store.execute(remember('second@example.com', 'account-scope-0002'))
    expect(await store.execute({ method: 'forget', params: { accountScopeId: 'account-scope-0002' } })).toMatchObject({
      accounts: [{ email: 'first@example.com' }], recentAccountScopeId: undefined,
    })
    expect(storage.set.mock.calls.every(([values]) => Object.keys(values).join() === FOLDER_ACCOUNT_HISTORY_KEY)).toBe(true)
  })

  it('keeps valid history when entries or the recent pointer are damaged', async () => {
    const { store } = fixture({ accounts: [
      { email: ' USER@example.com ', accountScopeId: 'account-scope-0001', lastUsedAt: '2026-10-05T00:00:00.000Z' },
      { email: 'invalid', accountScopeId: 'bad' },
    ], recentAccountScopeId: 'unknown' })
    expect(await store.execute(get)).toEqual({ accounts: [{ email: 'user@example.com', accountScopeId: 'account-scope-0001', lastUsedAt: '2026-10-05T00:00:00.000Z' }], recentAccountScopeId: undefined })
  })

  it('continues processing after a failed write', async () => {
    const { store, storage } = fixture()
    storage.set.mockRejectedValueOnce(new Error('Storage full'))
    await expect(store.execute(remember('first@example.com', 'account-scope-0001'))).rejects.toThrow('Storage full')
    await store.execute(remember('second@example.com', 'account-scope-0002'))
    expect((await store.execute(get)).accounts).toHaveLength(1)
  })

  it('validates senders and normalizes email before writing', async () => {
    const { store } = fixture()
    const execute = vi.spyOn(store, 'execute')
    const handler = createFolderAccountHistoryHandler(store)
    const sender = { id: 'test-extension', url: 'https://gemini.google.com/app' }
    await expect(handler(envelope(get), { ...sender, url: 'https://example.com' })).resolves.toBeUndefined()
    await expect(handler(envelope(get), { ...sender, id: 'other-extension' })).resolves.toBeUndefined()
    await expect(handler(envelope(remember('invalid', 'account-scope-0001')), sender)).resolves.toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
    await expect(handler(envelope(remember(' USER@example.com ', 'account-scope-0001')), sender)).resolves.toMatchObject({ ok: true, requestId: 'history-test', data: { accounts: [{ email: 'user@example.com' }] } })
  })
  it('rejects messages outside the RPC protocol before accessing account storage', async () => {
    const { store, storage } = fixture()
    const handler = createFolderAccountHistoryHandler(store)
    const sender = { id: 'test-extension', url: 'https://gemini.google.com/app' }
    expect(handler({ namespace: 'folder-accounts', method: 'get' }, sender)).toBeUndefined()
    expect(handler({ ...envelope(get), protocolVersion: 2 }, sender)).toBeUndefined()
    await expect(handler({ ...envelope(get), params: undefined }, sender)).resolves.toBeUndefined()
    expect(storage.get).not.toHaveBeenCalled()
  })

})
