/**
 * Stuff Page Monitor (Main World)
 * 
 * Intercepts Stuff Media API requests in the main world (page context)
 * and dispatches events to the isolated world for processing.
 * 
 * This script runs in the page context to access real XHR requests.
 */

import { xhrInterceptor } from '@/utils/xhrInterceptor'
import { parseMediaResponse, type MediaItem } from '@/utils/stuffMediaParser'
import { GEM_EXT_EVENTS } from '@/common/event'

/**
 * Start monitoring Stuff Media API requests
 */
export function startStuffMonitor(): void {
  console.log('[StuffMonitor Main World] Starting Stuff page monitoring...')

  xhrInterceptor.intercept({
    // Match Stuff Media API endpoint with source-path parameter
    urlPattern: /\/_\/BardChatUi\/data\/batchexecute\?.*rpcids=jGArJ.*source-path=%2Fmystuff/,

    onResponse: (url: string, responseText: string, status: number) => {
      try {
        console.log('[StuffMonitor Main World] Intercepted Stuff Media response:', {
          url,
          status,
          responseLength: responseText.length,
        })

        // Parse the response using stuffMediaParser
        const mediaData = parseMediaResponse(responseText)

        if (!mediaData) {
          console.warn('[StuffMonitor Main World] Failed to parse media response')
          return
        }

        console.log('[StuffMonitor Main World] Parsed media data:', {
          itemCount: mediaData.items.length,
          nextPageToken: mediaData.nextPageToken,
        })

        // Dispatch event to isolated world with the parsed data
        const eventDetail = {
          items: mediaData.items,
          nextPageToken: mediaData.nextPageToken,
          timestamp: Date.now(),
        }

        window.dispatchEvent(
          new CustomEvent(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, {
            detail: eventDetail,
          })
        )

        console.log('[StuffMonitor Main World] Dispatched event with', mediaData.items.length, 'items')
      } catch (error) {
        console.error('[StuffMonitor Main World] Error processing response:', error)
      }
    },

    onError: (error: Error) => {
      console.error('[StuffMonitor Main World] XHR interception error:', error)
    },
  })

  console.log('[StuffMonitor Main World] Stuff monitoring started successfully')
}
