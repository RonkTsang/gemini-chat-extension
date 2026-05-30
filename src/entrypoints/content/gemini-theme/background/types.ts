import type {
  WelcomeGreetingReadabilityMode,
  WelcomeGreetingResolved,
} from './welcome-greeting/types'
import {
  clampMessageGlassBackgroundVisibility,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN,
} from './messageGlassVisibility'

export const THEME_BACKGROUND_VERSION = 4 as const

export const BACKGROUND_BLUR_MIN = 0
export const BACKGROUND_BLUR_MAX = 20
export const BACKGROUND_FILE_SIZE_LIMIT = 5 * 1024 * 1024
export {
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX,
  MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN,
}
export const MESSAGE_GLASS_TRANSPARENCY_MIN = 0
export const MESSAGE_GLASS_TRANSPARENCY_MAX = 100
export const MESSAGE_GLASS_LIGHT_TRANSPARENCY_DEFAULT = 40
export const MESSAGE_GLASS_DARK_TRANSPARENCY_DEFAULT = 90
export const MESSAGE_GLASS_BLUR_MIN = 0
export const MESSAGE_GLASS_BLUR_MAX = 20
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
  messageGlassTransparency: number
  messageGlassLightTransparency: number
  messageGlassDarkTransparency: number
  messageGlassBackgroundVisibility: number
  messageGlassBlurPx: number
  messageGlassTransparencyCustomized: boolean
  messageGlassLightTransparencyCustomized: boolean
  messageGlassDarkTransparencyCustomized: boolean
  messageGlassBackgroundVisibilityCustomized: boolean
  messageGlassBlurCustomized: boolean
  sidebarScrimEnabled: boolean
  sidebarScrimIntensity: number
  welcomeGreetingReadabilityMode: WelcomeGreetingReadabilityMode
  welcomeGreetingResolved: WelcomeGreetingResolved
  welcomeGreetingResolvedAssetId: string | null
  imageRef: BackgroundImageRef
  updatedAt: string
}

export interface ThemeBackgroundPatch {
  backgroundImageEnabled?: boolean
  backgroundBlurPx?: number
  messageGlassEnabled?: boolean
  messageGlassTransparency?: number
  messageGlassLightTransparency?: number
  messageGlassDarkTransparency?: number
  messageGlassBackgroundVisibility?: number
  messageGlassBlurPx?: number
  messageGlassTransparencyCustomized?: boolean
  messageGlassLightTransparencyCustomized?: boolean
  messageGlassDarkTransparencyCustomized?: boolean
  messageGlassBackgroundVisibilityCustomized?: boolean
  messageGlassBlurCustomized?: boolean
  sidebarScrimEnabled?: boolean
  sidebarScrimIntensity?: number
  welcomeGreetingReadabilityMode?: WelcomeGreetingReadabilityMode
  welcomeGreetingResolved?: WelcomeGreetingResolved
  welcomeGreetingResolvedAssetId?: string | null
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
  messageGlassTransparency: MESSAGE_GLASS_LIGHT_TRANSPARENCY_DEFAULT,
  messageGlassLightTransparency: MESSAGE_GLASS_LIGHT_TRANSPARENCY_DEFAULT,
  messageGlassDarkTransparency: MESSAGE_GLASS_DARK_TRANSPARENCY_DEFAULT,
  messageGlassBackgroundVisibility: MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
  messageGlassBlurPx: 20,
  messageGlassTransparencyCustomized: false,
  messageGlassLightTransparencyCustomized: false,
  messageGlassDarkTransparencyCustomized: false,
  messageGlassBackgroundVisibilityCustomized: false,
  messageGlassBlurCustomized: false,
  sidebarScrimEnabled: true,
  sidebarScrimIntensity: 20,
  welcomeGreetingReadabilityMode: 'auto',
  welcomeGreetingResolved: 'default',
  welcomeGreetingResolvedAssetId: null,
  imageRef: { kind: 'none' },
  updatedAt: '',
}

function clampBlur(value: number): number {
  return Math.min(
    BACKGROUND_BLUR_MAX,
    Math.max(BACKGROUND_BLUR_MIN, Math.round(value)),
  )
}

function clampMessageGlassTransparency(value: number): number {
  return Math.min(
    MESSAGE_GLASS_TRANSPARENCY_MAX,
    Math.max(MESSAGE_GLASS_TRANSPARENCY_MIN, Math.round(value)),
  )
}

function clampMessageGlassBlur(value: number): number {
  return Math.min(
    MESSAGE_GLASS_BLUR_MAX,
    Math.max(MESSAGE_GLASS_BLUR_MIN, Math.round(value)),
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

function normalizeWelcomeGreetingMode(value: unknown): WelcomeGreetingReadabilityMode {
  if (
    value === 'default'
    || value === 'auto'
    || value === 'force-light'
  ) {
    return value
  }
  return DEFAULT_THEME_BACKGROUND_SETTINGS.welcomeGreetingReadabilityMode
}

function normalizeWelcomeGreetingResolved(value: unknown): WelcomeGreetingResolved {
  if (value === 'default' || value === 'force-light') {
    return value
  }
  return DEFAULT_THEME_BACKGROUND_SETTINGS.welcomeGreetingResolved
}

function normalizeWelcomeGreetingResolvedAssetId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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

  const glassTransparencyCandidate = Number(source.messageGlassTransparency)
  const messageGlassTransparency = Number.isFinite(glassTransparencyCandidate)
    ? clampMessageGlassTransparency(glassTransparencyCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassTransparency

  const globalTransparencyCustomized =
    source.messageGlassTransparencyCustomized === true

  const lightGlassTransparencyCandidate = Number(
    source.messageGlassLightTransparency,
  )
  const messageGlassLightTransparency = Number.isFinite(
    lightGlassTransparencyCandidate,
  )
    ? clampMessageGlassTransparency(lightGlassTransparencyCandidate)
    : globalTransparencyCustomized
      ? messageGlassTransparency
      : DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassLightTransparency

  const darkGlassTransparencyCandidate = Number(
    source.messageGlassDarkTransparency,
  )
  const messageGlassDarkTransparency = Number.isFinite(
    darkGlassTransparencyCandidate,
  )
    ? clampMessageGlassTransparency(darkGlassTransparencyCandidate)
    : globalTransparencyCustomized
      ? messageGlassTransparency
      : DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassDarkTransparency

  const backgroundVisibilityCandidate = Number(
    source.messageGlassBackgroundVisibility,
  )
  const messageGlassBackgroundVisibility = Number.isFinite(
    backgroundVisibilityCandidate,
  )
    ? clampMessageGlassBackgroundVisibility(backgroundVisibilityCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBackgroundVisibility

  const glassBlurCandidate = Number(source.messageGlassBlurPx)
  const messageGlassBlurPx = Number.isFinite(glassBlurCandidate)
    ? clampMessageGlassBlur(glassBlurCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.messageGlassBlurPx

  const scrimIntensityCandidate = Number(source.sidebarScrimIntensity)
  const sidebarScrimIntensity = Number.isFinite(scrimIntensityCandidate)
    ? clampSidebarScrimIntensity(scrimIntensityCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity

  const imageRef = normalizeImageRef(source.imageRef)
  const enabled = Boolean(source.backgroundImageEnabled)
  const sidebarScrimEnabled = typeof source.sidebarScrimEnabled === 'boolean'
    ? source.sidebarScrimEnabled
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimEnabled
  const welcomeGreetingReadabilityMode = normalizeWelcomeGreetingMode(
    source.welcomeGreetingReadabilityMode,
  )
  let welcomeGreetingResolved = normalizeWelcomeGreetingResolved(
    source.welcomeGreetingResolved,
  )
  let welcomeGreetingResolvedAssetId = normalizeWelcomeGreetingResolvedAssetId(
    source.welcomeGreetingResolvedAssetId,
  )
  const updatedAt = typeof source.updatedAt === 'string' && source.updatedAt
    ? source.updatedAt
    : new Date().toISOString()

  if (!enabled || imageRef.kind !== 'asset') {
    welcomeGreetingResolved = 'default'
    welcomeGreetingResolvedAssetId = null
  }

  return {
    version: THEME_BACKGROUND_VERSION,
    backgroundImageEnabled: enabled,
    backgroundBlurPx: blur,
    messageGlassEnabled: Boolean(source.messageGlassEnabled),
    messageGlassTransparency,
    messageGlassLightTransparency,
    messageGlassDarkTransparency,
    messageGlassBackgroundVisibility,
    messageGlassBlurPx,
    messageGlassTransparencyCustomized:
      globalTransparencyCustomized,
    messageGlassLightTransparencyCustomized:
      source.messageGlassLightTransparencyCustomized === true
      || (
        source.messageGlassLightTransparencyCustomized === undefined
        && globalTransparencyCustomized
      ),
    messageGlassDarkTransparencyCustomized:
      source.messageGlassDarkTransparencyCustomized === true
      || (
        source.messageGlassDarkTransparencyCustomized === undefined
        && globalTransparencyCustomized
      ),
    messageGlassBackgroundVisibilityCustomized:
      source.messageGlassBackgroundVisibilityCustomized === true,
    messageGlassBlurCustomized: source.messageGlassBlurCustomized === true,
    sidebarScrimEnabled,
    sidebarScrimIntensity,
    welcomeGreetingReadabilityMode,
    welcomeGreetingResolved,
    welcomeGreetingResolvedAssetId,
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
