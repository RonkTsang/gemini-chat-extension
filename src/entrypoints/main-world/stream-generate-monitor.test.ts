import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEM_EXT_EVENTS } from '@/common/event'
import type { XHRInterceptorConfig, XHRRequestSnapshot } from '@/utils/xhrInterceptor'
import type { StreamGenerateObservation } from '@/utils/streamGenerateProtocol'

const mock = vi.hoisted(() => ({ config: undefined as XHRInterceptorConfig | undefined, unregister: vi.fn() }))
vi.mock('@/utils/xhrInterceptor', () => ({ xhrInterceptor: {
  intercept: (config: XHRInterceptorConfig) => { mock.config = config; return mock.unregister },
} }))
import { startStreamGenerateMonitor } from './stream-generate-monitor'

let stop: () => void
let observations: StreamGenerateObservation[]
let activities: unknown[]
const nativeFetch = vi.fn<typeof fetch>()
const observe = (event: Event) => observations.push((event as CustomEvent<StreamGenerateObservation>).detail)
const observeActivity = (event: Event) => activities.push((event as CustomEvent<unknown>).detail)
const arm = (token: string) => window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, { detail: { action: 'arm', token, accountPath: '' } }))
const request = (requestId: string, conversation: unknown = null): XHRRequestSnapshot => ({
  requestId, method: 'POST', url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
  body: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify([['prompt'], ['en'], conversation])]) }).toString(),
})
const frame = (title?: string) => `${JSON.stringify([['wrb.fr', null, JSON.stringify([null, ['c_abc123'], title ? { '11': [title] } : {}])]])}\n`
beforeEach(() => {
  vi.stubGlobal('fetch', nativeFetch)
  nativeFetch.mockReset().mockResolvedValue(new Response('done'))
  observations = []
  activities = []
  window.history.replaceState({}, '', '/app')
  document.body.innerHTML = '<chat-window></chat-window>'
  window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, observe)
  window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_ACTIVITY, observeActivity)
  stop = startStreamGenerateMonitor()
})
afterEach(() => {
  stop()
  window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, observe)
  window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_ACTIVITY, observeActivity)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('StreamGenerate intent observation', () => {
  it('observes a real Fetch send before its response without cloning or consuming that response', async () => {
    const existing = request('fetch', ['c_abc123'])
    const response = new Response('native response')
    const clone = vi.spyOn(response, 'clone')
    const promise = Promise.resolve(response)
    nativeFetch.mockReturnValue(promise)
    const init = { method: 'POST', body: String(existing.body) }
    const pending = window.fetch(existing.url, init)
    expect(pending).toBe(promise)
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }])
    expect(nativeFetch).toHaveBeenCalledExactlyOnceWith(existing.url, init)
    expect(await pending).toBe(response)
    expect(clone).not.toHaveBeenCalled()
    expect(await response.text()).toBe('native response')
    expect(observations).toEqual([])
  })

  it('reads a Request clone even when native Fetch immediately consumes the original body', async () => {
    const existing = request('fetch', ['c_abc123'])
    let sentBody: string | undefined
    nativeFetch.mockImplementation(async (input) => {
      sentBody = await (input as Request).text()
      return new Response('done')
    })
    const input = new Request(existing.url, { method: 'POST', body: String(existing.body) })
    await window.fetch(input)
    await vi.waitFor(() => expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }]))
    expect(sentBody).toBe(existing.body)
  })

  it('keeps Fetch activity after network failure and stops observing after cleanup', async () => {
    const existing = request('fetch', ['c_abc123'])
    const error = new Error('Network failed')
    nativeFetch.mockRejectedValueOnce(error)
    const init = { method: 'POST', body: String(existing.body) }
    await expect(window.fetch(existing.url, init)).rejects.toBe(error)
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }])
    stop()
    expect(window.fetch).toBe(nativeFetch)
    await window.fetch(existing.url, init)
    expect(activities).toHaveLength(1)
  })

  it('does not consume a new-chat intent or observe temporary chats through Fetch', async () => {
    arm('intent-a')
    await window.fetch(request('new').url, { method: 'POST', body: String(request('new').body) })
    const existing = request('existing', ['c_abc123'])
    document.querySelector('chat-window')!.classList.add('is-temporary-chat')
    await window.fetch(existing.url, { method: 'POST', body: String(existing.body) })
    expect(activities).toEqual([])
    document.querySelector('chat-window')!.classList.remove('is-temporary-chat')
    mock.config!.onRequestSnapshot!(request('xhr-new'))
    expect(observations.at(-1)).toMatchObject({ token: 'intent-a', phase: 'started', requestId: 'xhr-new' })
  })

  it('emits existing-chat activity at send time without waiting for or processing the response', () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/app/abc123')
    const existing = request('existing', ['c_abc123'])
    mock.config!.onRequestSnapshot!(existing)
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }])
    expect(vi.getTimerCount()).toBe(0)
    const unrelated = `${JSON.stringify([['wrb.fr', null, JSON.stringify([null, ['c_def456']])]])}\n`
    mock.config!.onProgress!(unrelated, existing)
    mock.config!.onProgress!(frame(), existing)
    mock.config!.onProgress!(frame('Later title'), existing)
    mock.config!.onSettled!(existing, 200)
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }])
    expect(observations).toEqual([])
  })

  it.each([0, 500])('promotes a sent request even when it later fails with status %s', (status) => {
    const existing = request('failed', ['c_abc123'])
    mock.config!.onRequestSnapshot!(existing)
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_abc123' }])
    mock.config!.onSettled!(existing, status)
    expect(activities).toHaveLength(1)
  })

  it('checks the account path when sending and does not limit existing-chat activity to four requests', () => {
    window.history.replaceState({}, '', '/u/2/app/abc123')
    const existing = { ...request('existing', ['c_abc123']),
      url: 'https://gemini.google.com/u/2/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate' }
    mock.config!.onRequestSnapshot!(request('wrong-account', ['c_abc123']))
    mock.config!.onProgress!(frame(), request('wrong-account', ['c_abc123']))
    expect(activities).toEqual([])
    mock.config!.onRequestSnapshot!(existing)
    expect(activities).toEqual([{ accountPath: '/u/2', conversationId: 'c_abc123' }])
    window.history.replaceState({}, '', '/u/3/app')
    mock.config!.onProgress!(frame(), existing)
    expect(activities).toEqual([{ accountPath: '/u/2', conversationId: 'c_abc123' }])
    window.history.replaceState({}, '', '/u/2/app')
    for (let index = 0; index < 5; index++) mock.config!.onRequestSnapshot!({ ...existing, requestId: `request-${index}` })
    expect(activities).toHaveLength(6)
  })

  it('ignores temporary and malformed existing-chat requests', () => {
    document.querySelector('chat-window')!.classList.add('is-temporary-chat')
    const existing = request('temporary', ['c_abc123'])
    mock.config!.onRequestSnapshot!(existing)
    mock.config!.onProgress!(frame(), existing)
    document.querySelector('chat-window')!.classList.remove('is-temporary-chat')
    mock.config!.onRequestSnapshot!({ ...existing, body: 'bad' })
    mock.config!.onRequestSnapshot!({ ...existing, method: 'GET' })
    mock.config!.onRequestSnapshot!({ ...existing, url: 'https://other.test/StreamGenerate' })
    mock.config!.onProgress!(frame(), existing)
    expect(activities).toEqual([])
  })

  it('claims exactly one creation request and emits early ID followed by late title', () => {
    arm('intent-a')
    mock.config!.onRequestSnapshot!(request('existing', ['c_def123']))
    const first = request('first')
    mock.config!.onRequestSnapshot!(first)
    mock.config!.onRequestSnapshot!(request('second'))
    mock.config!.onProgress!(frame(), request('second'))
    mock.config!.onProgress!(frame(), first)
    mock.config!.onProgress!(frame(), first)
    mock.config!.onProgress!(frame('Title'), first)
    mock.config!.onSettled!(first, 200)
    expect(observations).toEqual([
      { token: 'intent-a', phase: 'armed' },
      { token: 'intent-a', phase: 'started', requestId: 'first', prompt: 'prompt' },
      { token: 'intent-a', phase: 'metadata', requestId: 'first', conversationId: 'c_abc123' },
      { token: 'intent-a', phase: 'metadata', requestId: 'first', conversationId: 'c_abc123', title: 'Title' },
      { token: 'intent-a', phase: 'finished', requestId: 'first' },
    ])
    expect(activities).toEqual([{ accountPath: '', conversationId: 'c_def123' }])
  })
  it('cancels the claimed request without consuming a new target', () => {
    arm('intent-a')
    const first = request('first')
    mock.config!.onRequestSnapshot!(first)
    arm('intent-b')
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, { detail: { action: 'cancel', token: 'intent-a' } }))
    mock.config!.onProgress!(frame(), first)
    mock.config!.onRequestSnapshot!(request('second'))
    expect(observations.at(-1)).toEqual({ token: 'intent-b', phase: 'started', requestId: 'second', prompt: 'prompt' })
    expect(observations.some((entry) => entry.phase === 'metadata')).toBe(false)
  })
  it('does not claim temporary, other-origin, malformed, or unarmed requests', () => {
    mock.config!.onRequestSnapshot!(request('unarmed'))
    arm('intent-a')
    document.querySelector('chat-window')!.classList.add('is-temporary-chat')
    mock.config!.onRequestSnapshot!(request('temporary'))
    document.querySelector('chat-window')!.classList.remove('is-temporary-chat')
    mock.config!.onRequestSnapshot!({ ...request('other'), url: 'https://other.test/StreamGenerate' })
    mock.config!.onRequestSnapshot!({ ...request('unknown'), body: 'bad' })
    expect(observations).toEqual([{ token: 'intent-a', phase: 'armed' }])
  })
  it('expires stalled requests and ignores their late chunks', () => {
    vi.useFakeTimers()
    arm('intent-a')
    const first = request('first')
    mock.config!.onRequestSnapshot!(first)
    vi.advanceTimersByTime(120_000)
    mock.config!.onProgress!(frame(), first)
    expect(observations.at(-1)?.phase).toBe('finished')
    expect(observations.some((entry) => entry.phase === 'metadata')).toBe(false)
  })
})
