import { decodeLzStringBase64 } from './codec'

const FOLDER_DECOMPRESS_DEBUG_GLOBAL = 'decompressFolderData'

type FolderSyncDebugGlobal = typeof globalThis & {
  decompressFolderData?: typeof decodeLzStringBase64
}

/** Exposes the Folder payload decoder in extension background DevTools only. */
export function installFolderSyncDebugGlobal(
  globalRef: FolderSyncDebugGlobal = globalThis,
): () => void {
  if (!import.meta.env.DEV) {
    return () => undefined
  }

  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalRef,
    FOLDER_DECOMPRESS_DEBUG_GLOBAL,
  )
  if (previousDescriptor && !previousDescriptor.configurable) {
    console.warn(
      '[Folders] Cannot expose decompressFolderData: globalThis.decompressFolderData is not configurable',
    )
    return () => undefined
  }

  Object.defineProperty(globalRef, FOLDER_DECOMPRESS_DEBUG_GLOBAL, {
    configurable: true,
    enumerable: false,
    value: decodeLzStringBase64,
    writable: false,
  })

  return () => {
    if (globalRef.decompressFolderData !== decodeLzStringBase64) {
      return
    }

    if (previousDescriptor) {
      Object.defineProperty(globalRef, FOLDER_DECOMPRESS_DEBUG_GLOBAL, previousDescriptor)
      return
    }

    delete globalRef.decompressFolderData
  }
}
