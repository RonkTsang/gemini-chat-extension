/**
 * URL Monitor Main World Script
 * Rewrite history interface in the main world to detect real page navigation
 */

import { GEM_DEV_EVENTS, GEM_EXT_EVENTS } from '@/common/event'

const DEV_FORCE_BULK_DELETE_FAILURE_FLAG = '__GPK_DEV_FORCE_BULK_DELETE_FAILURE__'
const DEV_FORCE_BULK_DELETE_FAILURE_ATTR = 'data-gpk-dev-force-bulk-delete-failure'

export default defineUnlistedScript(() => {
  console.log('[URLMonitor Main World] Starting URL monitoring in main world...')

  if (import.meta.env.DEV) {
    installBulkDeleteFailureDebugBridge()
  }

  // Save original methods
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  // Rewrite pushState
  history.pushState = (...args) => {
    originalPushState.apply(history, args)
    emitURLChange()
  }

  // Rewrite replaceState
  history.replaceState = (...args) => {
    originalReplaceState.apply(history, args)
    emitURLChange()
  }

  // Listen for popstate event
  window.addEventListener('popstate', emitURLChange)

  // Emit URL change event
  function emitURLChange() {
    const eventData = {
      url: window.location.href,
      timestamp: Date.now()
    }

    // Dispatch CustomEvent to isolated world
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.URL_CHANGE, {
      detail: eventData
    }))

    console.log('[URLMonitor Main World] URL changed:', eventData.url)
  }

  console.log('[URLMonitor Main World] URL monitoring started successfully')
})

function installBulkDeleteFailureDebugBridge(): void {
  let enabled = Boolean(window[DEV_FORCE_BULK_DELETE_FAILURE_FLAG as keyof Window])

  const sync = () => {
    document.documentElement.setAttribute(DEV_FORCE_BULK_DELETE_FAILURE_ATTR, String(enabled))
    window.dispatchEvent(new CustomEvent(GEM_DEV_EVENTS.DEV_BULK_DELETE_FORCE_FAILURE_CHANGE, {
      detail: { enabled },
    }))
  }

  Object.defineProperty(window, DEV_FORCE_BULK_DELETE_FAILURE_FLAG, {
    configurable: true,
    enumerable: false,
    get: () => enabled,
    set: (value: unknown) => {
      enabled = Boolean(value)
      sync()
    },
  })

  sync()
}
