import { vi } from 'vitest'

export interface NativeAccessCounts {
  records: number; keys: number; countRequests: number; writes: number; deleteRequests: number
}

/** Independent of the production DBCore counters; observes actual IDB success events. */
export function observeFolderIndexedDB() {
  const tables: Record<string, NativeAccessCounts> = {}
  const transactions = new Map<IDBTransaction, Record<string, NativeAccessCounts>>()
  const restorers: Array<() => void> = []
  const counts = (target: Record<string, NativeAccessCounts>, name: string) => target[name] ??= { records: 0, keys: 0, countRequests: 0, writes: 0, deleteRequests: 0 }
  const attach = (source: IDBObjectStore | IDBIndex, method: string, request: IDBRequest): IDBRequest => {
    const store = 'objectStore' in source ? source.objectStore : source
    const name = store.name
    if (!name.startsWith('folder') && name !== 'folders') return request
    const transactionTables = transactions.get(store.transaction) ?? {}
    transactions.set(store.transaction, transactionTables)
    const increment = (metric: keyof NativeAccessCounts, value: number) => {
      counts(tables, name)[metric] += value
      counts(transactionTables, name)[metric] += value
    }
    if (method === 'count') increment('countRequests', 1)
    request.addEventListener('success', () => {
      const result: unknown = request.result
      if (method === 'get') increment('records', Number(result !== undefined))
      if (method === 'getAll') increment('records', Array.isArray(result) ? result.length : 0)
      if (method === 'getKey') increment('keys', Number(result !== undefined))
      if (method === 'getAllKeys') increment('keys', Array.isArray(result) ? result.length : 0)
      if (method === 'openCursor') increment('records', Number(!!result))
      if (method === 'openKeyCursor') increment('keys', Number(!!result))
      if (method === 'put' || method === 'add') increment('writes', 1)
      if (method === 'delete') increment('deleteRequests', 1)
    })
    return request
  }
  for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    for (const method of ['get', 'getAll', 'getKey', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete'] as const) {
      if (!(method in prototype)) continue
      // IDB method signatures differ; preserve each native call and observe its returned request.
      const target = prototype as unknown as Record<string, (...args: unknown[]) => IDBRequest>
      const original = target[method]
      const spy = vi.spyOn(target, method).mockImplementation(function (this: IDBObjectStore | IDBIndex, ...args: unknown[]) {
        return attach(this, method, original.apply(this, args))
      })
      restorers.push(() => spy.mockRestore())
    }
  }
  return { tables, transactions, reset: () => { for (const key of Object.keys(tables)) delete tables[key]; transactions.clear() },
    stop: () => { for (const restore of restorers.reverse()) restore() } }
}
