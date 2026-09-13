export const FOLDER_ICON_KEYS = [
  'folder',
  'finance',
  'book',
  'education',
  'writing',
  'design',
  'code',
  'terminal',
  'music',
  'entertainment',
  'exploration',
  'art',
  'health',
  'wellbeing',
  'nature',
  'work',
  'analytics',
  'achievement',
  'fitness',
  'notes',
  'legal',
  'world',
  'travel',
  'global',
  'tools',
  'pets',
  'science',
  'ideas',
  'favorites',
  'gardening',
] as const

export type FolderIconKey = (typeof FOLDER_ICON_KEYS)[number]

export const FOLDER_PRESET_COLOR_KEYS = [
  'neutral',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const

export type FolderPresetColorKey = (typeof FOLDER_PRESET_COLOR_KEYS)[number]
export type FolderCustomColor = `#${string}`
export type FolderColorValue = FolderPresetColorKey | FolderCustomColor

export const DEFAULT_FOLDER_ICON_KEY: FolderIconKey = 'folder'
export const DEFAULT_FOLDER_COLOR_VALUE: FolderPresetColorKey = 'neutral'

const FOLDER_ICON_KEY_SET = new Set<string>(FOLDER_ICON_KEYS)
const FOLDER_PRESET_COLOR_KEY_SET = new Set<string>(FOLDER_PRESET_COLOR_KEYS)
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu

export function isFolderIconKey(value: string): value is FolderIconKey {
  return FOLDER_ICON_KEY_SET.has(value)
}

export function isFolderPresetColorKey(value: string): value is FolderPresetColorKey {
  return FOLDER_PRESET_COLOR_KEY_SET.has(value)
}

export function isFolderCustomColor(value: string): value is FolderCustomColor {
  return HEX_COLOR_PATTERN.test(value)
}

export function normalizeFolderColorValue(value: string): FolderColorValue | undefined {
  if (isFolderPresetColorKey(value)) return value
  if (isFolderCustomColor(value)) return value.toLowerCase() as FolderCustomColor
  return undefined
}
