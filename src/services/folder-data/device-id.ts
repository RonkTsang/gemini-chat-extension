import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'
import { folderDeviceIdSchema } from '@/domain/folder/schemas'

const STORAGE_KEY = 'gpk.folders.device-id.v1'
let deviceIdReady: Promise<string> | undefined

export interface FolderDeviceIdProvider {
  getDeviceId(): Promise<string>
}

/** Background-only installation identity, shared by repositories and Sync transport. */
export const runtimeFolderDeviceIdProvider: FolderDeviceIdProvider = {
  getDeviceId(): Promise<string> {
    deviceIdReady ??= loadDeviceId().catch((error: unknown) => {
      deviceIdReady = undefined
      throw error
    })
    return deviceIdReady
  },
}

async function loadDeviceId(): Promise<string> {
  // storage.local is authoritative; a background self-RPC is not reliable.
  const existing = folderDeviceIdSchema.safeParse((await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY])
  if (existing.success) return existing.data
  await browser.storage.local.set({ [STORAGE_KEY]: `folder-device-${nanoid()}` })
  return folderDeviceIdSchema.parse((await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY])
}
