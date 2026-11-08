/**
 * What's New Feature
 * Displays a toast notification when the extension is updated to a new version
 */

import React, { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { WhatsNewToast } from './WhatsNewToast'
import { CURRENT_RELEASE_NOTES, type ReleaseNote } from './config'
import { getLastSeenVersion, setLastSeenVersion, compareVersions } from './storage'
import { initializeOnboarding } from '../onboarding/storage'

function WhatsNew({ onboardingFinished }: { onboardingFinished: boolean }) {
  const [toast, setToast] = useState<{ version: string; features: ReleaseNote[] } | null>(null)

  useEffect(() => {
    let disposed = false
    const checkVersion = async () => {
      try {
        const onboarding = await initializeOnboarding()
        if (disposed || !onboarding || onboarding === 'pending') return

        // Serialize the read and write so two tabs cannot announce the same update.
        await navigator.locks.request(`gpk:${browser.runtime.id}:whats-new`, async () => {
          const version = browser.runtime.getManifest().version
          const lastVersion = await getLastSeenVersion()
          if (disposed) return
          if (!lastVersion && onboarding === 'shown' && !onboardingFinished) return
          if (lastVersion && compareVersions(version, lastVersion) <= 0) return

          const features = CURRENT_RELEASE_NOTES.filter(note =>
            !lastVersion || compareVersions(lastVersion, note.introducedInVersion ?? version) < 0,
          )
          if (features.length > 0) setToast({ version, features })
          await setLastSeenVersion(version)
        })
      } catch (error) {
        console.error('Failed to check version for What\'s New:', error)
      }
    }

    // Use requestIdleCallback to avoid blocking the main thread
    if ('requestIdleCallback' in window) {
      const idleCallback = requestIdleCallback(checkVersion)
      return () => {
        disposed = true
        cancelIdleCallback(idleCallback)
      }
    }
    const timeout = setTimeout(checkVersion, 1000)
    return () => {
      disposed = true
      clearTimeout(timeout)
    }
  }, [onboardingFinished])

  if (!toast) return null

  return (
    <WhatsNewToast
      version={toast.version}
      features={toast.features}
      onClose={() => setToast(null)}
    />
  )
}

export default React.memo(WhatsNew)
