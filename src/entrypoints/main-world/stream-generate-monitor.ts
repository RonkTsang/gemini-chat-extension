import { GEM_EXT_EVENTS } from '@/common/event'
import { xhrInterceptor } from '@/utils/xhrInterceptor'
import { fetchInterceptor } from '@/utils/fetchInterceptor'
import { isStreamGenerateUrl, parseStreamGenerateRequest, StreamGenerateDecoder } from '@/utils/streamGenerate'
import type { StreamGenerateObservation } from '@/utils/streamGenerateProtocol'

const REQUEST_TIMEOUT_MS = 120_000
const INTENT_TIMEOUT_MS = 30 * 60_000

/** Observe existing-chat sends and explicitly claimed new-chat responses. */
export function startStreamGenerateMonitor(): () => void {
  let active = true
  let armed: { token: string; accountPath: string; expiresAt: number } | undefined
  const requests = new Map<string, {
    token: string
    decoder: StreamGenerateDecoder
    conversationId?: string
    title?: string
    timer: ReturnType<typeof setTimeout>
  }>()
  const emit = (observation: StreamGenerateObservation) => {
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, { detail: observation }))
  }
  const release = (requestId: string) => {
    const request = requests.get(requestId)
    if (!request) return
    clearTimeout(request.timer)
    requests.delete(requestId)
  }
  const capture = (requestId: string, chunk: string, final = false) => {
    const request = requests.get(requestId)
    if (!request) return
    for (const metadata of request.decoder.push(chunk, final)) {
      if (request.conversationId && request.conversationId !== metadata.conversationId) continue
      if (request.conversationId === metadata.conversationId && (!metadata.title || metadata.title === request.title)) continue
      request.conversationId = metadata.conversationId
      request.title = metadata.title ?? request.title
      emit({ token: request.token, requestId, phase: 'metadata', ...metadata })
    }
  }
  const control = (event: Event) => {
    const data: unknown = (event as CustomEvent<unknown>).detail
    if (!data || typeof data !== 'object') return
    const command = data as Record<string, unknown>
    if (typeof command.token !== 'string' || command.token.length > 100) return
    if (command.action === 'arm' && typeof command.accountPath === 'string'
      && /^(?:\/u\/\d+)?$/u.test(command.accountPath)) {
      armed = { token: command.token, accountPath: command.accountPath, expiresAt: Date.now() + INTENT_TIMEOUT_MS }
      emit({ token: command.token, phase: 'armed' })
    } else if (command.action === 'cancel') {
      if (armed?.token === command.token) armed = undefined
      for (const [id, request] of requests) if (request.token === command.token) release(id)
    }
  }
  const observeRequest = (request: { requestId?: string; method: string; url: string; body?: unknown }): void => {
    if (!active) return
    if (document.querySelector('chat-window')?.classList.contains('is-temporary-chat')) return
    if (request.method.toUpperCase() !== 'POST' || !isStreamGenerateUrl(request.url)) return
    const requestPath = new URL(request.url, location.origin).pathname.match(/^\/u\/\d+(?=\/)/u)?.[0] ?? ''
    const parsedRequest = parseStreamGenerateRequest(request.body)
    const accountPath = location.pathname.match(/^\/u\/\d+(?=\/|$)/u)?.[0] ?? ''
    if (requestPath !== accountPath || !parsedRequest) return
    if (parsedRequest.conversationId) {
      window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_ACTIVITY, {
        detail: { accountPath, conversationId: parsedRequest.conversationId },
      }))
      return
    }
    // New-chat response capture requires an XHR request identity.
    const requestId = request.requestId
    if (!requestId || !armed || Date.now() >= armed.expiresAt || requests.size >= 4 || armed.accountPath !== accountPath
      || location.pathname !== `${accountPath}/app`) return
    const token = armed.token
    armed = undefined
    const timer = setTimeout(() => {
      emit({ token, requestId, phase: 'finished' })
      release(requestId)
    }, REQUEST_TIMEOUT_MS)
    requests.set(requestId, { token, decoder: new StreamGenerateDecoder(), timer })
    emit({ token, requestId, phase: 'started', ...(parsedRequest.prompt ? { prompt: parsedRequest.prompt } : {}) })
  }
  const unregisterFetch = fetchInterceptor.intercept({
    matches: (request) => isStreamGenerateUrl(request.url),
    onRequest: (request, input, init) => {
      if (init?.body !== undefined || !(input instanceof Request)) {
        observeRequest({ ...request, body: init?.body })
        return
      }
      void input.clone().text()
        .then((body) => observeRequest({ ...request, body }))
        .catch((error: unknown) => console.warn('[StreamGenerate] Request body observation failed', error))
    },
    onError: (error) => console.warn('[StreamGenerate] Observation failed', error),
  })
  const unregister = xhrInterceptor.intercept({
    urlPattern: /\/StreamGenerate(?:\?|$)/u,
    onRequestSnapshot: observeRequest,
    onProgress: (chunk, request) => capture(request.requestId, chunk),
    onSettled: (request) => {
      const captured = requests.get(request.requestId)
      if (!captured) return
      capture(request.requestId, '', true)
      emit({ token: captured.token, requestId: request.requestId, phase: 'finished' })
      release(request.requestId)
    },
    onError: (error) => console.warn('[StreamGenerate] Observation failed', error),
  })
  window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, control)
  const stop = () => {
    active = false
    armed = undefined
    for (const id of requests.keys()) release(id)
    unregister()
    unregisterFetch()
    window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, control)
    window.removeEventListener('pagehide', stop)
  }
  window.addEventListener('pagehide', stop)
  return stop
}
