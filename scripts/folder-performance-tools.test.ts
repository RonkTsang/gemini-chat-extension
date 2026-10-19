import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseFolderExportPayload } from '../src/domain/folder/schemas'

it('generates deterministic importable fixtures and summarizes traces without exposing payloads', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpk-phase-a-'))
  try {
    const output = join(directory, 'fixture.json')
    const generate = (path: string) => execFileSync(process.execPath, ['scripts/create-folder-performance-fixture.mjs',
      '--scope', 'account-scope-0001', '--folders', '5', '--chats', '10', '--output', path])
    generate(output)
    const other = join(directory, 'same.json'); generate(other)
    expect(readFileSync(other, 'utf8')).toBe(readFileSync(output, 'utf8'))
    const data = parseFolderExportPayload(JSON.parse(readFileSync(output, 'utf8')))
    expect(data.data.memberships).toHaveLength(50)
    expect(new Set(data.data.memberships.map((row) => row.chatId)).size).toBe(10)
    expect(JSON.stringify(data)).not.toMatch(/nameKey|displayOrderKey/)
    const log = join(directory, 'page.log')
    writeFileSync(log, Array.from({ length: 20 }, (_, index) => `[Folders][rpc] ${JSON.stringify({
      timestamp: '2026-10-18T00:00:00.000Z', event: 'rpc.completed', context: 'content', phase: 'rpc', result: 'success',
      method: 'getSidebarState', durationMs: index + 1, responseBytes: 123,
    })}`).join('\n'))
    const summary = JSON.parse(execFileSync(process.execPath, ['scripts/summarize-folder-performance-logs.mjs', log], { encoding: 'utf8' }))
    expect(summary.groups[0]).toMatchObject({ samples: 20, durationMs: { p50: 10, p95: 19 }, responseBytes: { p50: 123, p95: 123 } })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('separates full and partial refresh timing and retains fallback evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpk-phase-b-'))
  try {
    const log = join(directory, 'page.log')
    const records = [
      { event: 'projection.updated', mode: 'partial', source: 'command', durationMs: 2 },
      { event: 'projection.updated', mode: 'full', source: 'broadcast', durationMs: 100 },
      { event: 'projection.fallback', source: 'broadcast', reason: 'revision-gap' },
    ]
    writeFileSync(log, records.map((record) => JSON.stringify({ timestamp: '2026-10-18T00:00:00.000Z', ...record, payload: 'PRIVATE' })).join('\n'))
    const summary = JSON.parse(execFileSync(process.execPath, ['scripts/summarize-folder-performance-logs.mjs', log], { encoding: 'utf8' }))
    expect(summary.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: 'partial', source: 'command', samples: 1, durationMs: { p50: 2, p95: 2 } }),
      expect.objectContaining({ mode: 'full', source: 'broadcast', samples: 1, durationMs: { p50: 100, p95: 100 } }),
      expect.objectContaining({ event: 'projection.fallback', reason: 'revision-gap' }),
    ]))
    expect(JSON.stringify(summary)).not.toContain('PRIVATE')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
