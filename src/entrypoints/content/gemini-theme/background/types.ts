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

export const THEME_BACKGROUND_VERSION = 6 as const

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
export const INPUT_AREA_TRANSPARENCY_MIN = 0
export const INPUT_AREA_TRANSPARENCY_DEFAULT = 40
export const INPUT_AREA_TRANSPARENCY_MAX = 100
export const SIDEBAR_SCRIM_INTENSITY_MIN = 0
export const SIDEBAR_SCRIM_INTENSITY_MAX = 100
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

export const BACKGROUND_IMAGE_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const

export const BACKGROUND_IMAGE_POSITION_CSS_VALUES = {
  'top-left': 'left top',
  top: 'center top',
  'top-right': 'right top',
  left: 'left center',
  center: 'center center',
  right: 'right center',
  'bottom-left': 'left bottom',
  bottom: 'center bottom',
  'bottom-right': 'right bottom',
} as const

export const ALLOWED_BACKGROUND_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type ThemeBackgroundMimeType =
  (typeof ALLOWED_BACKGROUND_IMAGE_MIME_TYPES)[number]

export type BackgroundImagePosition =
  (typeof BACKGROUND_IMAGE_POSITIONS)[number]

export type BackgroundImageRef =
  | { kind: 'none' }
  | { kind: 'asset'; assetId: string }

export interface ThemeBackgroundSettings {
  version: typeof THEME_BACKGROUND_VERSION
  backgroundImageEnabled: boolean
  backgroundBlurPx: number
  backgroundImagePosition: BackgroundImagePosition
  messageGlassEnabled: boolean
  messageGlassTransparency: number
  messageGlassLightTransparency: number
  messageGlassDarkTransparency: number
  messageGlassBackgroundVisibility: number
  messageGlassBlurPx: number
  inputAreaTransparency: number
  messageGlassTransparencyCustomized: boolean
  messageGlassLightTransparencyCustomized: boolean
  messageGlassDarkTransparencyCustomized: boolean
  messageGlassBackgroundVisibilityCustomized: boolean
  messageGlassBlurCustomized: boolean
  sidebarScrimEnabled: boolean
  sidebarScrimIntensity: number
  hideUpgradeReminder: boolean
  chatTextLightColor: string | null
  chatTextDarkColor: string | null
  welcomeGreetingReadabilityMode: WelcomeGreetingReadabilityMode
  welcomeGreetingResolved: WelcomeGreetingResolved
  welcomeGreetingResolvedAssetId: string | null
  imageRef: BackgroundImageRef
  updatedAt: string
}

export interface ThemeBackgroundPatch {
  backgroundImageEnabled?: boolean
  backgroundBlurPx?: number
  backgroundImagePosition?: BackgroundImagePosition
  messageGlassEnabled?: boolean
  messageGlassTransparency?: number
  messageGlassLightTransparency?: number
  messageGlassDarkTransparency?: number
  messageGlassBackgroundVisibility?: number
  messageGlassBlurPx?: number
  inputAreaTransparency?: number
  messageGlassTransparencyCustomized?: boolean
  messageGlassLightTransparencyCustomized?: boolean
  messageGlassDarkTransparencyCustomized?: boolean
  messageGlassBackgroundVisibilityCustomized?: boolean
  messageGlassBlurCustomized?: boolean
  sidebarScrimEnabled?: boolean
  sidebarScrimIntensity?: number
  hideUpgradeReminder?: boolean
  chatTextLightColor?: string | null
  chatTextDarkColor?: string | null
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
  backgroundImagePosition: 'center',
  messageGlassEnabled: false,
  messageGlassTransparency: MESSAGE_GLASS_LIGHT_TRANSPARENCY_DEFAULT,
  messageGlassLightTransparency: MESSAGE_GLASS_LIGHT_TRANSPARENCY_DEFAULT,
  messageGlassDarkTransparency: MESSAGE_GLASS_DARK_TRANSPARENCY_DEFAULT,
  messageGlassBackgroundVisibility: MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT,
  messageGlassBlurPx: 20,
  inputAreaTransparency: INPUT_AREA_TRANSPARENCY_DEFAULT,
  messageGlassTransparencyCustomized: false,
  messageGlassLightTransparencyCustomized: false,
  messageGlassDarkTransparencyCustomized: false,
  messageGlassBackgroundVisibilityCustomized: false,
  messageGlassBlurCustomized: false,
  sidebarScrimEnabled: true,
  sidebarScrimIntensity: 20,
  hideUpgradeReminder: true,
  chatTextLightColor: null,
  chatTextDarkColor: null,
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

function normalizeBackgroundImagePosition(
  value: unknown,
): BackgroundImagePosition {
  if (
    typeof value === 'string'
    && (BACKGROUND_IMAGE_POSITIONS as readonly string[]).includes(value)
  ) {
    return value as BackgroundImagePosition
  }
  return DEFAULT_THEME_BACKGROUND_SETTINGS.backgroundImagePosition
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

function clampInputAreaTransparency(value: number): number {
  return Math.min(
    INPUT_AREA_TRANSPARENCY_MAX,
    Math.max(INPUT_AREA_TRANSPARENCY_MIN, Math.round(value)),
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

function normalizeChatTextColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null
}

export function isAllowedBackgroundImageMimeType(
  mimeType: string,
): mimeType is ThemeBackgroundMimeType {
  return (ALLOWED_BACKGROUND_IMAGE_MIME_TYPES as readonly string[]).includes(
    mimeType,
  )
}

export function getBackgroundImagePositionCssValue(
  position: BackgroundImagePosition,
): string {
  return BACKGROUND_IMAGE_POSITION_CSS_VALUES[position]
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

  const inputAreaTransparencyCandidate = Number(source.inputAreaTransparency)
  const inputAreaTransparency = Number.isFinite(inputAreaTransparencyCandidate)
    ? clampInputAreaTransparency(inputAreaTransparencyCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.inputAreaTransparency

  const scrimIntensityCandidate = Number(source.sidebarScrimIntensity)
  const sidebarScrimIntensity = Number.isFinite(scrimIntensityCandidate)
    ? clampSidebarScrimIntensity(scrimIntensityCandidate)
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimIntensity

  const imageRef = normalizeImageRef(source.imageRef)
  const enabled = Boolean(source.backgroundImageEnabled)
  const sidebarScrimEnabled = typeof source.sidebarScrimEnabled === 'boolean'
    ? source.sidebarScrimEnabled
    : DEFAULT_THEME_BACKGROUND_SETTINGS.sidebarScrimEnabled
  const hideUpgradeReminder = typeof source.hideUpgradeReminder === 'boolean'
    ? source.hideUpgradeReminder
    : DEFAULT_THEME_BACKGROUND_SETTINGS.hideUpgradeReminder
  const chatTextLightColor = normalizeChatTextColor(source.chatTextLightColor)
  const chatTextDarkColor = normalizeChatTextColor(source.chatTextDarkColor)
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
    backgroundImagePosition: normalizeBackgroundImagePosition(
      source.backgroundImagePosition,
    ),
    messageGlassEnabled: Boolean(source.messageGlassEnabled),
    messageGlassTransparency,
    messageGlassLightTransparency,
    messageGlassDarkTransparency,
    messageGlassBackgroundVisibility,
    messageGlassBlurPx,
    inputAreaTransparency,
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
    hideUpgradeReminder,
    chatTextLightColor,
    chatTextDarkColor,
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
