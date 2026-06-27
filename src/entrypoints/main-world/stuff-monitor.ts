/**
 * Stuff Page Monitor (Main World)
 * 
 * Intercepts Stuff Media API requests in the main world (page context)
 * and dispatches events to the isolated world for processing.
 * 
 * This script runs in the page context to access real XHR requests.
 */

import { xhrInterceptor, type XHRRequestSnapshot } from '@/utils/xhrInterceptor'
import { parseMediaResponse } from '@/utils/stuffMediaParser'
import { GEM_EXT_EVENTS } from '@/common/event'

const STUFF_MEDIA_BATCH_URL_PATTERN = /\/_\/BardChatUi\/data\/batchexecute\?.*rpcids=jGArJ.*source-path=%2Flibrary/

function isSupportedStuffPagePath(pathname: string): boolean {
  return pathname === '/library' || pathname.startsWith('/library/')
}

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
      // Match Stuff Media API endpoint with source-path parameter.
      urlPattern: STUFF_MEDIA_BATCH_URL_PATTERN,

      onResponse: (url: string, responseText: string, status: number, requestSnapshot: XHRRequestSnapshot) => {
        try {
          // url: "/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Flibrary&bl=boq_assistant-bard-web-server_20260625.12_p1&f.sid=8667359588762092056&hl=en&_reqid=7860267&rt=c"
          const requestURL = new URL(requestSnapshot.url, window.location.origin)
          const sourcePath = requestURL.searchParams.get('source-path')
          console.log('[StuffMonitor Main World] Intercepted Stuff Media response:', {
            url,
            requestURL: requestURL.toString(),
            sourcePath,
            status,
            responseLength: responseText.length,
            requestSnapshot,
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
    // Match the Gemini library media pages.
    const isStuffPage = isSupportedStuffPagePath(pathname)

    if (isStuffPage) {
      console.log('[StuffMonitor Main World] Supported library page detected:', pathname)
      startIntercept()
    } else {
      if (unregisterInterceptor) {
        console.log('[StuffMonitor Main World] Leaving supported library page:', pathname)
      }
      stopIntercept()
    }
  }

  // Monitor URL changes using the existing event from url-monitor-main-world
  window.addEventListener(GEM_EXT_EVENTS.URL_CHANGE, checkUrl)

  // Initial check
  checkUrl()
}
