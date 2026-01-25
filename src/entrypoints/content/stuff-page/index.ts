/**
 * Stuff Page Module
 * 
 * Main orchestrator for Stuff page "Open in New Tab" feature.
 * 
 * Responsibilities:
 * 1. Listen to main-world events for MediaItem data
 * 2. Update data cache with new items
 * 3. Start button injector for DOM modifications
 */

import { GEM_EXT_EVENTS, type StuffMediaDataEvent } from '@/common/event'
import { eventBus } from '@/utils/eventbus'
import { stuffDataCache } from './dataCache'
import { startButtonInjector, stopButtonInjector } from './buttonInjector'

/**
 * Stuff Page Module State
 */
class StuffPageModule {
  private isStarted: boolean = false
  private eventCleanup: (() => void) | null = null

  /**
   * Start the module
   */
  start(): void {
    if (this.isStarted) {
      console.warn('[StuffPageModule] Already started')
      return
    }

    console.log('[StuffPageModule] Starting...')

    // Listen to main-world events for MediaItem data
    this.setupEventListeners()

    // Start button injector
    startButtonInjector()

    this.isStarted = true
    console.log('[StuffPageModule] Started successfully')
  }

  /**
   * Stop the module
   */
  stop(): void {
    if (!this.isStarted) {
      console.warn('[StuffPageModule] Not started')
      return
    }

    console.log('[StuffPageModule] Stopping...')

    // Cleanup event listeners
    if (this.eventCleanup) {
      this.eventCleanup()
      this.eventCleanup = null
    }

    // Stop button injector
    stopButtonInjector()

    // Clear cache
    stuffDataCache.clear()

    this.isStarted = false
    console.log('[StuffPageModule] Stopped')
  }

  /**
   * Setup event listeners for main-world events
   */
  private setupEventListeners(): void {
    // Listen to CustomEvent from main world
    const handleMainWorldEvent = (event: Event) => {
      const customEvent = event as CustomEvent<StuffMediaDataEvent>
      const { items, nextPageToken, timestamp } = customEvent.detail

      console.log('[StuffPageModule] Received MediaItem data from main world:', {
        itemCount: items.length,
        nextPageToken,
        timestamp,
      })

      // Add items to cache (with deduplication)
      const addedCount = stuffDataCache.addItems(items)

      console.log('[StuffPageModule] Cache updated:', {
        addedCount,
        totalCached: stuffDataCache.size,
      })

      // Emit to event bus for other modules (if needed)
      eventBus.emit('stuff-media:data-received', {
        items,
        nextPageToken,
        timestamp,
      })
    }

    // Listen to the CustomEvent from main world
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, handleMainWorldEvent)

    // Store cleanup function
    this.eventCleanup = () => {
      window.removeEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, handleMainWorldEvent)
      console.log('[StuffPageModule] Event listeners cleaned up')
    }

    console.log('[StuffPageModule] Event listeners setup complete')
  }
}

/**
 * Singleton instance
 */
export const stuffPageModule = new StuffPageModule()
