import { browser } from 'wxt/browser'
import { isStuffMediaRequest, parseMediaResponse } from '@/utils/stuffMediaParser'
import {
  OPEN_IN_NEW_TAB_MESSAGE,
  STUFF_MEDIA_DATA_RECEIVED_MESSAGE,
  isOpenInNewTabMessage,
} from '@/types/runtime-messages'

let hasStarted = false

type OnBeforeRequestListener = Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0]
type OnBeforeRequestDetails = Parameters<OnBeforeRequestListener>[0]
type OnBeforeRequestResult = ReturnType<OnBeforeRequestListener>
type RequestBody = OnBeforeRequestDetails extends { requestBody?: infer T } ? T : never
type OnHeadersReceivedListener = Parameters<typeof browser.webRequest.onHeadersReceived.addListener>[0]
type OnHeadersReceivedDetails = Parameters<OnHeadersReceivedListener>[0]
type OnHeadersReceivedResult = ReturnType<OnHeadersReceivedListener>

type StreamFilter = {
  ondata: ((event: { data: ArrayBuffer }) => void) | null
  onstop: (() => void) | null
  onerror: ((error: unknown) => void) | null
  write: (data: ArrayBuffer) => void
  close: () => void
  disconnect: () => void
}

function extractFReq(requestBody: RequestBody | undefined): string | null {
  if (!requestBody) {
    return null
  }

  const requestBodyFormData = (requestBody as { formData?: Record<string, string[]> }).formData
  const formValue = requestBodyFormData?.['f.req']?.[0]
  if (typeof formValue === 'string') {
    return formValue
  }

  const rawParts = (requestBody as { raw?: Array<{ bytes?: ArrayBuffer }> }).raw ?? []
  const rawBytes = rawParts.find((part: { bytes?: ArrayBuffer }) => part.bytes)?.bytes
  if (!rawBytes) {
    return null
  }

  const rawBody = new TextDecoder().decode(rawBytes)
  const formData = new URLSearchParams(rawBody)
  return formData.get('f.req')
}

function shouldTrackRequest(url: string, fReq: string | null): boolean {
  if (!fReq) {
    return false
  }

  return isStuffMediaRequest(url, { 'f.req': fReq })
}

function shouldTrackByUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.pathname === '/_/BardChatUi/data/batchexecute'
      && urlObj.searchParams.get('rpcids') === 'jGArJ'
      && urlObj.searchParams.get('source-path') === '/mystuff'
  } catch {
    return false
  }
}

function createRequestMonitor() {
  const webRequestApi = browser.webRequest as typeof browser.webRequest & {
    filterResponseData?: (requestId: string) => StreamFilter
  }
  const trackedRequestIds = new Map<string, {
    url: string
    tabId: number
    trackedBy: 'before-request' | 'headers-fallback'
    matchedByBody: boolean
    type?: OnBeforeRequestDetails['type']
    method?: string
    timeStamp?: number
  }>()

  browser.webRequest.onCompleted.addListener((details) => {
    const tracked = trackedRequestIds.get(details.requestId)
    console.log('[FirefoxBackground] request completed', {
      requestId: details.requestId,
      url: details.url,
      tracked: !!tracked,
      trackedBy: tracked?.trackedBy,
      matchedByBody: tracked?.matchedByBody,
      tabId: tracked?.tabId,
      statusCode: details.statusCode,
      fromCache: details.fromCache,
      timeStamp: details.timeStamp,
    })
  }, { urls: ['*://gemini.google.com/_/BardChatUi/data/batchexecute*'] })

  browser.webRequest.onErrorOccurred.addListener((details) => {
    if (!trackedRequestIds.has(details.requestId)) return
    console.log('[FirefoxBackground] request error occurred', {
      requestId: details.requestId,
      url: details.url,
      error: details.error,
      timeStamp: details.timeStamp,
    })
    trackedRequestIds.delete(details.requestId)
  }, { urls: ['*://gemini.google.com/_/BardChatUi/data/batchexecute*'] })

  const onBeforeRequest = (details: OnBeforeRequestDetails): OnBeforeRequestResult => {
    if (details.method && details.method.toUpperCase() !== 'POST') {
      return undefined
    }

    if (!shouldTrackByUrl(details.url)) {
      return undefined
    }

    if (details.tabId == null || details.tabId < 0) {
      return undefined
    }

    const fReq = extractFReq(details.requestBody)
    const matchedByBody = fReq ? shouldTrackRequest(details.url, fReq) : false
    if (fReq && !matchedByBody) {
      return undefined
    }

    trackedRequestIds.set(details.requestId, {
      url: details.url,
      tabId: details.tabId!,
      trackedBy: 'before-request',
      matchedByBody,
      type: details.type,
      method: details.method,
      timeStamp: details.timeStamp,
    })
    console.log('[FirefoxBackground] request tracked', {
      requestId: details.requestId,
      url: details.url,
      tabId: details.tabId,
      type: details.type,
      method: details.method,
      timeStamp: details.timeStamp,
      hasFReq: !!fReq,
      matchedByBody,
    })
    return undefined
  }

  const onHeadersReceived = (details: OnHeadersReceivedDetails): OnHeadersReceivedResult => {
    let tracked = trackedRequestIds.get(details.requestId)
    if (!tracked) {
      if (details.tabId == null || details.tabId < 0) {
        return undefined
      }
      if (!shouldTrackByUrl(details.url)) {
        return undefined
      }
      tracked = {
        url: details.url,
        tabId: details.tabId,
        trackedBy: 'headers-fallback',
        matchedByBody: false,
        timeStamp: details.timeStamp,
      }
      trackedRequestIds.set(details.requestId, tracked)
      console.log('[FirefoxBackground] request tracked by headers fallback', {
        requestId: details.requestId,
        url: details.url,
        tabId: details.tabId,
      })
    }
    if (!webRequestApi.filterResponseData) {
      console.warn('[FirefoxBackground] filterResponseData is unavailable in current runtime')
      return undefined
    }

    let filter: StreamFilter
    try {
      filter = webRequestApi.filterResponseData(details.requestId)
    } catch (error) {
      console.warn('[FirefoxBackground] filterResponseData failed:', error)
      return undefined
    }

    console.log('[FirefoxBackground] filter attached', {
      requestId: details.requestId,
      url: details.url,
      trackedBy: tracked.trackedBy,
      matchedByBody: tracked.matchedByBody,
      statusCode: details.statusCode,
    })

    const decoder = new TextDecoder()
    const chunks: string[] = []
    let totalBytes = 0

    filter.ondata = (event) => {
      filter.write(event.data)
      totalBytes += event.data.byteLength
      chunks.push(decoder.decode(event.data, { stream: true }))
    }

    const cleanup = () => {
      trackedRequestIds.delete(details.requestId)
    }

    const cleanupTimer = setTimeout(() => {
      console.warn('[FirefoxBackground] cleanup timeout reached', {
        requestId: details.requestId,
        url: details.url,
      })
      cleanup()
    }, 30_000)

    filter.onstop = () => {
      try {
        chunks.push(decoder.decode())
        const responseText = chunks.join('')
        console.log('[FirefoxBackground] response captured', {
          requestId: details.requestId,
          url: details.url,
          totalBytes,
          chunkCount: chunks.length,
          responseLength: responseText.length,
        })
        const parsed = parseMediaResponse(responseText)

        if (!parsed) {
          console.log('[FirefoxBackground] response parsed as empty', {
            requestId: details.requestId,
            url: details.url,
          })
          return
        }

        void browser.tabs.sendMessage(tracked.tabId, {
          type: STUFF_MEDIA_DATA_RECEIVED_MESSAGE,
          payload: {
            items: parsed.items,
            nextPageToken: parsed.nextPageToken,
            timestamp: Date.now(),
          },
        }).catch((error) => {
          console.warn('[FirefoxBackground] Failed to send message to content script:', error)
        })
        console.log('[FirefoxBackground] message sent to content script', {
          requestId: details.requestId,
          tabId: tracked.tabId,
          itemCount: parsed.items.length,
          nextPageToken: parsed.nextPageToken,
        })
      } catch (error) {
        console.error('[FirefoxBackground] Failed to parse intercepted response:', error)
      } finally {
        clearTimeout(cleanupTimer)
        cleanup()
        filter.close()
      }
    }

    filter.onerror = (error: unknown) => {
      const event = error as { target?: { error?: string; status?: string } } | null
      const targetError = event?.target?.error
      const targetStatus = event?.target?.status
      if (targetError === 'Invalid request ID') {
        console.log('[FirefoxBackground] Stream filter ignored', {
          requestId: details.requestId,
          url: details.url,
          targetError,
          targetStatus,
        })
        clearTimeout(cleanupTimer)
        cleanup()
        return undefined
      }
      console.error('[FirefoxBackground] Stream filter error:', {
        requestId: details.requestId,
        url: details.url,
        targetError,
        targetStatus,
        raw: error,
      })
      try {
        filter.disconnect()
      } catch {
        // Ignore disconnect errors from already closed stream.
      }
      clearTimeout(cleanupTimer)
      cleanup()
    }

    return undefined
  }

  return { onBeforeRequest, onHeadersReceived }
}

export function startFirefoxBackground(): void {
  if (hasStarted) {
    return
  }

  const { onBeforeRequest, onHeadersReceived } = createRequestMonitor()
  browser.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    {
      urls: ['*://gemini.google.com/_/BardChatUi/data/batchexecute*'],
    },
    ['requestBody'],
  )
  browser.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
      urls: ['*://gemini.google.com/_/BardChatUi/data/batchexecute*'],
    },
    ['blocking'],
  )

  browser.runtime.onMessage.addListener((message) => {
    if (!isOpenInNewTabMessage(message)) {
      return
    }

    const url = message.payload.url
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      console.warn('[FirefoxBackground] Invalid open tab url:', url)
      return
    }

    if (parsed.origin !== 'https://gemini.google.com') {
      console.warn('[FirefoxBackground] Blocked open tab for non-gemini origin:', parsed.origin)
      return
    }

    void browser.tabs.create({ url: parsed.href }).catch((error) => {
      console.warn('[FirefoxBackground] Failed to open new tab:', error)
    })
  })

  hasStarted = true
  console.log('[FirefoxBackground] Stuff media monitor initialized')
}
