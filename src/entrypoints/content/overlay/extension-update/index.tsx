import { useEffect, useState } from 'react'
import { monitorExtensionContext } from '@/utils/contextMonitor'
import { ReloadDialog } from './ReloadDialog'

/**
 * Extension Context Monitor Module
 * 
 * Responsibilities:
 * 1. Monitor extension context invalidation via polling
 * 2. Display reload dialog when context becomes invalid
 * 3. Stop services gracefully when context becomes invalid
 * 
 * Note: Extension update detection (onUpdateAvailable) has been removed
 * to avoid requiring additional permissions that would trigger user re-authorization.
 */
function ExtensionUpdate() {
  const [showReload, setShowReload] = useState(false)

  // Listen for context invalidation via polling
  useEffect(() => {
    const stopMonitoring = monitorExtensionContext(() => {
      // Show reload dialog
      setShowReload(true)
    })
    
    // Clean up monitoring on unmount
    return stopMonitoring
  }, [])

  return (
    <>
      {showReload && (
        <ReloadDialog
          isOpen={true}
          onClose={() => setShowReload(false)}
        />
      )}
    </>
  )
}

export default ExtensionUpdate
