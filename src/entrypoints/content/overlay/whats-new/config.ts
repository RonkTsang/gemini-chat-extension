/**
 * What's New feature configuration
 * Defines the release notes for the current version
 */

import themeImagePath from '@/assets/whatsnew/theme.webp'
import type { NavigationSection } from '@/components/setting-panel/config'

export interface SettingPanelPromoAction {
  action: 'setting-panel'
  params: {
    tab: NavigationSection
  }
}

export type ReleaseNotePromoAction = SettingPanelPromoAction

export interface ReleaseNote {
  titleKey: string // i18n key for feature title
  descriptionKey: string // i18n key for feature description
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
    titleKey: 'whatsnew.feature1.title',
    descriptionKey: 'whatsnew.feature1.description',
    promoImagePath: themeImagePath,
    promoAction: {
      action: 'setting-panel',
      params: {
        tab: 'theme'
      }
    }
  }
]
