/**
 * Badge (small red dot) state management for the Power Kit entry button.
 *
 * To re-enable the badge after a new feature release, increment POWER_KIT_BADGE_VERSION.
 * Users whose stored version differs from the current one will see the dot again.
 */

const BADGE_STORAGE_KEY = 'powerKitBadgeSeenVersion'

/**
 * Bump this value when you want to re-show the badge after a new feature release.
 * Changing '1' → '2' will cause all users (including those who dismissed before) to
 * see the red dot again on their next page load.
 */
export const POWER_KIT_BADGE_VERSION = '3'

/**
 * Returns true if the badge should be shown (user has never dismissed it,
 * or the badge version has been bumped since they last dismissed).
 */
export async function shouldShowBadge(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(BADGE_STORAGE_KEY)
    const seenVersion: string | undefined = result[BADGE_STORAGE_KEY]
    return seenVersion !== POWER_KIT_BADGE_VERSION
  } catch {
    return false
  }
}

/**
 * Persists the current badge version so the dot won't be shown again
 * until POWER_KIT_BADGE_VERSION is bumped.
 */
export async function dismissBadge(): Promise<void> {
  try {
    await browser.storage.local.set({ [BADGE_STORAGE_KEY]: POWER_KIT_BADGE_VERSION })
  } catch {
    // Non-critical; silently ignore
  }
}
