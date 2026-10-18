import Dexie, { type Table } from 'dexie'
import { keyBetween, rebalanceOrderKeys } from '@/domain/folder/order-key'
import { currentFolderTraceId } from '../folder-access'
import { logDevEvent } from '@/utils/devLogger'

interface OrderedRow { id: string; accountScopeId: string; orderKey: string }
interface Position { beforeId?: string; afterId?: string }

/** Normal writes read only validated anchors and at most two neighboring records. */
export async function indexedOrderKey<T extends OrderedRow>(options: {
  table: Table<T, string>
  index: string
  lower: unknown[]
  upper: unknown[]
  position?: Position
  excludeId?: string
  key: (row: T) => string
  indexKey?: (row: T) => string
  accepts: (row: T) => boolean
  anchorAccepts?: (row: T) => boolean
  patch: (row: T, orderKey: string) => T
}): Promise<string> {
  const { table, index, lower, upper, position, excludeId, key, accepts, patch } = options
  const bound = (row: T): unknown[] => [...lower.slice(0, 2), (options.indexKey ?? key)(row), row.id]
  const neighbor = async (from: unknown[], to: unknown[], reverse = false): Promise<T | undefined> => {
    const query = table.where(index).between(from, to, false, false)
    const rows = await (reverse ? query.reverse() : query).limit(excludeId ? 2 : 1).toArray()
    return rows.find((row) => row.id !== excludeId)
  }
  const anchor = async (id: string | undefined, label: string): Promise<T | undefined> => {
    if (!id) return undefined
    const row = await table.get(id)
    if (!row || row.id === excludeId || !accepts(row)) throw new Error(`Position ${label} is unavailable`)
    if (options.anchorAccepts && !options.anchorAccepts(row)) throw new Error('Cannot reorder chats across pin groups')
    return row
  }
  if (position?.beforeId && position.beforeId === position.afterId) throw new Error('Position bounds must be distinct')
  const before = await anchor(position?.beforeId, 'beforeId')
  const after = await anchor(position?.afterId, 'afterId')
  const calculate = async (): Promise<string> => {
    const next = before ?? (after ? await neighbor(bound(after), upper) : await neighbor(lower, upper))
    const previous = after ?? (before ? await neighbor(lower, bound(before), true) : undefined)
    if (before && after && (await neighbor(bound(after), upper))?.id !== before.id) {
      throw new Error('Position bounds are no longer adjacent')
    }
    const left = previous ? key(previous) : undefined
    const right = next ? key(next) : undefined
    if (left !== undefined && left === right) throw new Error('Folder order key space exhausted; rebalance required')
    return keyBetween(left, right)
  }
  try { return await calculate() }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('space exhausted')) throw error
    const startedAt = import.meta.env.DEV ? performance.now() : 0
    const rows = (await table.where(index).between(lower, upper, false, false).toArray()).filter((row) => row.id !== excludeId)
    const keys = rebalanceOrderKeys(rows.map((row) => row.id))
    const updated = rows.map((row) => patch(row, keys.get(row.id)!))
    await table.bulkPut(updated)
    // Reload only the anchors changed by the maintenance branch.
    if (before) Object.assign(before, updated.find((row) => row.id === before.id))
    if (after) Object.assign(after, updated.find((row) => row.id === after.id))
    if (import.meta.env.DEV) logDevEvent('debug', '[Folders][data-access]', 'order.rebalanced', { traceId: currentFolderTraceId(), context: 'background', phase: 'maintenance',
      result: 'success', table: table.name, index, containerId: lower[1], rows: updated.length, durationMs: performance.now() - startedAt })
    return calculate()
  }
}

export const orderRange = (accountScopeId: string, containerId: string): [unknown[], unknown[]] => [
  [accountScopeId, containerId, Dexie.minKey, Dexie.minKey],
  [accountScopeId, containerId, Dexie.maxKey],
]
