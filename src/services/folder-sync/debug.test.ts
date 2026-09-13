import { afterEach, describe, expect, it } from 'vitest'

import { installFolderSyncDebugGlobal } from './debug'
import { encodeLzStringBase64 } from './codec'

describe('Folder sync debug global', () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { decompressFolderData?: unknown })
      .decompressFolderData
  })

  it('exposes the Folder decoder while running in development', () => {
    const uninstall = installFolderSyncDebugGlobal()
    const compressedPayload = encodeLzStringBase64({ folderId: 'folder-1' })

    expect(
      (globalThis as typeof globalThis & {
        decompressFolderData?: (value: string) => unknown
      }).decompressFolderData?.(compressedPayload),
    ).toEqual({ folderId: 'folder-1' })

    uninstall()

    expect('decompressFolderData' in globalThis).toBe(false)
  })

  it('restores an existing configurable global when uninstalled', () => {
    const existingDecoder = () => ({ pageOwned: true })
    Object.defineProperty(globalThis, 'decompressFolderData', {
      configurable: true,
      value: existingDecoder,
    })

    const uninstall = installFolderSyncDebugGlobal()
    uninstall()

    expect(
      (globalThis as typeof globalThis & {
        decompressFolderData?: unknown
      }).decompressFolderData,
    ).toBe(existingDecoder)
  })
})
