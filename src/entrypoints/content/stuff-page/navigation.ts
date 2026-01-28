/**
 * Navigation Handler for Stuff Page
 * 
 * Handles extracting jslog data and opening items in new tabs.
 */

import { MediaItemStatus } from '@/utils/stuffMediaParser'
import { stuffDataCache } from './dataCache'

/**
 * Extracted Media Info from jslog
 */
interface MediaInfo {
  status: number
  timestamp: number | null
}

/**
 * Extract media info (status, timestamp) from jslog attribute
 * 
 * @param jslog jslog attribute value
 * @returns MediaInfo object or null if not found
 * 
 * @example
 * // Normal: "...[1,[1753892482,343000000]]" -> { status: 1, timestamp: 1753892482 }
 * // Audio: "...[3,[]]" -> { status: 3, timestamp: null }
 */
export function extractMediaInfoFromJslog(jslog: string | null): MediaInfo | null {
  if (!jslog) return null

  try {
    // Look for pattern: [status,[timestamp,nanoseconds]]
    // Matches: [1,[123,456]] or [3,[]]
    const match = jslog.match(/\[(\d+),\[(.*?)\]\]/)

    if (match) {
      const status = parseInt(match[1], 10)
      const innerContent = match[2].trim()

      let timestamp: number | null = null

      // If inner content is not empty, try to parse timestamp
      if (innerContent) {
        // innerContent might be "1753892482,343000000"
        const parts = innerContent.split(',')
        if (parts.length > 0) {
          const ts = parseInt(parts[0], 10)
          if (!isNaN(ts)) {
            timestamp = ts
          }
        }
      }

      return { status, timestamp }
    }

    return null
  } catch (error) {
    console.error('[Navigation] Error extracting info from jslog:', error)
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

    // Extract media info
    const mediaInfo = extractMediaInfoFromJslog(jslog)
    if (!mediaInfo) {
      console.warn('[Navigation] Could not extract media info from jslog')
      return
    }

    let mediaItem = null

    // Strategy 1: Find by timestamp (Primary)
    if (mediaInfo.timestamp !== null) {
      mediaItem = stuffDataCache.findByTimestamp(mediaInfo.timestamp)
    }
    // Strategy 2: Find by Title (Fallback for Audio/No-Timestamp)
    else if (mediaInfo.status === MediaItemStatus.Audio) {
      // Audio items (status=3) might not have timestamp in jslog, try finding by title
      // Structure: library-item-card > .library-item-card-container > .library-item-card > .header > .title
      const titleElement = cardElement.querySelector('.library-item-card .header .title')
      const title = titleElement?.textContent?.trim()

      if (title) {
        mediaItem = stuffDataCache.findByTitle(title)
        if (!mediaItem) {
          console.warn('[Navigation] MediaItem not found by title:', title)
        }
      } else {
        console.warn('[Navigation] No title found in card element for Audio item')
      }
    }

    if (!mediaItem) {
      console.warn('[Navigation] MediaItem not found in cache. Info:', mediaInfo)
      return
    }

    // Build URL path (remove prefixes: "c_" from conversationId, "r_" from responseId)
    const conversationId = mediaItem.conversationId.replace(/^c_/, '')
    const responseId = mediaItem.responseId.replace(/^r_/, '')
    const url = `/app/${conversationId}#${responseId}`

    console.log('[Navigation] Opening in new tab:', {
      timestamp: mediaInfo.timestamp,
      status: mediaInfo.status,
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
