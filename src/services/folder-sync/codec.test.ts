import { describe, expect, it } from 'vitest'

import { decodeLzStringBase64, encodeLzStringBase64, sha256Hex, stableStringify } from './codec'

describe('Folder sync codec', () => {
  it('uses deterministic stable JSON and a real lz-string base64 round trip', () => {
    const left = { z: ['b', 'a'], a: { second: 2, first: 1 } }
    const right = { a: { first: 1, second: 2 }, z: ['b', 'a'] }
    expect(stableStringify(left)).toBe(stableStringify(right))
    expect(decodeLzStringBase64(encodeLzStringBase64(left))).toEqual(right)
  })

  it('omits undefined object fields while preserving JSON array semantics', () => {
    const value = { folder: { name: 'Inbox', deletedAt: undefined }, optional: undefined, rows: [undefined, 'chat-1'] }
    expect(stableStringify(value)).toBe('{"folder":{"name":"Inbox"},"rows":[null,"chat-1"]}')
    expect(decodeLzStringBase64(encodeLzStringBase64(value))).toEqual({
      folder: { name: 'Inbox' }, rows: [null, 'chat-1'],
    })
  })

  it('fails closed for malformed compressed input and exposes a SHA-256 digest', async () => {
    expect(() => decodeLzStringBase64('not valid compressed content')).toThrow()
    await expect(sha256Hex('folders')).resolves.toBe('63b8533061410c19b6a9b7c7bf81a935f1845164e860440ca1197002e3c81cb9')
  })
})
