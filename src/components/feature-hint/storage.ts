const FEATURE_HINT_SEEN_VERSIONS_KEY = 'featureHintSeenVersions'

type FeatureHintSeenVersions = Record<string, string>

async function getSeenVersions(): Promise<FeatureHintSeenVersions> {
  try {
    const result = await browser.storage.local.get(FEATURE_HINT_SEEN_VERSIONS_KEY)
    const storedValue = result[FEATURE_HINT_SEEN_VERSIONS_KEY]

    if (!storedValue || typeof storedValue !== 'object' || Array.isArray(storedValue)) {
      return {}
    }

    return Object.entries(storedValue).reduce<FeatureHintSeenVersions>(
      (seenVersions, [hintId, version]) => {
        if (typeof version === 'string') {
          seenVersions[hintId] = version
        }
        return seenVersions
      },
      {},
    )
  } catch {
    return {}
  }
}

export async function shouldShowFeatureHint(id: string, version: string): Promise<boolean> {
  try {
    const seenVersions = await getSeenVersions()
    return seenVersions[id] !== version
  } catch {
    return false
  }
}

export async function markFeatureHintSeen(id: string, version: string): Promise<void> {
  try {
    const seenVersions = await getSeenVersions()
    await browser.storage.local.set({
      [FEATURE_HINT_SEEN_VERSIONS_KEY]: {
        ...seenVersions,
        [id]: version,
      },
    })
  } catch {
    // Non-critical onboarding state; ignore storage failures.
  }
}
