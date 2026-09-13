import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'

import {
  FOLDERS_GET_DEVICE_ID_MESSAGE,
  isFoldersGetDeviceIdMessage,
  type FoldersGetDeviceIdResponse,
} from '@/types/runtime-messages'

export const FOLDER_DEVICE_ID_STORAGE_KEY = 'gpk.folders.device-id.v1'

interface LocalStorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(value: Record<string, string>): Promise<void>
}

/**
 * The background service worker is the only writer for the installation ID.
 * Its promise is deliberately single-flight so simultaneous content contexts
 * receive the exact value that was persisted and read back.
 */
export class FolderDeviceIdProvider {
  private pending?: Promise<string>

  constructor(private readonly storage: LocalStorageArea) {}

  get(): Promise<string> {
    this.pending ??= this.loadOrCreate()
    return this.pending
  }

  private async loadOrCreate(): Promise<string> {
    const existing = (await this.storage.get(FOLDER_DEVICE_ID_STORAGE_KEY))[FOLDER_DEVICE_ID_STORAGE_KEY]
    if (typeof existing === 'string' && existing.length > 0) return existing
    const candidate = `folder-device-${nanoid()}`
    await this.storage.set({ [FOLDER_DEVICE_ID_STORAGE_KEY]: candidate })
    const persisted = (await this.storage.get(FOLDER_DEVICE_ID_STORAGE_KEY))[FOLDER_DEVICE_ID_STORAGE_KEY]
    if (typeof persisted !== 'string' || persisted.length === 0) {
      throw new Error('Unable to persist the Folder installation device id')
    }
    return persisted
  }
}

let provider: FolderDeviceIdProvider | undefined
let started = false

export function startFolderDeviceIdProvider(): void {
  if (started) return
  started = true
  provider = new FolderDeviceIdProvider(browser.storage.local)
  browser.runtime.onMessage.addListener((message): Promise<FoldersGetDeviceIdResponse> | undefined => {
    if (!isFoldersGetDeviceIdMessage(message)) return undefined
    return provider!.get().then((deviceId) => ({ deviceId }))
  })
}
