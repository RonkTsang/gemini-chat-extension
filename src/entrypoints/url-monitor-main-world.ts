/**
 * URL Monitor Main World Script
 * Rewrite history interface in the main world to detect real page navigation
 */

import { GEM_EXT_EVENTS } from '@/common/event'
import { startStuffMonitor } from './main-world/stuff-monitor'

export default defineUnlistedScript(() => {
  console.log('[URLMonitor Main World] Starting URL monitoring in main world...')

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

  // Start Stuff page monitoring
  startStuffMonitor()
  console.log('[URLMonitor Main World] Stuff monitor initialized')
})
