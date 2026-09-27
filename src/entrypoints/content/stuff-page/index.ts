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
import { browser } from 'wxt/browser'
import {
  STUFF_MEDIA_DATA_RECEIVED_MESSAGE,
  isStuffMediaDataReceivedMessage,
} from '@/types/runtime-messages'
import { stuffDataCache } from './dataCache'
import { reconcileOpenInNewTabButtons } from './buttonInjector'
import { startLibraryAdapters, stopLibraryAdapters } from './libraryAdapters'
import { clearLibraryMediaCache, receiveLibraryMediaData } from './libraryIsland'
import { libraryMediaDataSchema } from '@/utils/library/mediaParser'
import { resolveLibraryPage } from './dom'
import { logLibraryTrace } from '@/utils/library/logger'

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
    startLibraryAdapters()

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
    stopLibraryAdapters()
    clearLibraryMediaCache()

    // Clear cache
    stuffDataCache.clear()

    this.isStarted = false
    console.log('[StuffPageModule] Stopped')
  }

  /**
   * Setup event listeners for main-world events
   */
  private setupEventListeners(): void {
    const handleStuffMediaData = (data: StuffMediaDataEvent, source: 'main world' | 'runtime') => {
      const { items, nextPageToken, timestamp } = data

      console.log(`[StuffPageModule] Received MediaItem data from ${source}:`, {
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

      if (resolveLibraryPage()?.kind === 'legacy') {
        reconcileOpenInNewTabButtons()
      }

      // Emit to event bus for other modules (if needed)
      eventBus.emit('stuff-media:data-received', {
        items,
        nextPageToken,
        timestamp,
      })
    }

    // Listen to CustomEvent from main world
    const handleMainWorldEvent = (event: Event) => {
      const customEvent = event as CustomEvent<StuffMediaDataEvent>
      handleStuffMediaData(customEvent.detail, 'main world')
    }

    const handleLibraryData = (data: unknown, source: string): void => {
      const parsed = libraryMediaDataSchema.safeParse(data)
      if (!parsed.success) {
        logLibraryTrace('content:payload-rejected', () => ({ source,
          issues: parsed.error.issues.slice(0, 3).map((issue) => ({
            path: issue.path.map(String).join('.'), code: issue.code,
          })) }))
        return
      }
      logLibraryTrace('content:received', () => ({ source,
        items: parsed.data.items.length, timestamp: parsed.data.timestamp }))
      receiveLibraryMediaData(parsed.data)
      eventBus.emit('library-media:data-received', parsed.data)
    }

    const handleLibraryEvent = (event: Event): void => {
      handleLibraryData((event as CustomEvent<unknown>).detail, 'main-world')
    }

    const handleRuntimeMessage = (message: unknown): void => {
      if (!isStuffMediaDataReceivedMessage(message)) {
        return
      }
      if (message.type !== STUFF_MEDIA_DATA_RECEIVED_MESSAGE) {
        return
      }
      handleStuffMediaData(message.payload, 'runtime')
    }

    // Listen to the CustomEvent from main world
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, handleMainWorldEvent)
    window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, handleLibraryEvent)
    browser.runtime.onMessage.addListener(handleRuntimeMessage)
    logLibraryTrace('content:listeners-ready', () => ({ platform: import.meta.env.FIREFOX ? 'firefox' : 'chrome' }))

    window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))

    // Store cleanup function
    this.eventCleanup = () => {
      window.removeEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, handleMainWorldEvent)
      window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, handleLibraryEvent)
      browser.runtime.onMessage.removeListener(handleRuntimeMessage)
      console.log('[StuffPageModule] Event listeners cleaned up')
    }

    console.log('[StuffPageModule] Event listeners setup complete')
  }
}

/**
 * Singleton instance
 */
export const stuffPageModule = new StuffPageModule()
