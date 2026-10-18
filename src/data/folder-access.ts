import Dexie, { type DBCoreTransaction, type Middleware, type DBCore, type Transaction } from 'dexie'
import { nanoid } from 'nanoid'
import { logDevEvent } from '@/utils/devLogger'

export interface FolderAccessCounts {
  records: number
  keys: number
  countRequests: number
  writes: number
  deleteRequests: number
  deleteRanges: number
}
export interface FolderAccessReport {
  traceId: string
  accountScopeId?: string
  dataRevision?: string
  capturedRevision?: string
  committedRevision?: string
  operation: string
  phase: string
  context: 'background'
  result: 'success' | 'rollback' | 'failed'
  durationMs: number
  tables: Record<string, FolderAccessCounts>
}
const scopesKey = Symbol('folder-access-scopes')
type ObservedTransaction = DBCoreTransaction & { [scopesKey]?: FolderAccessReport }

/** Below Dexie's hooks and cache: counts records actually returned by IDB requests. */
export const folderAccessMiddleware: Middleware<DBCore> = {
  stack: 'dbcore', name: 'FolderAccess', level: -2,
  create(core) {
    return { ...core, table(name) {
      const table = core.table(name)
      const observing = (transaction: ObservedTransaction) => !!transaction[scopesKey]
      const increment = (trans: ObservedTransaction, metric: keyof FolderAccessCounts, value: number) => {
        const report = trans[scopesKey]
        if (!report) return
        const counts = report.tables[name] ??= { records: 0, keys: 0, countRequests: 0, writes: 0, deleteRequests: 0, deleteRanges: 0 }
        counts[metric] += value
      }
      return { ...table,
        get(request) {
          if (!observing(request.trans)) return table.get(request)
          return table.get(request).then((result) => {
            increment(request.trans, 'records', result === undefined ? 0 : 1)
            return result
          })
        },
        getMany(request) {
          if (!observing(request.trans)) return table.getMany(request)
          return table.getMany(request).then((result) => {
            increment(request.trans, 'records', result.filter((row) => row !== undefined).length)
            return result
          })
        },
        query(request) {
          if (!observing(request.trans)) return table.query(request)
          return table.query(request).then((result) => {
            increment(request.trans, request.values ? 'records' : 'keys', result.result.length)
            return result
          })
        },
        count(request) {
          if (!observing(request.trans)) return table.count(request)
          increment(request.trans, 'countRequests', 1)
          return table.count(request)
        },
        openCursor(request) {
          if (!observing(request.trans)) return table.openCursor(request)
          return table.openCursor(request).then((cursor) => {
            if (cursor) {
              const start = cursor.start.bind(cursor)
              cursor.start = (next) => start(() => {
                if (!cursor.done) increment(request.trans, request.values ? 'records' : 'keys', 1)
                next()
              })
            }
            return cursor
          })
        },
        mutate(request) {
          if (!observing(request.trans)) return table.mutate(request)
          return table.mutate(request).then((result) => {
            if (request.type === 'deleteRange') increment(request.trans, 'deleteRanges', 1)
            else increment(request.trans, request.type === 'delete' ? 'deleteRequests' : 'writes',
              (request.type === 'delete' ? request.keys.length : request.values.length) - result.numFailures)
            return result
          })
        },
      }
    } }
  },
}

/** Statistics live only on this IDB transaction and are detached when observation finishes. */
export function beginFolderAccess(transaction: Transaction, details: {
  operation: string; phase: string; accountScopeId?: string
}): (result: FolderAccessReport['result'], extra?: Record<string, unknown>) => FolderAccessReport | undefined {
  if (!import.meta.env.DEV) return () => undefined
  const startedAt = performance.now()
  const trans: ObservedTransaction = transaction.idbtrans
  // Nested and parallel helpers share this transaction; report the outer operation once.
  if (trans[scopesKey]) return () => undefined
  const report: FolderAccessReport = { ...details, traceId: `folder-data-${nanoid(10)}`,
    context: 'background', result: 'success', durationMs: 0, tables: {} }
  trans[scopesKey] = report
  return (result, extra) => {
    delete trans[scopesKey]
    report.durationMs = performance.now() - startedAt
    report.result = result
    logDevEvent('debug', '[Folders][data-access]', 'data.access', { ...report, ...extra })
    return report
  }
}

/** Development observation only; the caller owns transaction scope and lifetime. */
export async function observeFolderQuery<T>(transaction: Transaction, operation: string, read: () => Promise<T>): Promise<T> {
  const finish = beginFolderAccess(transaction, { operation, phase: 'query' })
  let result: 'success' | 'failed' = 'failed'
  let extra: Record<string, unknown> = {}
  try {
    const data = await read()
    const projection = data && typeof data === 'object' && 'dataRevision' in data && 'data' in data ? data : undefined
    const value = projection ? projection.data : data
    if (projection) extra.dataRevision = projection.dataRevision
    if (value && typeof value === 'object') {
      if ('items' in value && Array.isArray(value.items)) extra = { ...extra, returned: value.items.length, hasNextPage: 'nextCursor' in value && !!value.nextCursor }
      if ('folders' in value && Array.isArray(value.folders)) extra = { ...extra, returned: value.folders.length, hasNextPage: 'nextCursor' in value && !!value.nextCursor, chatPageLimit: 10 }
    }
    result = 'success'
    return data
  } finally { finish(result, extra) }
}

export function currentFolderTraceId(): string | undefined {
  const trans: ObservedTransaction | undefined = Dexie.currentTransaction?.idbtrans
  return trans?.[scopesKey]?.traceId
}
