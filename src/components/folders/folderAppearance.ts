import {
  LuBadgeCheck,
  LuBook,
  LuBrain,
  LuBraces,
  LuBriefcase,
  LuChartColumn,
  LuCircleDollarSign,
  LuDumbbell,
  LuFlaskConical,
  LuFolder,
  LuGlobe,
  LuGraduationCap,
  LuHeart,
  LuMedal,
  LuMusic,
  LuNotebookTabs,
  LuOrbit,
  LuPalette,
  LuPawPrint,
  LuPenTool,
  LuPencil,
  LuPlane,
  LuPopcorn,
  LuSatellite,
  LuScale,
  LuSquareTerminal,
  LuStethoscope,
  LuWrench,
} from 'react-icons/lu'
import { PiFlowerLotus, PiPottedPlant } from 'react-icons/pi'
import type { IconType } from 'react-icons'

import {
  DEFAULT_FOLDER_COLOR_VALUE,
  DEFAULT_FOLDER_ICON_KEY,
  FOLDER_ICON_KEYS,
  type FolderColorValue,
  type FolderIconKey,
  type FolderPresetColorKey,
  isFolderCustomColor,
  isFolderIconKey,
} from '@/domain/folder/appearance'

export interface FolderIconDefinition {
  key: FolderIconKey
  labelKey: string
  fallbackLabel: string
  Icon: IconType
}

const FOLDER_ICON_MAP: Record<FolderIconKey, Omit<FolderIconDefinition, 'key'>> = {
  folder: { labelKey: 'folders_icon_folder', fallbackLabel: 'Folder', Icon: LuFolder },
  finance: { labelKey: 'folders_icon_finance', fallbackLabel: 'Finance', Icon: LuCircleDollarSign },
  book: { labelKey: 'folders_icon_book', fallbackLabel: 'Book', Icon: LuBook },
  education: { labelKey: 'folders_icon_education', fallbackLabel: 'Education', Icon: LuGraduationCap },
  writing: { labelKey: 'folders_icon_writing', fallbackLabel: 'Writing', Icon: LuPencil },
  design: { labelKey: 'folders_icon_design', fallbackLabel: 'Design', Icon: LuPenTool },
  code: { labelKey: 'folders_icon_code', fallbackLabel: 'Code', Icon: LuBraces },
  terminal: { labelKey: 'folders_icon_terminal', fallbackLabel: 'Terminal', Icon: LuSquareTerminal },
  music: { labelKey: 'folders_icon_music', fallbackLabel: 'Music', Icon: LuMusic },
  entertainment: { labelKey: 'folders_icon_entertainment', fallbackLabel: 'Entertainment', Icon: LuPopcorn },
  exploration: { labelKey: 'folders_icon_exploration', fallbackLabel: 'Exploration', Icon: LuSatellite },
  art: { labelKey: 'folders_icon_art', fallbackLabel: 'Art', Icon: LuPalette },
  health: { labelKey: 'folders_icon_health', fallbackLabel: 'Health', Icon: LuStethoscope },
  wellbeing: { labelKey: 'folders_icon_wellbeing', fallbackLabel: 'Wellbeing', Icon: LuBadgeCheck },
  nature: { labelKey: 'folders_icon_nature', fallbackLabel: 'Nature', Icon: PiFlowerLotus },
  work: { labelKey: 'folders_icon_work', fallbackLabel: 'Work', Icon: LuBriefcase },
  analytics: { labelKey: 'folders_icon_analytics', fallbackLabel: 'Analytics', Icon: LuChartColumn },
  achievement: { labelKey: 'folders_icon_achievement', fallbackLabel: 'Achievement', Icon: LuMedal },
  fitness: { labelKey: 'folders_icon_fitness', fallbackLabel: 'Fitness', Icon: LuDumbbell },
  notes: { labelKey: 'folders_icon_notes', fallbackLabel: 'Notes', Icon: LuNotebookTabs },
  legal: { labelKey: 'folders_icon_legal', fallbackLabel: 'Legal', Icon: LuScale },
  world: { labelKey: 'folders_icon_world', fallbackLabel: 'World', Icon: LuOrbit },
  travel: { labelKey: 'folders_icon_travel', fallbackLabel: 'Travel', Icon: LuPlane },
  global: { labelKey: 'folders_icon_global', fallbackLabel: 'Global', Icon: LuGlobe },
  tools: { labelKey: 'folders_icon_tools', fallbackLabel: 'Tools', Icon: LuWrench },
  pets: { labelKey: 'folders_icon_pets', fallbackLabel: 'Pets', Icon: LuPawPrint },
  science: { labelKey: 'folders_icon_science', fallbackLabel: 'Science', Icon: LuFlaskConical },
  ideas: { labelKey: 'folders_icon_ideas', fallbackLabel: 'Ideas', Icon: LuBrain },
  favorites: { labelKey: 'folders_icon_favorites', fallbackLabel: 'Favorites', Icon: LuHeart },
  gardening: { labelKey: 'folders_icon_gardening', fallbackLabel: 'Gardening', Icon: PiPottedPlant },
}

export const FOLDER_ICON_CATALOG: FolderIconDefinition[] = FOLDER_ICON_KEYS.map((key) => ({
  key,
  ...FOLDER_ICON_MAP[key],
}))

export interface FolderPresetColorDefinition {
  key: FolderPresetColorKey
  hex: string
  cssColor: string
  labelKey: string
  fallbackLabel: string
}

export const FOLDER_PRESET_COLORS: FolderPresetColorDefinition[] = [
  {
    key: 'neutral',
    hex: '#000',
    cssColor: 'var(--lumi-sys-color--on-surface, var(--chakra-colors-fg, #1f1f1f))',
    labelKey: 'folders_color_neutral',
    fallbackLabel: 'Default color',
  },
  { key: 'red', hex: '#FA433F', cssColor: '#FA433F', labelKey: 'folders_color_red', fallbackLabel: 'Red' },
  { key: 'orange', hex: '#EE7C38', cssColor: '#EE7C38', labelKey: 'folders_color_orange', fallbackLabel: 'Orange' },
  { key: 'yellow', hex: '#F6C643', cssColor: '#F6C643', labelKey: 'folders_color_yellow', fallbackLabel: 'Yellow' },
  { key: 'green', hex: '#53B559', cssColor: '#53B559', labelKey: 'folders_color_green', fallbackLabel: 'Green' },
  { key: 'blue', hex: '#3A83F7', cssColor: '#3A83F7', labelKey: 'folders_color_blue', fallbackLabel: 'Blue' },
  { key: 'purple', hex: '#8952EE', cssColor: '#8952EE', labelKey: 'folders_color_purple', fallbackLabel: 'Purple' },
  { key: 'pink', hex: '#F177AF', cssColor: '#F177AF', labelKey: 'folders_color_pink', fallbackLabel: 'Pink' },
]

const FOLDER_PRESET_COLOR_MAP = new Map(FOLDER_PRESET_COLORS.map((color) => [color.key, color]))

export function getFolderIcon(iconKey: string): IconType {
  return isFolderIconKey(iconKey) ? FOLDER_ICON_MAP[iconKey].Icon : FOLDER_ICON_MAP[DEFAULT_FOLDER_ICON_KEY].Icon
}

export function getFolderColor(colorValue: string): string {
  if (isFolderCustomColor(colorValue)) return colorValue
  return FOLDER_PRESET_COLOR_MAP.get(colorValue as FolderPresetColorKey)?.cssColor
    ?? FOLDER_PRESET_COLOR_MAP.get(DEFAULT_FOLDER_COLOR_VALUE)!.cssColor
}

export function getFolderColorPickerHex(colorValue: FolderColorValue): string {
  if (isFolderCustomColor(colorValue)) return colorValue
  return FOLDER_PRESET_COLOR_MAP.get(colorValue)?.hex
    ?? FOLDER_PRESET_COLOR_MAP.get(DEFAULT_FOLDER_COLOR_VALUE)!.hex
}
