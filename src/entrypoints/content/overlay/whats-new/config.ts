/**
 * What's New feature configuration
 * Defines the release notes available to users across versions
 */

import { EXTERNAL_LINKS } from '@/common/config'
import type { NavigationSection } from '@/components/setting-panel/config'
import multiAskImagePath from '@/assets/whatsnew/multi-ask.webp'

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

export interface ExternalLinkPromoAction {
  action: 'external-link'
  params: {
    url: string
  }
}

export type ReleaseNotePromoAction =
  | SettingPanelPromoAction
  | ThemeFloatingPanelPromoAction
  | ChatSettingsPanelPromoAction
  | ExternalLinkPromoAction

export interface ReleaseNote {
  introducedInVersion?: string
  titleKey: string // i18n key for feature title
  descriptionKey: string // i18n key for feature description
  actionLabelKey?: string // optional i18n key for feature CTA
  promoImagePath?: string // optional promo image path
  promoAction?: ReleaseNotePromoAction // optional action when promo image is clicked
}

/**
 * Omit introducedInVersion for new notes. Set it to the original release version
 * only when carrying a note into a later release.
 * Maximum 2 features recommended for optimal display
 */
export const CURRENT_RELEASE_NOTES: ReleaseNote[] = [
  {
    introducedInVersion: '0.14.0',
    titleKey: 'whatsnew.multiAsk.title',
    descriptionKey: 'whatsnew.multiAsk.description',
    actionLabelKey: 'whatsnew.multiAsk.action',
    promoImagePath: multiAskImagePath,
    promoAction: {
      action: 'external-link',
      params: {
        url: EXTERNAL_LINKS.QUICK_FOLLOW_UP_GUIDE,
      },
    },
  },
]
