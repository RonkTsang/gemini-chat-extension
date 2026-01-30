import { useEffect, useRef, useState } from 'react'
import { monitorExtensionContext, isExtensionContextValid } from '@/utils/contextMonitor'
import { useEvent } from '@/hooks/useEventBus'
import { ReloadDialog } from './ReloadDialog'
import { toaster } from '@/components/ui/toaster'
import { i18nCache, CACHE_KEYS } from '@/utils/i18nCache'

const RELOAD_TOAST_ID = 'extension-reload-toast'

/**
 * Extension Context Monitor Module
 * 
 * Responsibilities:
 * 1. Monitor extension context invalidation via polling
 * 2. Display reload toast when context becomes invalid (via monitorExtensionContext)
 * 3. Display reload dialog when SettingPanel opens with invalid context
 * 4. Stop services gracefully when context becomes invalid
 * 
 * Note: Extension update detection (onUpdateAvailable) has been removed
 * to avoid requiring additional permissions that would trigger user re-authorization.
 */
function ExtensionUpdate() {
  const [showReload, setShowReload] = useState(false)
  const toastShownRef = useRef(false)

  // Show reload toast (for monitorExtensionContext callback)
  const showReloadToast = () => {
    if (toastShownRef.current || toaster.isVisible(RELOAD_TOAST_ID)) {
      return
    }
    toastShownRef.current = true
    
    toaster.create({
      id: RELOAD_TOAST_ID,
      title: i18nCache.get(CACHE_KEYS.EXTENSION_UPDATED_TITLE),
      description: i18nCache.get(CACHE_KEYS.EXTENSION_UPDATED_BODY),
      type: 'info',
      duration: Infinity, // Persist until user interacts
      closable: true,
      action: {
        label: i18nCache.get(CACHE_KEYS.RELOAD_PAGE),
        onClick: () => {
          window.location.reload()
        },
      },
    })
  }

  // Listen for context invalidation via polling
  useEffect(() => {
    const stopMonitoring = monitorExtensionContext(() => {
      // Show reload toast (non-blocking notification)
      showReloadToast()
    })
    
    // Clean up monitoring on unmount
    return stopMonitoring
  }, [])

  // Listen for SettingPanel state changes
  useEvent('settings:state-changed', (data) => {
    // When SettingPanel opens, check if context is invalid
    if (data.open) {
      if (!isExtensionContextValid()) {
        setShowReload(true)
      }
    }
  })

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
