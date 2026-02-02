/**
 * What's New feature configuration
 * Defines the release notes for the current version
 */

export interface ReleaseNote {
  titleKey: string      // i18n key for feature title
  descriptionKey: string // i18n key for feature description
}

/**
 * Current release notes (version is auto-detected from manifest)
 * Update this array when releasing a new version with features to announce
 * Maximum 2 features recommended for optimal display
 */
export const CURRENT_RELEASE_NOTES: ReleaseNote[] = [
  {
    titleKey: 'whatsnew.feature1.title',
    descriptionKey: 'whatsnew.feature1.description'
  },
  {
    titleKey: 'whatsnew.feature2.title',
    descriptionKey: 'whatsnew.feature2.description'
  }
]
