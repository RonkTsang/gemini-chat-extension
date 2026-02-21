import { db } from '@/data/db'
import {
  applyThemeBackgroundStyle,
  clearThemeBackgroundStyle,
} from './styleController'
import {
  BACKGROUND_FILE_SIZE_LIMIT,
  buildThemeBackgroundResolvedState,
  isAllowedBackgroundImageMimeType,
  normalizeThemeBackgroundSettings,
  type ThemeAssetRow,
  type ThemeBackgroundPatch,
  type ThemeBackgroundResolvedState,
  type ThemeBackgroundMimeType,
  type ThemeBackgroundSettings,
} from './types'
import {
  getStoredThemeBackgroundSettings,
  setStoredThemeBackgroundSettings,
} from './storage'

type ThemeBackgroundErrorCode =
  | 'invalid-file-type'
  | 'file-too-large'
  | 'image-load-failed'

export class ThemeBackgroundError extends Error {
  code: ThemeBackgroundErrorCode

  constructor(code: ThemeBackgroundErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function createAssetId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `theme-bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function revokeObjectUrl(url: string | null): void {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('[ThemeBackground] Failed to revoke object URL:', error)
  }
}

let activeAssetId: string | null = null
let activeObjectUrl: string | null = null

async function getThemeAssetById(assetId: string): Promise<ThemeAssetRow | undefined> {
  return await db.theme_assets.get(assetId)
}

async function deleteThemeAssetById(assetId: string): Promise<void> {
  await db.theme_assets.delete(assetId)
}

async function getImageDimensions(file: File): Promise<{
  width?: number
  height?: number
}> {
  if (typeof Image === 'undefined') {
    return {}
  }

  const imageUrl = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
        image.onerror = () => reject(
          new ThemeBackgroundError(
            'image-load-failed',
            'Image loading failed during validation',
          ),
        )
        image.src = imageUrl
      },
    )
    return dimensions
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export function validateThemeBackgroundFile(
  file: File,
): asserts file is File & { type: ThemeBackgroundMimeType } {
  if (!isAllowedBackgroundImageMimeType(file.type)) {
    throw new ThemeBackgroundError(
      'invalid-file-type',
      `Unsupported file type: ${file.type}`,
    )
  }
  if (file.size > BACKGROUND_FILE_SIZE_LIMIT) {
    throw new ThemeBackgroundError(
      'file-too-large',
      `File size exceeds ${BACKGROUND_FILE_SIZE_LIMIT} bytes`,
    )
  }
}

function resetActiveObjectUrl(nextAssetId: string | null, nextUrl: string | null): void {
  if (activeObjectUrl && activeObjectUrl !== nextUrl) {
    revokeObjectUrl(activeObjectUrl)
  }
  activeAssetId = nextAssetId
  activeObjectUrl = nextUrl
}

async function resolveBackgroundUrlFromSettings(
  settings: ThemeBackgroundSettings,
): Promise<string | null> {
  if (settings.imageRef.kind !== 'asset') {
    resetActiveObjectUrl(null, null)
    return null
  }

  if (activeAssetId === settings.imageRef.assetId && activeObjectUrl) {
    return activeObjectUrl
  }

  const asset = await getThemeAssetById(settings.imageRef.assetId)
  if (!asset) {
    resetActiveObjectUrl(null, null)
    return null
  }

  const objectUrl = URL.createObjectURL(asset.blob)
  resetActiveObjectUrl(settings.imageRef.assetId, objectUrl)
  return objectUrl
}

async function repairSettingsIfNeeded(
  settings: ThemeBackgroundSettings,
): Promise<ThemeBackgroundSettings> {
  if (settings.imageRef.kind !== 'asset') {
    return settings
  }

  const asset = await getThemeAssetById(settings.imageRef.assetId)
  if (asset) return settings

  console.warn(
    '[ThemeBackground] Missing asset referenced in settings:',
    settings.imageRef.assetId,
  )
  return {
    ...settings,
    imageRef: { kind: 'none' },
    backgroundImageEnabled: false,
    updatedAt: nowIso(),
  }
}

async function persistAndApplySettings(
  settings: ThemeBackgroundSettings,
): Promise<ThemeBackgroundResolvedState> {
  const normalized = normalizeThemeBackgroundSettings(settings)
  const repaired = await repairSettingsIfNeeded(normalized)
  const stored = await setStoredThemeBackgroundSettings(repaired)
  const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(stored)
  const state = buildThemeBackgroundResolvedState(stored, resolvedBackgroundUrl)
  applyThemeBackgroundStyle(state)
  return state
}

export async function getThemeBackgroundSettings(): Promise<ThemeBackgroundSettings> {
  const settings = await getStoredThemeBackgroundSettings()
  const repaired = await repairSettingsIfNeeded(settings)
  if (JSON.stringify(settings) !== JSON.stringify(repaired)) {
    await setStoredThemeBackgroundSettings(repaired)
  }
  return repaired
}

export async function initThemeBackground(): Promise<void> {
  try {
    const settings = await getThemeBackgroundSettings()
    const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(settings)
    const state = buildThemeBackgroundResolvedState(settings, resolvedBackgroundUrl)
    applyThemeBackgroundStyle(state)
  } catch (error) {
    console.warn('[ThemeBackground] Failed to initialize background settings:', error)
    clearThemeBackgroundStyle()
  }
}

export async function updateThemeBackgroundSettings(
  patch: ThemeBackgroundPatch,
): Promise<ThemeBackgroundResolvedState> {
  const current = await getThemeBackgroundSettings()
  const next: ThemeBackgroundSettings = normalizeThemeBackgroundSettings({
    ...current,
    ...patch,
    imageRef: patch.imageRef ?? current.imageRef,
    updatedAt: nowIso(),
  })

  if (patch.imageRef?.kind === 'none' && patch.backgroundImageEnabled === undefined) {
    next.backgroundImageEnabled = false
  }

  return await persistAndApplySettings(next)
}

export async function uploadThemeBackground(
  file: File,
): Promise<ThemeBackgroundResolvedState> {
  validateThemeBackgroundFile(file)
  const dimensions = await getImageDimensions(file)
  const id = createAssetId()
  const timestamp = nowIso()

  const assetRow: ThemeAssetRow = {
    id,
    feature: 'background-image',
    mimeType: file.type,
    size: file.size,
    blob: file,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.theme_assets.put(assetRow)

  let oldAssetId: string | null = null
  let state: ThemeBackgroundResolvedState

  try {
    const current = await getThemeBackgroundSettings()
    oldAssetId = current.imageRef.kind === 'asset'
      ? current.imageRef.assetId
      : null

    const next: ThemeBackgroundSettings = normalizeThemeBackgroundSettings({
      ...current,
      imageRef: { kind: 'asset', assetId: id },
      backgroundImageEnabled: true,
      updatedAt: nowIso(),
    })

    state = await persistAndApplySettings(next)
  } catch (error) {
    await deleteThemeAssetById(id).catch(() => undefined)
    throw error
  }

  if (oldAssetId && oldAssetId !== id) {
    await deleteThemeAssetById(oldAssetId).catch((error) => {
      console.warn('[ThemeBackground] Failed to delete old asset:', error)
    })
  }

  return state
}

export async function removeThemeBackground(): Promise<ThemeBackgroundResolvedState> {
  const current = await getThemeBackgroundSettings()
  const oldAssetId = current.imageRef.kind === 'asset'
    ? current.imageRef.assetId
    : null

  const next: ThemeBackgroundSettings = normalizeThemeBackgroundSettings({
    ...current,
    imageRef: { kind: 'none' },
    backgroundImageEnabled: false,
    updatedAt: nowIso(),
  })

  const state = await persistAndApplySettings(next)

  if (oldAssetId) {
    await deleteThemeAssetById(oldAssetId).catch((error) => {
      console.warn('[ThemeBackground] Failed to delete old asset:', error)
    })
  }

  return state
}

export async function resolveThemeBackgroundPreviewUrl(
  settings: ThemeBackgroundSettings,
): Promise<string | null> {
  const normalized = normalizeThemeBackgroundSettings(settings)
  return await resolveBackgroundUrlFromSettings(normalized)
}

export function __resetThemeBackgroundServiceForTests(): void {
  resetActiveObjectUrl(null, null)
  clearThemeBackgroundStyle()
}
