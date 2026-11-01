import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEM_EXT_EVENTS } from '@/common/event'
import type { XHRInterceptorConfig, XHRRequestSnapshot } from '@/utils/xhrInterceptor'

const mock = vi.hoisted(() => ({ config: undefined as XHRInterceptorConfig | undefined, unregister: vi.fn() }))
vi.mock('@/utils/xhrInterceptor', () => ({ xhrInterceptor: {
  intercept: (config: XHRInterceptorConfig) => { mock.config = config; return mock.unregister },
} }))
import { startChatDeleteMonitor } from './chat-delete-monitor'

const acknowledgement = `)]}'\n${JSON.stringify([['wrb.fr', 'GzXR5e', '[]', null, null, null, 'generic']])}`
const nativeFetch = vi.fn<typeof fetch>()
const request = (conversationId = 'c_abc123', accountPath = ''): XHRRequestSnapshot => ({
  requestId: 'delete-1', method: 'POST',
  url: `https://gemini.google.com${accountPath}/_/BardChatUi/data/batchexecute?rpcids=GzXR5e`,
  body: new URLSearchParams({ 'f.req': JSON.stringify([[['GzXR5e', JSON.stringify([conversationId]), null, 'generic']]]) }).toString(),
})
let stop: () => void
let events: unknown[]
const observe = (event: Event) => events.push((event as CustomEvent<unknown>).detail)
const respond = (snapshot = request(), status = 200, body = acknowledgement) => {
  mock.config!.onResponse!(snapshot.url, body, status, snapshot)
}

beforeEach(() => {
  window.history.replaceState({}, '', '/app')
  events = []
  nativeFetch.mockReset().mockImplementation(async () => new Response(acknowledgement))
  vi.stubGlobal('fetch', nativeFetch)
  window.addEventListener(GEM_EXT_EVENTS.CHAT_DELETED, observe)
  stop = startChatDeleteMonitor()
})
afterEach(() => {
  stop()
  window.removeEventListener(GEM_EXT_EVENTS.CHAT_DELETED, observe)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('confirmed native chat deletion', () => {
  it('observes XHR success with the request chat ID and account', () => {
    window.history.replaceState({}, '', '/u/2/app')
    respond(request('c_abc123', '/u/2'))
    expect(events).toEqual([{ accountPath: '/u/2', conversationId: 'c_abc123' }])
  })

  it.each([0, 403, 500])('ignores failed XHR status %s', (status) => {
    respond(request(), status)
    expect(events).toEqual([])
  })

  it('requires the delete acknowledgement even for HTTP 200', () => {
    expect(() => respond(request(), 200, '[]')).toThrow('acknowledgement missing')
    expect(events).toEqual([])
  })

  it('rejects unrelated, malformed and ambiguous requests', () => {
    const original = request()
    const bodies = ['bad', 'f.req=bad', new URLSearchParams({ 'f.req': JSON.stringify([[
      ['GzXR5e', '["c_abc123"]'], ['GzXR5e', '["c_def456"]'],
    ]]) }).toString()]
    for (const body of bodies) respond({ ...original, body })
    respond(request('invalid'))
    respond({ ...original, method: 'GET' })
    respond({ ...original, url: original.url.replace('gemini.google.com', 'other.test') })
    respond({ ...original, url: original.url.replace('batchexecute', 'other') })
    respond(request('c_abc123', '/u/2'))
    expect(events).toEqual([])
  })

  it('pairs concurrent Fetch responses with their own request bodies', async () => {
    let finish!: (response: Response) => void
    nativeFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const first = request('c_abc123')
    const second = request('c_def456')
    const pending = window.fetch(first.url, { method: 'POST', body: String(first.body) })
    expect(events).toEqual([])
    const response = await window.fetch(second.url, { method: 'POST', body: String(second.body) })
    await vi.waitFor(() => expect(events).toEqual([{ accountPath: '', conversationId: 'c_def456' }]))
    expect(await response.text()).toBe(acknowledgement)
    finish(new Response(acknowledgement))
    await pending
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[1]).toEqual({ accountPath: '', conversationId: 'c_abc123' })
  })

  it('reads a Request clone before Gemini consumes its body', async () => {
    nativeFetch.mockImplementation(async (input) => {
      expect(await (input as Request).text()).toBe(request().body)
      return new Response(acknowledgement)
    })
    await window.fetch(new Request(request().url, { method: 'POST', body: String(request().body) }))
    await vi.waitFor(() => expect(events).toHaveLength(1))
  })

  it('retains Folder indexes on network, HTTP and acknowledgement failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    nativeFetch.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(acknowledgement, { status: 500 }))
      .mockResolvedValueOnce(new Response('[]'))
    const send = () => window.fetch(request().url, { method: 'POST', body: String(request().body) })
    await expect(send()).rejects.toThrow('offline')
    await send()
    await send()
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledTimes(2))
    expect(events).toEqual([])
  })

  it.each(['account switch', 'stop'])('ignores a late Fetch response after %s', async (action) => {
    let finish!: (response: Response) => void
    nativeFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = window.fetch(request().url, { method: 'POST', body: String(request().body) })
    if (action === 'stop') stop()
    else window.history.replaceState({}, '', '/u/2/app')
    finish(new Response(acknowledgement))
    const response = await pending
    await response.text()
    expect(events).toEqual([])
  })

  it('unregisters on pagehide and ignores stale XHR callbacks', () => {
    window.dispatchEvent(new Event('pagehide'))
    respond()
    expect(events).toEqual([])
    expect(window.fetch).toBe(nativeFetch)
    expect(mock.unregister).toHaveBeenCalled()
  })
})
