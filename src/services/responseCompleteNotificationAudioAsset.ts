import { db, type NotificationAudioAssetRow } from '@/data/db'

export const RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID = 'response-complete-notification' as const
export const RESPONSE_COMPLETE_NOTIFICATION_AUDIO_FILE_SIZE_LIMIT = 2 * 1024 * 1024

export type ResponseCompleteNotificationAudioAssetErrorCode =
  | 'file-too-large'
  | 'unsupported-type'
  | 'decode-failed'
  | 'storage-failed'

export interface ResponseCompleteNotificationAudioAssetMetadata {
  id: typeof RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID
  fileName: string
  mimeType: string
  size: number
  createdAt: string
  updatedAt: string
}

interface PersistResponseCompleteNotificationAudioAssetInput {
  fileName: string
  mimeType: string
  size: number
  blob: Blob
}

export class ResponseCompleteNotificationAudioAssetError extends Error {
  code: ResponseCompleteNotificationAudioAssetErrorCode

  constructor(code: ResponseCompleteNotificationAudioAssetErrorCode, message: string) {
    super(message)
    this.name = 'ResponseCompleteNotificationAudioAssetError'
    this.code = code
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function toMetadata(row: NotificationAudioAssetRow): ResponseCompleteNotificationAudioAssetMetadata {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function createAudioDecodeError(): ResponseCompleteNotificationAudioAssetError {
  return new ResponseCompleteNotificationAudioAssetError(
    'decode-failed',
    'Audio file could not be decoded by this browser',
  )
}

async function assertBrowserCanDecodeAudio(file: File): Promise<void> {
  if (!globalThis.Audio || !URL.createObjectURL || !URL.revokeObjectURL) {
    throw createAudioDecodeError()
  }

  const objectUrl = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    const audio = new Audio()
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(createAudioDecodeError())
    }, 10000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('error', handleError)
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(objectUrl)
    }

    const handleLoaded = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(createAudioDecodeError())
    }

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('error', handleError)
    audio.src = objectUrl
    audio.load()
  })
}

export async function validateResponseCompleteNotificationAudioFile(file: File): Promise<void> {
  if (file.size >= RESPONSE_COMPLETE_NOTIFICATION_AUDIO_FILE_SIZE_LIMIT) {
    throw new ResponseCompleteNotificationAudioAssetError(
      'file-too-large',
      'Audio file must be smaller than 2MB',
    )
  }

  if (!file.type.startsWith('audio/')) {
    throw new ResponseCompleteNotificationAudioAssetError(
      'unsupported-type',
      'Selected file is not an audio file',
    )
  }

  await assertBrowserCanDecodeAudio(file)
}

export async function getResponseCompleteNotificationAudioAssetMetadata(): Promise<ResponseCompleteNotificationAudioAssetMetadata | null> {
  const row = await db.notification_audio_assets.get(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID)
  return row ? toMetadata(row) : null
}

export async function getResponseCompleteNotificationAudioAsset(): Promise<NotificationAudioAssetRow | null> {
  return (await db.notification_audio_assets.get(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID)) ?? null
}

export async function saveResponseCompleteNotificationAudioAsset(
  file: File,
): Promise<ResponseCompleteNotificationAudioAssetMetadata> {
  await validateResponseCompleteNotificationAudioFile(file)
  return persistResponseCompleteNotificationAudioAsset({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    blob: file,
  })
}

export async function persistResponseCompleteNotificationAudioAsset(
  input: PersistResponseCompleteNotificationAudioAssetInput,
): Promise<ResponseCompleteNotificationAudioAssetMetadata> {
  const timestamp = nowIso()
  const existing = await db.notification_audio_assets.get(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID)
  const row: NotificationAudioAssetRow = {
    id: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    blob: input.blob,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  try {
    await db.notification_audio_assets.put(row)
  } catch (error) {
    throw new ResponseCompleteNotificationAudioAssetError(
      'storage-failed',
      error instanceof Error ? error.message : 'Failed to save audio file',
    )
  }

  return toMetadata(row)
}

export async function deleteResponseCompleteNotificationAudioAsset(): Promise<void> {
  await db.notification_audio_assets.delete(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID)
}
