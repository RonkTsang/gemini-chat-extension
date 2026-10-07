import { browser } from 'wxt/browser'

import {
  folderAccountSchema, folderAccountHistoryRequestSchema, folderAccountHistoryResponseSchema,
  type FolderAccountHistory, type FolderAccountHistoryCommand, type FolderAccountHistoryRequest,
} from '@/domain/folder/account-history'
import { createExtensionRpcRouter, type ExtensionRpcMessageListener } from '@/integrations/extension-rpc/router'

export const FOLDER_ACCOUNT_HISTORY_KEY = 'gpk.folders.account-history.v1'

interface AccountStorage {
  get(key: string): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

/** All account-directory writes are serialized by the extension background. */
export class FolderAccountHistoryStore {
  private tail: Promise<unknown> = Promise.resolve()
  private pending = 0

  constructor(private readonly storage: AccountStorage) {}

  execute(request: FolderAccountHistoryCommand): Promise<FolderAccountHistory> {
    if (this.pending >= 64) return Promise.reject(new Error('Account history is busy'))
    ++this.pending
    const operation = this.tail.then(() => this.apply(request))
    this.tail = operation.then(() => undefined, () => undefined)
    return operation.finally(() => { --this.pending })
  }

  private async read(): Promise<FolderAccountHistory> {
    const raw = (await this.storage.get(FOLDER_ACCOUNT_HISTORY_KEY))[FOLDER_ACCOUNT_HISTORY_KEY]
    if (!raw || typeof raw !== 'object') return { accounts: [] }
    const stored = raw as { accounts?: unknown; recentAccountScopeId?: unknown }
    const accounts = new Map<string, FolderAccountHistory['accounts'][number]>()
    for (const item of Array.isArray(stored.accounts) ? stored.accounts : []) {
      const parsed = folderAccountSchema.safeParse(item)
      if (!parsed.success) continue
      const previous = accounts.get(parsed.data.email)
      if (!previous || previous.lastUsedAt < parsed.data.lastUsedAt) accounts.set(parsed.data.email, parsed.data)
    }
    const rows = [...accounts.values()].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt) || left.email.localeCompare(right.email))
    const recent = typeof stored.recentAccountScopeId === 'string'
      && rows.some((row) => row.accountScopeId === stored.recentAccountScopeId)
      ? stored.recentAccountScopeId : undefined
    return { accounts: rows, recentAccountScopeId: recent }
  }

  private async apply(request: FolderAccountHistoryCommand): Promise<FolderAccountHistory> {
    const history = await this.read()
    if (request.method === 'get') return history
    const accounts = history.accounts.filter((account) => account.accountScopeId !== request.params.accountScopeId
      && (request.method !== 'remember' || account.email !== request.params.email))
    const next: FolderAccountHistory = request.method === 'remember'
      ? { accounts: [{ email: request.params.email, accountScopeId: request.params.accountScopeId, lastUsedAt: new Date().toISOString() }, ...accounts], recentAccountScopeId: request.params.accountScopeId }
      : { accounts, recentAccountScopeId: history.recentAccountScopeId === request.params.accountScopeId ? undefined : history.recentAccountScopeId }
    await this.storage.set({ [FOLDER_ACCOUNT_HISTORY_KEY]: next })
    return next
  }
}

export function createFolderAccountHistoryHandler(store = new FolderAccountHistoryStore(browser.storage.local)): ExtensionRpcMessageListener {
  return createExtensionRpcRouter([{
    namespace: 'folder-accounts', method: '*',
    requestSchema: folderAccountHistoryRequestSchema,
    responseSchema: folderAccountHistoryResponseSchema,
    validateSender: (sender) => sender.id === browser.runtime.id
      && /^https:\/\/gemini\.google\.com\//u.test(sender.url ?? sender.tab?.url ?? ''),
    async handle(rawRequest: unknown) {
      const request = rawRequest as FolderAccountHistoryRequest
      try {
        return { ok: true as const, requestId: request.requestId, data: await store.execute(request) }
      } catch (error) {
        console.error('[Folders] Account history storage failed', { requestId: request.requestId, method: request.method, error })
        return { ok: false as const, requestId: request.requestId }
      }
    },
  }])
}
