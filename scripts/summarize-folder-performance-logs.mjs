import { readFile } from 'node:fs/promises'

const paths = process.argv.slice(2)
if (!paths.length) throw new Error('Usage: node scripts/summarize-folder-performance-logs.mjs page.log worker.log')
const groups = new Map()
const percentile = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : null
let parsed = 0
for (const path of paths) {
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const start = line.indexOf('{"timestamp":')
    if (start < 0) continue
    let record
    try { record = JSON.parse(line.slice(start)) } catch { continue }
    if (!['data.access', 'rpc.completed', 'rpc.failed', 'projection.updated', 'projection.failed', 'projection.retry', 'projection.discarded',
      'projection.partial', 'projection.capture', 'projection.merged', 'projection.deduplicated', 'projection.fallback', 'order.rebalanced'].includes(record.event)) continue
    parsed++
    const key = JSON.stringify({ event: record.event, operation: record.operation ?? record.method,
      context: record.context, phase: record.phase, result: record.result, limit: record.limit, hasCursor: record.hasCursor,
      mode: record.mode, source: record.source, reason: record.reason, requestedChatPages: record.requestedChatPages })
    const group = groups.get(key) ?? { samples: 0, durations: [], bytes: [], records: {}, countRequests: {} }
    group.samples++
    if (Number.isFinite(record.durationMs)) group.durations.push(record.durationMs)
    if (Number.isFinite(record.responseBytes)) group.bytes.push(record.responseBytes)
    for (const [table, counts] of Object.entries(record.tables ?? {})) {
      ;(group.records[table] ??= []).push(counts.records)
      ;(group.countRequests[table] ??= []).push(counts.countRequests)
    }
    groups.set(key, group)
  }
}
console.log(JSON.stringify({ files: paths, parsed, groups: [...groups].map(([key, group]) => ({
  ...JSON.parse(key), samples: group.samples, durationMs: { p50: percentile(group.durations, .5), p95: percentile(group.durations, .95) },
  responseBytes: { p50: percentile(group.bytes, .5), p95: percentile(group.bytes, .95) },
  records: Object.fromEntries(Object.entries(group.records).map(([table, values]) => [table, { min: Math.min(...values), max: Math.max(...values) }])),
  countRequests: Object.fromEntries(Object.entries(group.countRequests).map(([table, values]) => [table, { min: Math.min(...values), max: Math.max(...values) }])),
})) }, null, 2))
