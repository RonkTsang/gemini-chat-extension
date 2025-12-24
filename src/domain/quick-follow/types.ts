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

export interface QuickFollowSettings {
  orderedIds: string[]
  enabled: boolean
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

export type QuickFollowSettingsUpdateInput = Partial<QuickFollowSettings>

