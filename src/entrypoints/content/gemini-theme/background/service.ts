import { db } from '@/data/db'
import {
  applyThemeBackgroundStyle,
  clearThemeBackgroundStyle,
} from './styleController'
import {
  applyWelcomeGreetingReadabilityFromState,
  clearWelcomeGreetingReadabilityStyle,
  resolveWelcomeGreetingReadabilitySettings,
  __resetWelcomeGreetingReadabilityServiceForTests,
} from './welcome-greeting'
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
  themeBackgroundSettingsStorage,
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
let panelPreviewAssetId: string | null = null
let panelPreviewUrl: string | null = null

interface PersistAndApplyOptions {
  readabilityAsset?: ThemeAssetRow | null
  forceRecomputeWelcomeGreeting?: boolean
}

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

function resetPanelPreviewUrl(nextAssetId: string | null, nextUrl: string | null): void {
  if (panelPreviewUrl && panelPreviewUrl !== nextUrl) {
    revokeObjectUrl(panelPreviewUrl)
  }
  panelPreviewAssetId = nextAssetId
  panelPreviewUrl = nextUrl
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
    welcomeGreetingResolved: 'default',
    welcomeGreetingResolvedAssetId: null,
    updatedAt: nowIso(),
  }
}

async function resolveReadabilityAsset(
  settings: ThemeBackgroundSettings,
  preferredAsset?: ThemeAssetRow | null,
): Promise<ThemeAssetRow | null> {
  if (
    !settings.backgroundImageEnabled
    || settings.imageRef.kind !== 'asset'
  ) {
    return null
  }

  if (preferredAsset && preferredAsset.id === settings.imageRef.assetId) {
    return preferredAsset
  }
  return (await getThemeAssetById(settings.imageRef.assetId)) ?? null
}

function settingsChanged(
  before: ThemeBackgroundSettings,
  after: ThemeBackgroundSettings,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

async function persistAndApplySettings(
  settings: ThemeBackgroundSettings,
  options: PersistAndApplyOptions = {},
): Promise<ThemeBackgroundResolvedState> {
  const normalized = normalizeThemeBackgroundSettings(settings)
  const repaired = await repairSettingsIfNeeded(normalized)
  const readabilityAsset = await resolveReadabilityAsset(
    repaired,
    options.readabilityAsset,
  )
  const withReadability = await resolveWelcomeGreetingReadabilitySettings({
    settings: repaired,
    asset: readabilityAsset,
    forceRecompute: options.forceRecomputeWelcomeGreeting,
  })
  const stored = await setStoredThemeBackgroundSettings(withReadability)
  const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(stored)
  const state = buildThemeBackgroundResolvedState(stored, resolvedBackgroundUrl)
  applyThemeBackgroundStyle(state)
  applyWelcomeGreetingReadabilityFromState(state)
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
    const readabilityAsset = await resolveReadabilityAsset(settings)
    const withReadability = await resolveWelcomeGreetingReadabilitySettings({
      settings,
      asset: readabilityAsset,
    })
    if (settingsChanged(settings, withReadability)) {
      await setStoredThemeBackgroundSettings(withReadability)
    }
    const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(withReadability)
    const state = buildThemeBackgroundResolvedState(
      withReadability,
      resolvedBackgroundUrl,
    )
    applyThemeBackgroundStyle(state)
    applyWelcomeGreetingReadabilityFromState(state)
  } catch (error) {
    console.warn('[ThemeBackground] Failed to initialize background settings:', error)
    clearThemeBackgroundStyle()
    clearWelcomeGreetingReadabilityStyle()
  }

  themeBackgroundSettingsStorage.watch(async (newSettings) => {
    if (!newSettings) {
      clearThemeBackgroundStyle()
      clearWelcomeGreetingReadabilityStyle()
      return
    }
    try {
      const normalizedSettings = normalizeThemeBackgroundSettings(newSettings)
      const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(normalizedSettings)
      const state = buildThemeBackgroundResolvedState(normalizedSettings, resolvedBackgroundUrl)
      applyThemeBackgroundStyle(state)
      applyWelcomeGreetingReadabilityFromState(state)
    } catch (error) {
      console.warn('[ThemeBackground] Failed to sync background settings:', error)
    }
  })
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

    state = await persistAndApplySettings(next, {
      readabilityAsset: assetRow,
      forceRecomputeWelcomeGreeting: true,
    })
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

export async function resolveThemeBackgroundPreviewUrlForPanel(
  settings: ThemeBackgroundSettings,
): Promise<string | null> {
  const normalized = normalizeThemeBackgroundSettings(settings)
  if (!import.meta.env.FIREFOX) {
    return await resolveBackgroundUrlFromSettings(normalized)
  }

  if (normalized.imageRef.kind !== 'asset') {
    resetPanelPreviewUrl(null, null)
    return null
  }

  if (panelPreviewAssetId === normalized.imageRef.assetId && panelPreviewUrl) {
    return panelPreviewUrl
  }

  const asset = await getThemeAssetById(normalized.imageRef.assetId)
  if (!asset) {
    resetPanelPreviewUrl(null, null)
    return null
  }

  const buffer = await asset.blob.arrayBuffer()
  const clonedBlob = new Blob([buffer], {
    type: asset.blob.type || 'application/octet-stream',
  })
  const objectUrl = URL.createObjectURL(clonedBlob)
  resetPanelPreviewUrl(normalized.imageRef.assetId, objectUrl)
  return objectUrl
}

export function __resetThemeBackgroundServiceForTests(): void {
  resetActiveObjectUrl(null, null)
  resetPanelPreviewUrl(null, null)
  clearThemeBackgroundStyle()
  __resetWelcomeGreetingReadabilityServiceForTests()
}
