import { browser } from 'wxt/browser'
import { isStuffMediaRequest, parseMediaResponse } from '@/utils/stuffMediaParser'
import {
  STUFF_MEDIA_DATA_RECEIVED_MESSAGE,
} from '@/types/runtime-messages'

let hasStarted = false

type OnBeforeRequestListener = Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0]
type OnBeforeRequestDetails = Parameters<OnBeforeRequestListener>[0]
type OnBeforeRequestResult = ReturnType<OnBeforeRequestListener>
type RequestBody = OnBeforeRequestDetails extends { requestBody?: infer T } ? T : never

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

function createRequestListener() {
  const webRequestApi = browser.webRequest as typeof browser.webRequest & {
    filterResponseData?: (requestId: string) => StreamFilter
  }

  return (details: OnBeforeRequestDetails): OnBeforeRequestResult => {
    const fReq = extractFReq(details.requestBody)
    if (!shouldTrackRequest(details.url, fReq)) {
      return undefined
    }

    if (details.tabId == null || details.tabId < 0) {
      return undefined
    }

    if (!webRequestApi.filterResponseData) {
      console.warn('[FirefoxBackground] filterResponseData is unavailable in current runtime')
      return undefined
    }

    const filter = webRequestApi.filterResponseData(details.requestId)
    const decoder = new TextDecoder()
    const chunks: string[] = []

    filter.ondata = (event) => {
      filter.write(event.data)
      chunks.push(decoder.decode(event.data, { stream: true }))
    }

    filter.onstop = () => {
      try {
        chunks.push(decoder.decode())
        const responseText = chunks.join('')
        const parsed = parseMediaResponse(responseText)

        if (!parsed) {
          return
        }

        void browser.tabs.sendMessage(details.tabId!, {
          type: STUFF_MEDIA_DATA_RECEIVED_MESSAGE,
          payload: {
            items: parsed.items,
            nextPageToken: parsed.nextPageToken,
            timestamp: Date.now(),
          },
        }).catch((error) => {
          console.warn('[FirefoxBackground] Failed to send message to content script:', error)
        })
      } catch (error) {
        console.error('[FirefoxBackground] Failed to parse intercepted response:', error)
      } finally {
        filter.close()
      }
    }

    filter.onerror = (error: unknown) => {
      console.error('[FirefoxBackground] Stream filter error:', error)
      try {
        filter.disconnect()
      } catch {
        // Ignore disconnect errors from already closed stream.
      }
    }

    return undefined
  }
}

export function startFirefoxBackground(): void {
  if (hasStarted) {
    return
  }

  const requestListener = createRequestListener()
  browser.webRequest.onBeforeRequest.addListener(
    requestListener,
    {
      urls: ['*://gemini.google.com/_/BardChatUi/data/batchexecute*'],
    },
    ['requestBody'],
  )

  hasStarted = true
  console.log('[FirefoxBackground] Stuff media monitor initialized')
}
