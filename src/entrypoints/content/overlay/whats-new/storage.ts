/**
 * Version storage layer for What's New feature
 * Manages version tracking in browser local storage
 */

const STORAGE_KEY = 'lastSeenVersion'

/**
 * Get the last seen version from local storage
 * @returns The last seen version string, or null if not found
 */
export async function getLastSeenVersion(): Promise<string | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] || null
  } catch (error) {
    console.error('Failed to get last seen version:', error)
    return null
  }
}

/**
 * Save the current version to local storage
 * @param version - The version string to save (e.g., "0.4.0")
 */
export async function setLastSeenVersion(version: string): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: version })
  } catch (error) {
    console.error('Failed to set last seen version:', error)
  }
}

/**
 * Compare two semantic versions (only major.minor, ignoring patch)
 * @param v1 - First version string (e.g., "0.4.0" or "0.4")
 * @param v2 - Second version string (e.g., "0.3.0" or "0.3")
 * @returns Positive if v1 > v2, negative if v1 < v2, zero if equal
 */
export function compareVersions(v1: string, v2: string): number {
  // Handle edge cases: null, undefined, or non-string values
  if (!v1 || typeof v1 !== 'string') {
    console.warn('Invalid version v1:', v1)
    return v2 && typeof v2 === 'string' ? -1 : 0
  }
  if (!v2 || typeof v2 !== 'string') {
    console.warn('Invalid version v2:', v2)
    return 1
  }

  // Parse version parts, defaulting missing parts to 0
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  const major1 = parts1[0] || 0
  const minor1 = parts1[1] || 0
  const major2 = parts2[0] || 0
  const minor2 = parts2[1] || 0
  
  // Handle invalid numbers (NaN)
  if (isNaN(major1) || isNaN(minor1)) {
    console.warn('Invalid version format for v1:', v1)
    return -1
  }
  if (isNaN(major2) || isNaN(minor2)) {
    console.warn('Invalid version format for v2:', v2)
    return 1
  }
  
  if (major1 !== major2) return major1 - major2
  return minor1 - minor2
}
