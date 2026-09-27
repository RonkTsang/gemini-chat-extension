import { GEM_EXT_EVENTS } from '@/common/event'
import { fetchInterceptor, type FetchRequestSnapshot } from '@/utils/fetchInterceptor'
import { LibraryMediaCache } from '@/utils/library/mediaCache'
import { isLibraryMediaRequest, inspectLibraryMediaResponse, MAX_LIBRARY_RESPONSE_BYTES } from '@/utils/library/mediaParser'
import { logLibraryTrace } from '@/utils/library/logger'

export function startLibraryMonitor(): () => void {
  const replayCache = new LibraryMediaCache(500, 60_000)
  const capturedRequests = new WeakSet<FetchRequestSnapshot>()
  let active = true

  const capture = (text: string, request: FetchRequestSnapshot, source: string): void => {
    if (!active || capturedRequests.has(request)) return
    const { items, ...diagnostics } = inspectLibraryMediaResponse(text)
    logLibraryTrace('main:parsed', () => ({ ...diagnostics, source, responseLength: text.length,
      items: items?.length ?? 0, thumbnails: items?.filter((item) => item.thumbnailUrl).length ?? 0 }))
    if (!items) return
    capturedRequests.add(request)
    const timestamp = Date.now()
    replayCache.addItems(items, timestamp)
    logLibraryTrace('main:dispatch', () => ({ timestamp, items: items.length, source }))
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, {
      detail: { items, timestamp },
    }))
  }

  const replay = () => {
    const items = replayCache.getItems()
    logLibraryTrace('main:replay', () => ({ items: items.length, fetchWrapperIsCurrent: fetchInterceptor.ownsFetch }))
    if (items.length) {
      window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, {
        detail: { items, timestamp: Date.now() },
      }))
    }
  }

  const unregister = fetchInterceptor.intercept({
    matches: (request) => isLibraryMediaRequest(request.url),
    onRequest: (request) => {
      logLibraryTrace('main:request', () => ({ method: request.method, path: new URL(request.url).pathname }))
    },
    maxBodyBytes: MAX_LIBRARY_RESPONSE_BYTES,
    onBodyRead: (_request, source) => {
      logLibraryTrace('main:page-body-read', () => ({ source }))
    },
    onConsumedBody: (text, response, request, source) => {
      logLibraryTrace('main:page-body-observed', () => ({ source,
        complete: source !== 'stream-interrupted', responseLength: text.length }))
      if (response.ok && request.method === 'GET') capture(text, request, `page-${source}`)
    },
    onResponse: async (response, request) => {
      logLibraryTrace('main:response', () => ({ status: response.status, method: request.method }))
      if (!active || !response.ok || request.method !== 'GET') {
        logLibraryTrace('main:response-skipped', () => ({ active, ok: response.ok, method: request.method }))
        return
      }
      try {
        capture(await response.text(), request, 'clone')
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logLibraryTrace('main:clone-aborted', () => ({ recovered: capturedRequests.has(request) }))
          if (capturedRequests.has(request)) return
        }
        throw error
      }
    },
    onError: (error) => {
      logLibraryTrace('main:error', () => ({ name: error instanceof Error ? error.name : typeof error }))
      console.warn('[LibraryMonitor] Failed to capture media response:', error)
    },
  })

  logLibraryTrace('main:monitor-start', () => ({ pathname: window.location.pathname,
    subscribers: fetchInterceptor.count, fetchWrapperIsCurrent: fetchInterceptor.ownsFetch }))

  window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST, replay)

  return () => {
    active = false
    logLibraryTrace('main:monitor-stop', () => ({}))
    unregister()
    window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST, replay)
    replayCache.clear()
  }
}
