/**
 * Context Monitor Utility
 * Provides a singleton service to detect extension context invalidation
 * Supports multiple subscribers with a single monitoring instance
 */

import { throttle } from './throttle'

type InvalidationCallback = () => void

/**
 * Singleton Context Monitor
 * Manages a single polling timer and WXT listener for all subscribers
 */
class ContextMonitor {
  private static instance: ContextMonitor | null = null
  
  private callbacks: Set<InvalidationCallback> = new Set()
  private isInvalidated: boolean = false
  private pollingIntervalId: number | null = null
  private handleVisibilityChange: (() => void) | null = null
  
  private readonly POLLING_INTERVAL_MS = 60 * 1000
  private readonly THROTTLE_DELAY_MS = 1000
  
  private constructor() {
    // Create throttled check method
    this.throttledCheck = throttle(() => {
      console.info('[ContextMonitor] Checking context validity')
      if (!ContextMonitor.checkAndNotify()) {
        console.info('[ContextMonitor] Context invalidated')
      }
    }, this.THROTTLE_DELAY_MS)
  }
  
  /**
   * Throttled check method to prevent excessive checks
   */
  private throttledCheck: () => void
  
  /**
   * Get singleton instance
   */
  public static getInstance(): ContextMonitor {
    if (!ContextMonitor.instance) {
      ContextMonitor.instance = new ContextMonitor()
    }
    return ContextMonitor.instance
  }
  
  /**
   * Check if extension context is still valid (pure function)
   * Static method - can be called without instance
   * @returns true if context is valid, false otherwise
   */
  public static isContextValid(): boolean {
    try {
      return Boolean(browser?.runtime?.id)
    } catch {
      return false
    }
  }
  
  /**
   * Check context validity and trigger callbacks if invalid
   * Use this when you want automatic notification on invalidation
   * @returns true if context is valid, false otherwise
   */
  public static checkAndNotify(): boolean {
    const isValid = ContextMonitor.isContextValid()
    if (!isValid) {
      ContextMonitor.getInstance().triggerCallbacks()
    }
    return isValid
  }
  
  /**
   * Trigger all registered callbacks
   */
  private triggerCallbacks(): void {
    if (this.isInvalidated) return
    
    this.isInvalidated = true
    console.warn('[ContextMonitor] Extension context invalidated, notifying subscribers')
    
    // Notify all subscribers
    this.callbacks.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error('[ContextMonitor] Error in callback:', error)
      }
    })
    
    // Clean up monitoring resources
    this.stopMonitoring()
  }
  
  /**
   * Start monitoring (lazy initialization)
   */
  private startMonitoring(): void {
    // Already monitoring
    if (this.pollingIntervalId !== null) return
    
    console.log('[ContextMonitor] Starting monitoring...')
    
    // 1. Polling detection (every 60 seconds)
    this.pollingIntervalId = setInterval(() => {
      this.throttledCheck()
    }, this.POLLING_INTERVAL_MS) as any
    
    // 2. Visibility change detection (when page becomes visible)
    this.handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[ContextMonitor] Page became visible, checking context...')
        this.throttledCheck()
      }
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }
  
  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    // Stop polling
    if (this.pollingIntervalId !== null) {
      clearInterval(this.pollingIntervalId)
      this.pollingIntervalId = null
    }
    
    // Remove visibility change listener
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
      this.handleVisibilityChange = null
    }
    
    console.log('[ContextMonitor] Monitoring stopped')
  }
  
  /**
   * Subscribe to context invalidation events
   * @param callback Function to call when context becomes invalid
   * @returns Unsubscribe function
   */
  public subscribe(callback: InvalidationCallback): () => void {
    // Add callback to set
    this.callbacks.add(callback)
    console.log(`[ContextMonitor] Subscriber added (total: ${this.callbacks.size})`)
    
    // Start monitoring if this is the first subscriber
    if (this.callbacks.size === 1 && !this.isInvalidated) {
      this.startMonitoring()
    }
    
    // If already invalidated, call immediately
    if (this.isInvalidated) {
      try {
        callback()
      } catch (error) {
        console.error('[ContextMonitor] Error in callback:', error)
      }
    }
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback)
      console.log(`[ContextMonitor] Subscriber removed (total: ${this.callbacks.size})`)
      
      // Stop monitoring if no more subscribers
      if (this.callbacks.size === 0 && !this.isInvalidated) {
        this.stopMonitoring()
      }
    }
  }
  
  /**
   * Check if context is currently invalidated
   */
  public isInvalid(): boolean {
    return this.isInvalidated
  }
}

/**
 * Get the singleton ContextMonitor instance
 */
export function getContextMonitor(): ContextMonitor {
  return ContextMonitor.getInstance()
}

/**
 * Check if extension context is currently valid
 * Utility function that can be called from anywhere
 * @returns true if context is valid, false otherwise
 */
export function isExtensionContextValid(): boolean {
  return ContextMonitor.isContextValid()
}

/**
 * Convenience function: Monitor for extension context invalidation
 * @param callback Function to call when context becomes invalid
 * @returns Unsubscribe function
 */
export function monitorExtensionContext(
  callback: () => void
): () => void {
  const monitor = getContextMonitor()
  
  // Subscribe to invalidation events
  return monitor.subscribe(callback)
}


