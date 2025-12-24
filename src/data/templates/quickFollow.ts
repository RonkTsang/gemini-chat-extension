import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'

export interface QuickFollowTemplate {
  name: string
  template: string
  iconKey: QuickFollowIconKey
}

export const QUICK_FOLLOW_STARTER_TEMPLATES: QuickFollowTemplate[] = [
  {
    name: 'Tell me more',
    template: `Explain ${QUICK_FOLLOW_PLACEHOLDER} in detail`,
    iconKey: 'chat'
  },
  {
    name: 'Search',
    template: `Search web for latest info on: ${QUICK_FOLLOW_PLACEHOLDER}`,
    iconKey: 'search'
  },
  {
    name: 'ELI5 🍼',
    template: `Explain ${QUICK_FOLLOW_PLACEHOLDER} like I'm 5 years old`,
    iconKey: 'bulb'
  }
]

