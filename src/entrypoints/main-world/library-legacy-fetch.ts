import { GEM_EXT_EVENTS } from '@/common/event'
import { fetchInterceptor, type FetchRequestSnapshot } from '@/utils/fetchInterceptor'
import { MAX_LIBRARY_RESPONSE_BYTES } from '@/utils/library/mediaParser'
import { logLibraryTrace } from '@/utils/library/logger'
import { isStuffMediaRequestUrl, parseMediaResponse, type MediaItem } from '@/utils/stuffMediaParser'

const MAX_REPLAY_ITEMS = 500
const REPLAY_TTL_MS = 60_000

/** Legacy Library also uses Fetch; keep early responses until content listeners mount. */
export function startLegacyLibraryFetchMonitor(): () => void {
  const records = new Map<string, { item: MediaItem; receivedAt: number }>()
  const capturedRequests = new WeakSet<FetchRequestSnapshot>()
  let active = true

  const prune = (): void => {
    for (const [key, record] of records) {
      if (Date.now() - record.receivedAt >= REPLAY_TTL_MS) records.delete(key)
    }
  }
  const dispatch = (items: MediaItem[]): void => {
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, {
      detail: { items, timestamp: Date.now() },
    }))
  }
  const capture = (text: string, request: FetchRequestSnapshot): void => {
    if (!active || capturedRequests.has(request) || text.length > MAX_LIBRARY_RESPONSE_BYTES) return
    const data = parseMediaResponse(text)
    if (!data) return
    capturedRequests.add(request)
    prune()
    for (const item of data.items) {
      const key = JSON.stringify([item.conversationId, item.responseId])
      records.delete(key)
      records.set(key, { item, receivedAt: Date.now() })
      while (records.size > MAX_REPLAY_ITEMS) {
        const oldest = records.keys().next().value
        if (oldest === undefined) break
        records.delete(oldest)
      }
    }
    logLibraryTrace('main:legacy-dispatch', () => ({ items: data.items.length }))
    dispatch(data.items)
  }
  const replay = (): void => {
    prune()
    if (records.size) dispatch(Array.from(records.values(), ({ item }) => item))
  }
  const unregister = fetchInterceptor.intercept({
    matches: (request) => request.method === 'POST' && isStuffMediaRequestUrl(request.url),
    maxBodyBytes: MAX_LIBRARY_RESPONSE_BYTES,
    onConsumedBody: (text, response, request) => {
      if (response.ok) capture(text, request)
    },
    onResponse: async (response, request) => {
      if (!active || !response.ok) return
      try {
        capture(await response.text(), request)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError' && capturedRequests.has(request)) return
        throw error
      }
    },
    onError: (error) => {
      console.warn('[LibraryMonitor] Failed to capture legacy media response:', error)
    },
  })
  window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST, replay)
  return () => {
    active = false
    unregister()
    window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST, replay)
    records.clear()
  }
}
