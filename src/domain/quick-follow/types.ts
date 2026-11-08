export const QUICK_FOLLOW_PLACEHOLDER = '{{SELECT_TEXT}}' as const
export const DEFAULT_QUICK_FOLLOW_TEMPLATE_FALLBACK =
  `e.g. Explain ${QUICK_FOLLOW_PLACEHOLDER} in simple terms` as const
export const DEFAULT_QUICK_FOLLOW_TEMPLATE_KEY =
  'settings.quickFollow.customPrompts.defaultTemplate' as const

import type { QuickFollowIconKey } from './iconKeys'

export interface QuickFollowPrompt {
  id: string
  name?: string
  template: string
  iconKey: QuickFollowIconKey
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export const SELECTION_DISPLAY_MODES = ['auto', 'cards', 'compact'] as const
export type SelectionDisplayMode = (typeof SELECTION_DISPLAY_MODES)[number]
export const DEFAULT_SELECTION_DISPLAY_MODE: SelectionDisplayMode = 'auto'
export const QUICK_FOLLOW_SELECTION_DISPLAY_MODE_KEY = 'quickFollowSelectionDisplayMode'

export interface QuickFollowSettings {
  orderedIds: string[]
  enabled: boolean
  selectionDisplayMode: SelectionDisplayMode
}

export type QuickFollowPromptCreateInput = {
  name?: string
  template: string
  iconKey: QuickFollowIconKey
  enabled?: boolean
}

export type QuickFollowPromptUpdateInput = Partial<
  Omit<QuickFollowPrompt, 'id' | 'createdAt' | 'updatedAt'>
>

