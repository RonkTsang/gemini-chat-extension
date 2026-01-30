/**
 * Stuff Data Cache
 * 
 * In-memory cache for MediaItem data with deduplication.
 * No persistence needed - data is refreshed on each page load.
 */

import type { MediaItem } from '@/utils/stuffMediaParser'

/**
 * Unique key for MediaItem using conversationId + responseId
 */
function getMediaItemKey(item: MediaItem): string {
  return `${item.conversationId}:${item.responseId}`
}

/**
 * In-memory cache for Stuff Media items
 */
class StuffDataCache {
  private itemsMap: Map<string, MediaItem> = new Map()
  private timestampIndex: Map<number, string> = new Map()
  private titleIndex: Map<string, string> = new Map()

  /**
   * Add items to cache with deduplication
   * Items are deduplicated using conversationId + responseId as unique key
   * 
   * @param items Array of MediaItem to add
   * @returns Number of new items added (after deduplication)
   */
  addItems(items: MediaItem[]): number {
    let addedCount = 0

    for (const item of items) {
      const key = getMediaItemKey(item)

      // Skip if already exists
      if (this.itemsMap.has(key)) {
        continue
      }

      // Add to main map
      this.itemsMap.set(key, item)

      // Add to timestamp index
      if (item.timestamp > 0) {
        this.timestampIndex.set(item.timestamp, key)
      }

      // Add to title index
      if (item.title) {
        this.titleIndex.set(item.title, key)
      }

      addedCount++
    }

    if (addedCount > 0) {
      console.log('[StuffDataCache] Added', addedCount, 'new items. Total:', this.size)
    }

    return addedCount
  }

  /**
   * Find MediaItem by timestamp
   * 
   * @param timestamp Unix timestamp in seconds
   * @returns MediaItem if found, null otherwise
   */
  findByTimestamp(timestamp: number): MediaItem | null {
    const key = this.timestampIndex.get(timestamp)
    if (!key) {
      return null
    }

    return this.itemsMap.get(key) || null
  }

  /**
   * Find MediaItem by title
   * 
   * @param title Item title
   * @returns MediaItem if found, null otherwise
   */
  findByTitle(title: string): MediaItem | null {
    const key = this.titleIndex.get(title)
    if (!key) {
      return null
    }

    return this.itemsMap.get(key) || null
  }

  /**
   * Find MediaItem by conversation and response IDs
   * 
   * @param conversationId Conversation ID
   * @param responseId Response ID
   * @returns MediaItem if found, null otherwise
   */
  findByIds(conversationId: string, responseId: string): MediaItem | null {
    const key = `${conversationId}:${responseId}`
    return this.itemsMap.get(key) || null
  }

  /**
   * Get all items as array
   */
  getAllItems(): MediaItem[] {
    return Array.from(this.itemsMap.values())
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.itemsMap.clear()
    this.timestampIndex.clear()
    this.titleIndex.clear()
    console.log('[StuffDataCache] Cache cleared')
  }

  /**
   * Get number of cached items
   */
  get size(): number {
    return this.itemsMap.size
  }

  /**
   * Check if cache has any items
   */
  get isEmpty(): boolean {
    return this.itemsMap.size === 0
  }
}

/**
 * Singleton instance of StuffDataCache
 */
export const stuffDataCache = new StuffDataCache()
