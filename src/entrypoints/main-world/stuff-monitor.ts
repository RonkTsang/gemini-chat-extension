/**
 * Stuff Page Monitor (Main World)
 * 
 * Intercepts Stuff Media API requests in the main world (page context)
 * and dispatches events to the isolated world for processing.
 * 
 * This script runs in the page context to access real XHR requests.
 */

import { xhrInterceptor, type XHRRequestSnapshot } from '@/utils/xhrInterceptor'
import { parseMediaResponse, isStuffMediaRequest, type MediaItem } from '@/utils/stuffMediaParser'
import { GEM_EXT_EVENTS } from '@/common/event'

/**
 * Start monitoring Stuff Media API requests
 */
export function startStuffMonitor(): void {
  console.log('[StuffMonitor Main World] Initializing Stuff page monitoring...')

  let unregisterInterceptor: (() => void) | null = null

  const startIntercept = () => {
    if (unregisterInterceptor) return

    console.log('[StuffMonitor Main World] Starting Stuff page monitoring...')

    unregisterInterceptor = xhrInterceptor.intercept({
      // Match Stuff Media API endpoint with source-path parameter
      urlPattern: /\/_\/BardChatUi\/data\/batchexecute\?.*rpcids=jGArJ.*source-path=%2Fmystuff/,

      onResponse: (url: string, responseText: string, status: number, requestSnapshot: XHRRequestSnapshot) => {
        try {
          // url: "/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff&bl=boq_assistant-bard-web-server_20260121.00_p1&f.sid=1945670880997184523&hl=en&_reqid=311373&rt=c"
          const requestURL = new URL(requestSnapshot.url, window.location.origin)
          console.log('[StuffMonitor Main World] Intercepted Stuff Media response:', {
            url,
            requestURL: requestURL.toString(),
            status,
            responseLength: responseText.length,
            requestSnapshot,
          })

          if (typeof requestSnapshot.body !== 'string') {
            return
          }

          const formData = new URLSearchParams(requestSnapshot.body)

          const isStuffReq = isStuffMediaRequest(requestURL.toString(), {
            'f.req': formData.get('f.req') || '',
          })

          if (!isStuffReq) {
            return
          }

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

    console.log('[StuffMonitor Main World] monitoring started')
  }

  const stopIntercept = () => {
    if (unregisterInterceptor) {
      console.log('[StuffMonitor Main World] Stopping Stuff page monitoring...')
      unregisterInterceptor()
      unregisterInterceptor = null
    }
  }

  const checkUrl = () => {
    const pathname = window.location.pathname
    // Match /mystuff or /mystuff/xx
    const isStuffPage = pathname === '/mystuff' || pathname.startsWith('/mystuff/')

    if (isStuffPage) {
      startIntercept()
    } else {
      stopIntercept()
    }
  }

  // Monitor URL changes using the existing event from url-monitor-main-world
  window.addEventListener(GEM_EXT_EVENTS.URL_CHANGE, checkUrl)

  // Initial check
  checkUrl()
}
