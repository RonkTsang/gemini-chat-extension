export const GEM_AVATAR_FILE_SIZE_LIMIT = 3 * 1024 * 1024
export const GEM_AVATAR_OUTPUT_SIZE = 256
export const GEM_AVATAR_OUTPUT_MIME_TYPE = 'image/webp'
export const GEM_AVATAR_OUTPUT_QUALITY = 0.9

export const ALLOWED_GEM_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type GemAvatarMimeType =
  (typeof ALLOWED_GEM_AVATAR_MIME_TYPES)[number]

export interface GemAvatarAssetRow {
  gemId: string
  mimeType: GemAvatarMimeType
  size: number
  blob: Blob
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}

export type GemAvatarAsset = GemAvatarAssetRow

export interface PreparedGemAvatarAsset {
  mimeType: GemAvatarMimeType
  size: number
  blob: Blob
  width: number
  height: number
}

export type GemAvatarPage =
  | { kind: 'create' }
  | { kind: 'edit'; gemId: string }
  | { kind: 'list' }
  | { kind: 'chat'; gemId: string; chatId?: string }
  | { kind: 'other' }

export function isAllowedGemAvatarMimeType(
  mimeType: string,
): mimeType is GemAvatarMimeType {
  return (ALLOWED_GEM_AVATAR_MIME_TYPES as readonly string[]).includes(
    mimeType,
  )
}
