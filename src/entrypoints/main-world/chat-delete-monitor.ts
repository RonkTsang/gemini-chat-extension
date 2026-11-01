import { GEM_EXT_EVENTS } from '@/common/event'
import { parseDeleteConversationResponse } from '@/integrations/gemini-rpc/operations'
import { fetchInterceptor, type FetchRequestSnapshot } from '@/utils/fetchInterceptor'
import { xhrInterceptor } from '@/utils/xhrInterceptor'

const ENDPOINT = /^(?:\/u\/\d+)?\/_\/BardChatUi\/data\/batchexecute$/u
interface ChatDeletion { accountPath: string; conversationId: string }

function parseDeletion(request: FetchRequestSnapshot, body: unknown): ChatDeletion | undefined {
  const url = new URL(request.url, location.href)
  if (request.method.toUpperCase() !== 'POST' || url.origin !== 'https://gemini.google.com'
    || !ENDPOINT.test(url.pathname)) return
  const accountPath = url.pathname.match(/^\/u\/\d+(?=\/)/u)?.[0] ?? ''
  if (accountPath !== getAccountPath()) return
  const form = typeof body === 'string' ? new URLSearchParams(body) : body
  if (!(form instanceof URLSearchParams) && !(form instanceof FormData)) return
  const value = form.get('f.req')
  if (typeof value !== 'string') return
  try {
    const batches: unknown = JSON.parse(value)
    if (!Array.isArray(batches) || !batches.every(Array.isArray)) return
    const operations: unknown[] = batches.flat()
    const deletions = operations.filter((entry): entry is unknown[] => Array.isArray(entry) && entry[0] === 'GzXR5e')
    // The acknowledgement has no chat ID; multiple deletes cannot be paired safely.
    if (deletions.length !== 1 || typeof deletions[0][1] !== 'string') return
    const args: unknown = JSON.parse(deletions[0][1])
    if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== 'string' || !/^c_[a-f0-9]+$/u.test(args[0])) return
    return { accountPath, conversationId: args[0] }
  } catch {
    return undefined
  }
}

function getAccountPath(): string {
  return location.pathname.match(/^\/u\/\d+(?=\/|$)/u)?.[0] ?? ''
}

/** Observe native deletes without issuing, delaying or retrying Gemini requests. */
export function startChatDeleteMonitor(): () => void {
  let active = true
  const requests = new WeakMap<FetchRequestSnapshot, Promise<ChatDeletion | undefined>>()
  const confirm = (deletion: ChatDeletion | undefined, status: number, body: string) => {
    if (!active || !deletion || status < 200 || status >= 300 || deletion.accountPath !== getAccountPath()) return
    parseDeleteConversationResponse(body)
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.CHAT_DELETED, { detail: deletion }))
  }
  const reportError = (error: unknown) => console.warn('[Folders] Could not confirm observed Gemini deletion', error)
  const unregisterFetch = fetchInterceptor.intercept({
    matches: ({ url }) => {
      const parsed = new URL(url)
      return parsed.origin === 'https://gemini.google.com' && ENDPOINT.test(parsed.pathname)
        && parsed.searchParams.get('rpcids')?.split(',').includes('GzXR5e') === true
    },
    onRequest: (request, input, init) => {
      const deletion = init?.body === undefined && input instanceof Request
        ? input.clone().text().then((body) => parseDeletion(request, body))
        : Promise.resolve(parseDeletion(request, init?.body))
      requests.set(request, deletion.catch((error: unknown) => { reportError(error); return undefined }))
    },
    onResponse: async (response, request) => {
      const deletion = await requests.get(request)
      if (!active || !deletion || !response.ok) return
      confirm(deletion, response.status, await response.text())
    },
    onError: reportError,
  })
  const unregisterXhr = xhrInterceptor.intercept({
    urlPattern: /\/_\/BardChatUi\/data\/batchexecute(?:\?|$)/u,
    onResponse: (_url, body, status, request) => confirm(parseDeletion(request, request.body), status, body),
    onError: reportError,
  })
  const stop = () => {
    active = false
    unregisterFetch()
    unregisterXhr()
    window.removeEventListener('pagehide', stop)
  }
  window.addEventListener('pagehide', stop)
  return stop
}
