/**
 * URL Monitor Service
 * Responsible for monitoring URL changes and emitting events
 */

import { eventBus } from '@/utils/eventbus'
import { GEM_EXT_EVENTS, URLChangeEvent } from '@/common/event'

class URLMonitor {
  private isActive = false
  /**
   * Start monitoring URL changes
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    console.log('[URLMonitor] Starting URL monitoring...')
    
    // Listen to CustomEvent from main world
    window.addEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleURLChange)
  }

  /**
   * Stop monitoring URL changes
   */
  stop(): void {
    if (!this.isActive) return
    
    this.isActive = false
    console.log('[URLMonitor] Stopping URL monitoring...')
    
    // Remove event listener
    window.removeEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleURLChange)
  }

  /**
   * Handle URL change event from main world
   */
  private handleURLChange = (event: Event): void => {
    const customEvent = event as CustomEvent<URLChangeEvent>
    const eventData = customEvent.detail
    
    console.log('[URLMonitor] URL changed from main world:', eventData.url)
    
    // Emit event bus event
    eventBus.emit('urlchange', eventData)
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.isActive
  }
}

// Global instance
export const urlMonitor = new URLMonitor()
