/**
 * Navigation Handler for Stuff Page
 * 
 * Handles extracting jslog data and opening items in new tabs.
 */

import type { MediaItem } from '@/utils/stuffMediaParser'
import { stuffDataCache } from './dataCache'

/**
 * Extract timestamp from jslog attribute
 * 
 * @param jslog jslog attribute value
 * @returns Timestamp in seconds, or null if not found
 * 
 * @example
 * // jslog format: "279444;track:...;BardVeMetadataKey:[...[1,[1753892482,343000000]]]"
 * extractTimestampFromJslog(jslog) // => 1753892482
 */
export function extractTimestampFromJslog(jslog: string | null): number | null {
  if (!jslog) return null

  try {
    // Look for pattern: [1,[timestamp,nanoseconds]]
    const match = jslog.match(/\[1,\[(\d+),\d+\]\]/)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }

    return null
  } catch (error) {
    console.error('[Navigation] Error extracting timestamp from jslog:', error)
    return null
  }
}

/**
 * Handle "Open in New Tab" button click
 * 
 * @param cardElement The library-item-card element
 */
export function handleOpenInNewTab(cardElement: Element): void {
  try {
    // Extract jslog attribute
    const jslog = cardElement.getAttribute('jslog')
    if (!jslog) {
      console.warn('[Navigation] No jslog attribute found on card')
      return
    }

    // Extract timestamp
    const timestamp = extractTimestampFromJslog(jslog)
    if (timestamp === null) {
      console.warn('[Navigation] Could not extract timestamp from jslog')
      return
    }

    // Find MediaItem in cache
    const mediaItem = stuffDataCache.findByTimestamp(timestamp)
    if (!mediaItem) {
      console.warn('[Navigation] MediaItem not found in cache for timestamp:', timestamp)
      return
    }

    // Build URL path (remove prefixes: "c_" from conversationId, "r_" from responseId)
    const conversationId = mediaItem.conversationId.replace(/^c_/, '')
    const responseId = mediaItem.responseId.replace(/^r_/, '')
    const url = `/app/${conversationId}#${responseId}`

    console.log('[Navigation] Opening in new tab:', {
      timestamp,
      originalConversationId: mediaItem.conversationId,
      originalResponseId: mediaItem.responseId,
      conversationId,
      responseId,
      url,
    })

    // Open in new tab
    window.open(url, '_blank')
  } catch (error) {
    console.error('[Navigation] Error opening in new tab:', error)
  }
}
