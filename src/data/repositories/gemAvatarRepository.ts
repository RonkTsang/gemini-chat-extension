import { z } from 'zod'

import {
  GEM_AVATAR_FILE_SIZE_LIMIT,
  GEM_AVATAR_OUTPUT_MIME_TYPE,
  GEM_AVATAR_OUTPUT_QUALITY,
  GEM_AVATAR_OUTPUT_SIZE,
  isAllowedGemAvatarMimeType,
  type GemAvatarAsset,
  type GemAvatarAssetRow,
  type GemAvatarMimeType,
  type PreparedGemAvatarAsset,
} from '@/domain/gem-avatar/types'

import { localDexieDataSource } from '../sources'

type GemAvatarErrorCode =
  | 'invalid-gem-id'
  | 'invalid-file-type'
  | 'file-too-large'
  | 'image-load-failed'
  | 'canvas-unavailable'
  | 'image-encode-failed'

export class GemAvatarError extends Error {
  code: GemAvatarErrorCode

  constructor(code: GemAvatarErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const GemIdSchema = z.string().trim().min(1)

function nowIso(): string {
  return new Date().toISOString()
}

function parseGemId(gemId: string): string {
  const parsed = GemIdSchema.safeParse(gemId)
  if (!parsed.success) {
    throw new GemAvatarError('invalid-gem-id', 'Gem ID is required')
  }
  return parsed.data
}

function rowToDomain(row: GemAvatarAssetRow): GemAvatarAsset {
  return row
}

function revokeObjectUrl(url: string | null): void {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('[GemAvatar] Failed to revoke object URL:', error)
  }
}

function validateGemAvatarFile(
  file: File,
): asserts file is File & { type: GemAvatarMimeType } {
  if (!isAllowedGemAvatarMimeType(file.type)) {
    throw new GemAvatarError(
      'invalid-file-type',
      `Unsupported file type: ${file.type}`,
    )
  }
  if (file.size > GEM_AVATAR_FILE_SIZE_LIMIT) {
    throw new GemAvatarError(
      'file-too-large',
      `File size exceeds ${GEM_AVATAR_FILE_SIZE_LIMIT} bytes`,
    )
  }
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') {
    throw new GemAvatarError('image-load-failed', 'Image API is unavailable')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(
        new GemAvatarError('image-load-failed', 'Image loading failed'),
      )
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new GemAvatarError(
            'image-encode-failed',
            'Image encoding failed',
          ))
          return
        }
        resolve(blob)
      },
      GEM_AVATAR_OUTPUT_MIME_TYPE,
      GEM_AVATAR_OUTPUT_QUALITY,
    )
  })
}

async function normalizeGemAvatarFile(
  file: File & { type: GemAvatarMimeType },
): Promise<PreparedGemAvatarAsset> {
  const image = await loadImageFromFile(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const sourceSize = Math.min(width, height)

  if (!sourceSize) {
    throw new GemAvatarError('image-load-failed', 'Image has no dimensions')
  }

  const canvas = document.createElement('canvas')
  canvas.width = GEM_AVATAR_OUTPUT_SIZE
  canvas.height = GEM_AVATAR_OUTPUT_SIZE
  const context = canvas.getContext('2d')

  if (!context) {
    throw new GemAvatarError('canvas-unavailable', 'Canvas is unavailable')
  }

  const sourceX = Math.max(0, Math.floor((width - sourceSize) / 2))
  const sourceY = Math.max(0, Math.floor((height - sourceSize) / 2))
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    GEM_AVATAR_OUTPUT_SIZE,
    GEM_AVATAR_OUTPUT_SIZE,
  )

  const blob = await encodeCanvas(canvas)

  return {
    mimeType: GEM_AVATAR_OUTPUT_MIME_TYPE,
    size: blob.size,
    blob,
    width: GEM_AVATAR_OUTPUT_SIZE,
    height: GEM_AVATAR_OUTPUT_SIZE,
  }
}

export interface IGemAvatarRepository {
  getByGemId(gemId: string): Promise<GemAvatarAsset | undefined>
  prepare(file: File): Promise<PreparedGemAvatarAsset>
  savePrepared(gemId: string, prepared: PreparedGemAvatarAsset): Promise<GemAvatarAsset>
  upsert(gemId: string, file: File): Promise<GemAvatarAsset>
  deleteByGemId(gemId: string): Promise<void>
  resolveObjectUrl(gemId: string): Promise<string | null>
  revokeActiveObjectUrl(): void
}

class GemAvatarRepository implements IGemAvatarRepository {
  private activeGemId: string | null = null
  private activeObjectUrl: string | null = null

  async getByGemId(gemId: string): Promise<GemAvatarAsset | undefined> {
    const parsedGemId = parseGemId(gemId)
    const row = await localDexieDataSource.getGemAvatarByGemId(parsedGemId)
    return row ? rowToDomain(row) : undefined
  }

  async prepare(file: File): Promise<PreparedGemAvatarAsset> {
    validateGemAvatarFile(file)
    return await normalizeGemAvatarFile(file)
  }

  async savePrepared(
    gemId: string,
    prepared: PreparedGemAvatarAsset,
  ): Promise<GemAvatarAsset> {
    const parsedGemId = parseGemId(gemId)
    const existing = await localDexieDataSource.getGemAvatarByGemId(parsedGemId)
    const timestamp = nowIso()
    const row: GemAvatarAssetRow = {
      gemId: parsedGemId,
      mimeType: prepared.mimeType,
      size: prepared.size,
      blob: prepared.blob,
      width: prepared.width,
      height: prepared.height,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    if (this.activeGemId === parsedGemId) {
      this.revokeActiveObjectUrl()
    }

    await localDexieDataSource.putGemAvatarAsset(row)
    return rowToDomain(row)
  }

  async upsert(gemId: string, file: File): Promise<GemAvatarAsset> {
    const prepared = await this.prepare(file)
    return await this.savePrepared(gemId, prepared)
  }

  async deleteByGemId(gemId: string): Promise<void> {
    const parsedGemId = parseGemId(gemId)

    if (this.activeGemId === parsedGemId) {
      this.revokeActiveObjectUrl()
    }

    await localDexieDataSource.deleteGemAvatarAsset(parsedGemId)
  }

  async resolveObjectUrl(gemId: string): Promise<string | null> {
    const parsedGemId = parseGemId(gemId)

    if (this.activeGemId === parsedGemId && this.activeObjectUrl) {
      return this.activeObjectUrl
    }

    this.revokeActiveObjectUrl()

    const asset = await this.getByGemId(parsedGemId)
    if (!asset) {
      return null
    }

    const objectUrl = URL.createObjectURL(asset.blob)
    this.activeGemId = parsedGemId
    this.activeObjectUrl = objectUrl
    return objectUrl
  }

  revokeActiveObjectUrl(): void {
    revokeObjectUrl(this.activeObjectUrl)
    this.activeGemId = null
    this.activeObjectUrl = null
  }
}

export const gemAvatarRepository = new GemAvatarRepository()
export { validateGemAvatarFile }
