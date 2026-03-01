export const THEME_BACKGROUND_VERSION = 2 as const

export const BACKGROUND_BLUR_MIN = 0
export const BACKGROUND_BLUR_MAX = 20
export const BACKGROUND_FILE_SIZE_LIMIT = 5 * 1024 * 1024
export const SIDEBAR_SCRIM_INTENSITY_MIN = 0
export const SIDEBAR_SCRIM_INTENSITY_MAX = 100

export const ALLOWED_BACKGROUND_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type ThemeBackgroundMimeType =
  (typeof ALLOWED_BACKGROUND_IMAGE_MIME_TYPES)[number]

export type BackgroundImageRef =
  | { kind: 'none' }
  | { kind: 'asset'; assetId: string }

export interface ThemeBackgroundSettings {
  version: typeof THEME_BACKGROUND_VERSION
  backgroundImageEnabled: boolean
  backgroundBlurPx: number
  messageGlassEnabled: boolean
  sidebarScrimEnabled: boolean
  sidebarScrimIntensity: number
  imageRef: BackgroundImageRef
  updatedAt: string
}

export interface ThemeBackgroundPatch {
  backgroundImageEnabled?: boolean
  backgroundBlurPx?: number
  messageGlassEnabled?: boolean
  sidebarScrimEnabled?: boolean
  sidebarScrimIntensity?: number
  imageRef?: BackgroundImageRef
}

export interface ThemeBackgroundResolvedState {
  settings: ThemeBackgroundSettings
  resolvedBackgroundUrl: string | null
  isBackgroundRenderable: boolean
}

export interface ThemeAssetRow {
  id: string
  feature: 'background-image'
  mimeType: ThemeBackgroundMimeType
  size: number
  blob: Blob
  hash?: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}

export const DEFAULT_THEME_BACKGROUND_SETTINGS: ThemeBackgroundSettings = {
  version: THEME_BACKGROUND_VERSION,
  backgroundImageEnabled: false,
  backgroundBlurPx: 5,
  messageGlassEnabled: false,
  sidebarScrimEnabled: true,
  sidebarScrimIntensity: 20,
  imageRef: { kind: 'none' },
  updatedAt: '',
}

function clampBlur(value: number): number {
  return Math.min(
    BACKGROUND_BLUR_MAX,
    Math.max(BACKGROUND_BLUR_MIN, Math.round(value)),
  )
}

function clampSidebarScrimIntensity(value: number): number {
  return Math.min(
    SIDEBAR_SCRIM_INTENSITY_MAX,
    Math.max(SIDEBAR_SCRIM_INTENSITY_MIN, Math.round(value)),
  )
}

function normalizeImageRef(value: unknown): BackgroundImageRef {
  if (
    value
    && typeof value === 'object'
    && (value as BackgroundImageRef).kind === 'asset'
    && typeof (value as { assetId?: unknown }).assetId === 'string'
    && (value as { assetId: string }).assetId.trim().length > 0
  ) {
    return {
      kind: 'asset',
      assetId: (value as { assetId: string }).assetId.trim(),
    }
  }
  return { kind: 'none' }
}

export function isAllowedBackgroundImageMimeType(
  mimeType: string,
): mimeType is ThemeBackgroundMimeType {
  return (ALLOWED_BACKGROUND_IMAGE_MIME_TYPES as readonly string[]).includes(
    mimeType,
  )
}

export function normalizeThemeBackgroundSettings(
  raw: unknown,
): ThemeBackgroundSettings {
  const source = (raw && typeof raw === 'object')
    ? (raw as Partial<ThemeBackgroundSettings>)
    : {}

  const blurCandidate = Number(source.backgroundBlurPx)
  const blur = Number.isFinite(blurCandidate)
    ? clampBlur(blurCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundBlurPx

  const scrimIntensityCandidate = Number(source.sidebarScrimIntensity)
  const sidebarScrimIntensity = Number.isFinite(scrimIntensityCandidate)
    ? clampSidebarScrimIntensity(scrimIntensityCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity

  const imageRef = normalizeImageRef(source.imageRef)
  const enabled = Boolean(source.backgroundImageEnabled)
  const sidebarScrimEnabled = typeof source.sidebarScrimEnabled === 'boolean'
    ? source.sidebarScrimEnabled
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimEnabled
  const updatedAt = typeof source.updatedAt === 'string' && source.updatedAt
    ? source.updatedAt
    : new Date().toISOString()

  return {
    version: THEME_BACKGROUND_VERSION,
    backgroundImageEnabled: enabled,
    backgroundBlurPx: blur,
    messageGlassEnabled: Boolean(source.messageGlassEnabled),
    sidebarScrimEnabled,
    sidebarScrimIntensity,
    imageRef,
    updatedAt,
  }
}

export function buildThemeBackgroundResolvedState(
  settings: ThemeBackgroundSettings,
  resolvedBackgroundUrl: string | null,
): ThemeBackgroundResolvedState {
  return {
    settings,
    resolvedBackgroundUrl,
    isBackgroundRenderable:
      settings.backgroundImageEnabled && Boolean(resolvedBackgroundUrl),
  }
}
