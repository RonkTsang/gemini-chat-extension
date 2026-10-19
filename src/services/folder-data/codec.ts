import { parseFolderAccountData } from '@/domain/folder/schemas'
import { scopeFolderOrganizationData } from '@/domain/folder/organization-data'
import type { FolderAccountData, FolderOrganizationData } from '@/domain/folder/types'

export { toFolderOrganizationData } from '@/domain/folder/organization-data'

/** Shared serialization and integrity primitives for all Folder data packages. */
export function stableStringify(value: unknown): string {
  // Match JSON.stringify semantics for optional fields. In particular, an
  // undefined object property is omitted (not serialized as the invalid JSON
  // token `undefined`), while undefined array slots become null.
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined && typeof record[key] !== 'function' && typeof record[key] !== 'symbol')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export class FolderCompressionUnavailableError extends Error {
  constructor(api: 'CompressionStream' | 'DecompressionStream') {
    super(`${api} is unavailable; Folder gzip processing is disabled`)
    this.name = 'FolderCompressionUnavailableError'
  }
}

function byteStream(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

export async function encodeGzip(value: unknown): Promise<ArrayBuffer> {
  if (typeof globalThis.CompressionStream !== 'function') throw new FolderCompressionUnavailableError('CompressionStream')
  const bytes = new TextEncoder().encode(stableStringify(value))
  return new Response(byteStream(bytes).pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
}

export async function decodeGzip(payload: ArrayBuffer): Promise<unknown> {
  if (typeof globalThis.DecompressionStream !== 'function') throw new FolderCompressionUnavailableError('DecompressionStream')
  const bytes = await new Response(byteStream(new Uint8Array(payload)).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new Error('Folder payload is not valid UTF-8 JSON')
  }
}

export async function encodeGzipBase64(value: unknown): Promise<string> {
  const bytes = new Uint8Array(await encodeGzip(value))
  const chunks: string[] = []
  // Bound argument counts even when recovery-sized data is encoded for Sync.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return btoa(chunks.join(''))
}

export async function decodeGzipBase64(payload: string): Promise<unknown> {
  if (!payload.length || payload.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(payload)) {
    throw new Error('Folder payload is not valid Base64')
  }
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return decodeGzip(bytes.buffer)
}

/** SHA-256 is required: callers must not replace it with a non-cryptographic hash. */
export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto SHA-256 is unavailable; Folder sync is disabled')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function fromFolderOrganizationData(accountScopeId: string, data: FolderOrganizationData): FolderAccountData {
  return parseFolderAccountData(scopeFolderOrganizationData(accountScopeId, data))
}
