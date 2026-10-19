import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeGzip, encodeGzip, FolderCompressionUnavailableError } from '@/services/folder-data/codec'
import { decodeGzipBase64, encodeGzipBase64, sha256Hex, stableStringify, decodeAndVerifySyncData } from './codec'
import { BROWSER_SYNC_SCHEMA_VERSION } from '@/domain/folder/types'

afterEach(() => vi.unstubAllGlobals())

describe('Folder sync codec', () => {
  it('uses deterministic stable JSON and native gzip binary and base64 round trips', async () => {
    const left = { z: ['b', 'a'], a: { second: 2, first: 1 } }
    const right = { a: { first: 1, second: 2 }, z: ['b', 'a'] }
    expect(stableStringify(left)).toBe(stableStringify(right))
    const binary = await encodeGzip(left)
    expect(binary).toBeInstanceOf(ArrayBuffer)
    expect(Array.from(new Uint8Array(binary).slice(0, 2))).toEqual([0x1f, 0x8b])
    expect(await decodeGzip(binary)).toEqual(right)
    expect(await decodeGzipBase64(await encodeGzipBase64(left))).toEqual(right)
  })

  it('omits undefined object fields while preserving JSON array semantics', async () => {
    const value = { folder: { name: 'Inbox', deletedAt: undefined }, optional: undefined, rows: [undefined, 'chat-1'] }
    expect(stableStringify(value)).toBe('{"folder":{"name":"Inbox"},"rows":[null,"chat-1"]}')
    expect(await decodeGzipBase64(await encodeGzipBase64(value))).toEqual({
      folder: { name: 'Inbox' }, rows: [null, 'chat-1'],
    })
  })

  it('fails closed for malformed compressed input and exposes a SHA-256 digest', async () => {
    await expect(decodeGzipBase64('not valid compressed content')).rejects.toThrow()
    await expect(sha256Hex('folders')).resolves.toBe('63b8533061410c19b6a9b7c7bf81a935f1845164e860440ca1197002e3c81cb9')
    expect(await sha256Hex(new TextEncoder().encode('folders').buffer)).toBe(await sha256Hex('folders'))
  })

  it.each([{ folders: [], memberships: [], chatReferences: [] }, { name: '文件夹🙂', title: 'e\u0301' }])('round trips Unicode and empty data', async (value) => {
    expect(await decodeGzipBase64(await encodeGzipBase64(value))).toEqual(value)
  })

  it('handles multi-MiB data and large base64 conversions without argument overflow', async () => {
    let seed = 7
    const rows = Array.from({ length: 30000 }, (_, index) => {
      const title = Array.from({ length: 80 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return String.fromCharCode(33 + (seed >>> 16) % 90)
      }).join('')
      return { id: index, title: `中文🙂${title}` }
    })
    const payload = await encodeGzipBase64(rows)
    expect(payload.length).toBeGreaterThan(500000)
    expect(await decodeGzipBase64(payload)).toEqual(rows)
  })

  it.each(['', '!!!!', 'abc', 'a===', 'AAAA\nAAA='])('rejects malformed base64 %j', async (payload) => {
    await expect(decodeGzipBase64(payload)).rejects.toThrow()
  })

  it('rejects truncated and corrupted gzip and invalid JSON/UTF-8', async () => {
    const binary = await encodeGzip({ name: 'Valid' })
    await expect(decodeGzip(binary.slice(0, binary.byteLength - 4))).rejects.toThrow()
    const corrupted = binary.slice(0)
    new Uint8Array(corrupted)[corrupted.byteLength - 8] ^= 0xff
    await expect(decodeGzip(corrupted)).rejects.toThrow()
    for (const bytes of [new TextEncoder().encode('invalid JSON'), new Uint8Array([0xff])]) {
      const gzip = await new Response(new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      await expect(decodeGzip(gzip)).rejects.toThrow('UTF-8 JSON')
    }
  })

  it('reports missing native interfaces explicitly', async () => {
    const binary = await encodeGzip({})
    vi.stubGlobal('CompressionStream', undefined)
    await expect(encodeGzip({})).rejects.toBeInstanceOf(FolderCompressionUnavailableError)
    vi.stubGlobal('DecompressionStream', undefined)
    await expect(decodeGzip(binary)).rejects.toBeInstanceOf(FolderCompressionUnavailableError)
  })

  it('verifies transport bytes and hash before validating the decoded organization', async () => {
    const payload = await encodeGzipBase64({ folders: [], memberships: [], chatReferences: [] })
    const manifest = { schemaVersion: BROWSER_SYNC_SCHEMA_VERSION, accountScopeId: 'account-scope-0001', snapshotId: 'snapshot',
      chunkCount: 1, payloadBytes: payload.length, payloadHash: await sha256Hex(payload), settings: { enabled: true, hideOrganizedChats: false } }
    await expect(decodeAndVerifySyncData(manifest, payload)).resolves.toMatchObject({ folders: [] })
    await expect(decodeAndVerifySyncData({ ...manifest, payloadBytes: payload.length + 1 }, payload)).rejects.toThrow('bytes')
    await expect(decodeAndVerifySyncData({ ...manifest, payloadHash: '0'.repeat(64) }, payload)).rejects.toThrow('hash')
    const invalid = await encodeGzipBase64({ folders: [] })
    await expect(decodeAndVerifySyncData({ ...manifest, payloadBytes: invalid.length, payloadHash: await sha256Hex(invalid) }, invalid)).rejects.toThrow()
  })
})
