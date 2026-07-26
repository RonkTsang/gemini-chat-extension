/**
 * What's New feature configuration
 * Defines the release notes for the current version
 */

import type { NavigationSection } from '@/components/setting-panel/config'

export interface SettingPanelPromoAction {
  action: 'setting-panel'
  params: {
    tab: NavigationSection
  }
}

export interface ThemeFloatingPanelPromoAction {
  action: 'theme-floating-panel'
}

export interface ChatSettingsPanelPromoAction {
  action: 'chat-settings-panel'
}

export type ReleaseNotePromoAction =
  | SettingPanelPromoAction
  | ThemeFloatingPanelPromoAction
  | ChatSettingsPanelPromoAction

export interface ReleaseNote {
  titleKey: string // i18n key for feature title
  descriptionKey: string // i18n key for feature description
  actionLabelKey?: string // optional i18n key for feature CTA
  promoImagePath?: string // optional promo image path
  promoAction?: ReleaseNotePromoAction // optional action when promo image is clicked
}

/**
 * Current release notes (version is auto-detected from manifest)
 * Update this array when releasing a new version with features to announce
 * Maximum 2 features recommended for optimal display
 */
export const CURRENT_RELEASE_NOTES: ReleaseNote[] = [
  {
    titleKey: 'whatsnew.chatLayout.title',
    descriptionKey: 'whatsnew.chatLayout.description',
    actionLabelKey: 'whatsnew.chatLayout.action',
    promoAction: {
      action: 'chat-settings-panel'
    }
  }
]
