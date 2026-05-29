/**
 * What's New feature configuration
 * Defines the release notes for the current version
 */

import glassEffectControlsImagePath from '@/assets/whatsnew/glass-effect-controls.webp'
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

export type ReleaseNotePromoAction =
  | SettingPanelPromoAction
  | ThemeFloatingPanelPromoAction

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
    titleKey: 'whatsnew.glassEffect.title',
    descriptionKey: 'whatsnew.glassEffect.description',
    actionLabelKey: 'whatsnew.glassEffect.action',
    promoImagePath: glassEffectControlsImagePath,
    promoAction: {
      action: 'theme-floating-panel'
    }
  }
]
