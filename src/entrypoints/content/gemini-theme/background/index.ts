export {
  ThemeBackgroundError,
  getThemeBackgroundSettings,
  initThemeBackground,
  removeThemeBackground,
  resolveThemeBackgroundPreviewUrl,
  updateThemeBackgroundSettings,
  uploadThemeBackground,
  validateThemeBackgroundFile,
} from './service'

export { themeBackgroundSettingsStorage } from './storage'

export type {
  BackgroundImageRef,
  ThemeAssetRow,
  ThemeBackgroundPatch,
  ThemeBackgroundResolvedState,
  ThemeBackgroundSettings,
} from './types'

export {
  ALLOWED_BACKGROUND_IMAGE_MIME_TYPES,
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_FILE_SIZE_LIMIT,
  DEFAULT_THEME_BACKGROUND_SETTINGS,
  normalizeThemeBackgroundSettings,
  SIDEBAR_SCRIM_INTENSITY_MAX,
  SIDEBAR_SCRIM_INTENSITY_MIN,
  THEME_BACKGROUND_VERSION,
} from './types'
