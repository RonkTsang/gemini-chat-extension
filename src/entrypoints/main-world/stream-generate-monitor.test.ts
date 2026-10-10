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
const observe = (event: Event) => observations.push((event as CustomEvent<StreamGenerateObservation>).detail)
const arm = (token: string) => window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.STREAM_GENERATE_CONTROL, { detail: { action: 'arm', token, accountPath: '' } }))
const request = (requestId: string, conversation: unknown = null): XHRRequestSnapshot => ({
  requestId, method: 'POST', url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
  body: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify([['prompt'], ['en'], conversation])]) }).toString(),
})
const frame = (title?: string) => `${JSON.stringify([['wrb.fr', null, JSON.stringify([null, ['c_abc123'], title ? { '11': [title] } : {}])]])}\n`
beforeEach(() => {
  observations = []
  window.history.replaceState({}, '', '/app')
  document.body.innerHTML = '<chat-window></chat-window>'
  window.addEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, observe)
  stop = startStreamGenerateMonitor()
})
afterEach(() => {
  stop()
  window.removeEventListener(GEM_EXT_EVENTS.STREAM_GENERATE_OBSERVATION, observe)
  vi.useRealTimers()
})
describe('StreamGenerate intent observation', () => {
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
