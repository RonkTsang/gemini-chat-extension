/**
 * What's New Feature
 * Displays a toast notification when the extension is updated to a new version
 */

import { useEffect, useState } from 'react'
import { WhatsNewToast } from './WhatsNewToast'
import { CURRENT_RELEASE_NOTES } from './config'
import { getLastSeenVersion, setLastSeenVersion, compareVersions } from './storage'
import React from 'react'
import { initializeOnboarding } from '../onboarding/storage'

function WhatsNew({ onboardingFinished }: { onboardingFinished: boolean }) {
  const [showToast, setShowToast] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string>('')

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const onboarding = await initializeOnboarding()
        if (!onboarding) return
        // Get current version from manifest
        const manifest = browser.runtime.getManifest()
        const version = manifest.version
        setCurrentVersion(version)

        // Get last seen version from storage
        const lastVersion = await getLastSeenVersion()

        // A new installation waits until onboarding finishes before recording its version.
        if (!lastVersion) {
          if (onboarding !== 'pending' && onboarding !== 'shown') {
            await setLastSeenVersion(version)
            return
          }
          if (onboardingFinished) {
            if (CURRENT_RELEASE_NOTES.length > 0) setShowToast(true)
            await setLastSeenVersion(version)
          }
          return
        }

        if (onboarding === 'pending') {
          await setLastSeenVersion(version)
          return
        }

        // Compare versions (only major.minor)
        const versionDiff = compareVersions(version, lastVersion)
        console.log('WhatsNew: versionDiff', versionDiff)
        console.log('WhatsNew:version', version)
        console.log('WhatsNew:lastVersion', lastVersion)

        // If current version is greater than last version
        if (versionDiff > 0) {
          // Check if there are release notes to show
          if (CURRENT_RELEASE_NOTES.length > 0) {
            // Show the toast
            setShowToast(true)
          }
          // Update last seen version
          await setLastSeenVersion(version)
        }
      } catch (error) {
        console.error('Failed to check version for What\'s New:', error)
      }
    }

    // Use requestIdleCallback to avoid blocking the main thread
    if ('requestIdleCallback' in window) {
      requestIdleCallback(checkVersion)
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(checkVersion, 1000)
    }
  }, [onboardingFinished])

  const handleClose = () => {
    setShowToast(false)
  }

  if (!(showToast && currentVersion)) {
    return null
  }

  return (
    <WhatsNewToast
      version={currentVersion}
      features={CURRENT_RELEASE_NOTES}
      onClose={handleClose}
    />
  )
}

export default React.memo(WhatsNew)
