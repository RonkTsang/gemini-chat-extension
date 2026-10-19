import { parseFolderSyncData } from '@/domain/folder/schemas'
import type { BrowserSyncManifest, FolderAccountData } from '@/domain/folder/types'
import {
  decodeGzipBase64,
  fromFolderOrganizationData as fromFolderSyncData,
  sha256Hex,
} from '@/services/folder-data/codec'

export {
  decodeGzipBase64,
  encodeGzipBase64,
  fromFolderOrganizationData as fromFolderSyncData,
  sha256Hex,
  stableStringify,
  toFolderOrganizationData as toFolderSyncData,
} from '@/services/folder-data/codec'

/** Validate the compressed bytes before decoding and assigning account ownership. */
export async function decodeAndVerifySyncData(manifest: BrowserSyncManifest, payload: string): Promise<FolderAccountData> {
  if (new TextEncoder().encode(payload).byteLength !== manifest.payloadBytes) {
    throw new Error('Folder sync payload bytes do not match')
  }
  if (await sha256Hex(payload) !== manifest.payloadHash) {
    throw new Error('Folder sync content hash does not match the payload')
  }
  const data = parseFolderSyncData(await decodeGzipBase64(payload))
  return fromFolderSyncData(manifest.accountScopeId, data)
}
