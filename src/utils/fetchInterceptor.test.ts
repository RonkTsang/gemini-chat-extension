import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FetchInterceptor } from './fetchInterceptor'

const nativeFetch = vi.fn<typeof fetch>()
let interceptor: FetchInterceptor
let unsubscribe: Array<() => void>

beforeEach(() => {
  window.location.href = 'https://example.com/page'
  nativeFetch.mockReset()
  vi.stubGlobal('fetch', nativeFetch)
  interceptor = new FetchInterceptor()
  unsubscribe = []
})
afterEach(() => {
  unsubscribe.forEach((stop) => stop())
  vi.unstubAllGlobals()
})

describe('Fetch interceptor transport and lifecycle', () => {
  it('shares one patch and restores Fetch only after the last subscription ends', () => {
    const first = interceptor.intercept({ matches: () => true, onResponse: vi.fn() })
    const wrapper = window.fetch
    const second = interceptor.intercept({ matches: () => true, onResponse: vi.fn() })
    unsubscribe.push(first, second)
    expect(window.fetch).toBe(wrapper)
    first()
    expect(interceptor.count).toBe(1)
    expect(window.fetch).toBe(wrapper)
    second()
    expect(interceptor.count).toBe(0)
    expect(window.fetch).toBe(nativeFetch)
  })

  it('preserves native arguments, receiver, promise and response; subscribers read independent clones', async () => {
    const response = new Response('native body')
    const promise = Promise.resolve(response)
    nativeFetch.mockReturnValue(promise)
    const bodies: string[] = []
    const matches = vi.fn(() => true)
    for (let i = 0; i < 2; i++) {
      unsubscribe.push(interceptor.intercept({
        matches,
        onResponse: async (clone) => { bodies.push(await clone.text()) },
      }))
    }
    const input = new Request('https://example.com/api')
    const init = { method: 'post', body: 'payload', signal: new AbortController().signal }
    expect(window.fetch.call(window, input, init)).toBe(promise)
    expect(nativeFetch).toHaveBeenCalledWith(input, init)
    expect(nativeFetch.mock.contexts[0]).toBe(window)
    expect(matches).toHaveBeenCalledWith({ url: 'https://example.com/api', method: 'POST' })
    expect(await promise).toBe(response)
    expect(await response.text()).toBe('native body')
    await vi.waitFor(() => expect(bodies).toEqual(['native body', 'native body']))
  })

  it('does not clone unmatched responses and resolves relative and URL inputs', async () => {
    const response = new Response('unobserved')
    const clone = vi.spyOn(response, 'clone')
    nativeFetch.mockResolvedValue(response)
    const matches = vi.fn(() => false)
    const onResponse = vi.fn()
    unsubscribe.push(interceptor.intercept({ matches, onResponse }))
    await window.fetch('/relative')
    await window.fetch(new URL('https://example.com/absolute'))
    expect(matches.mock.calls).toEqual([
      [{ url: 'https://example.com/relative', method: 'GET' }],
      [{ url: 'https://example.com/absolute', method: 'GET' }],
    ])
    expect(clone).not.toHaveBeenCalled()
    expect(onResponse).not.toHaveBeenCalled()
  })

  it('isolates throwing matchers and asynchronous observers from other subscribers and native Fetch', async () => {
    nativeFetch.mockResolvedValue(new Response('ok', { status: 404 }))
    const matcherError = new Error('matcher')
    const observerError = new Error('observer')
    const onError = vi.fn()
    const onResponse = vi.fn()
    unsubscribe.push(interceptor.intercept({
      matches: () => { throw matcherError }, onResponse, onError,
    }))
    unsubscribe.push(interceptor.intercept({
      matches: () => true, onResponse: async () => { throw observerError }, onError,
    }))
    unsubscribe.push(interceptor.intercept({ matches: () => true, onResponse }))
    expect((await window.fetch('/api')).status).toBe(404)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))
    expect(onError).toHaveBeenCalledWith(matcherError)
    expect(onError).toHaveBeenCalledWith(observerError)
    expect(onResponse).toHaveBeenCalledOnce()
  })

  it('preserves native rejection and notifies only matched subscriptions', async () => {
    const error = new Error('network failure')
    const promise = Promise.reject(error)
    nativeFetch.mockReturnValue(promise)
    const onError = vi.fn()
    const ignored = vi.fn()
    unsubscribe.push(interceptor.intercept({ matches: () => true, onResponse: vi.fn(), onError }))
    unsubscribe.push(interceptor.intercept({ matches: () => false, onResponse: vi.fn(), onError: ignored }))
    const result = window.fetch('/api')
    expect(result).toBe(promise)
    await expect(result).rejects.toBe(error)
    expect(onError).toHaveBeenCalledWith(error)
    expect(ignored).not.toHaveBeenCalled()
  })

  it('does not deliver an in-flight response to an unsubscribed or newly subscribed consumer', async () => {
    let resolve!: (response: Response) => void
    nativeFetch.mockReturnValue(new Promise<Response>((done) => { resolve = done }))
    const oldObserver = vi.fn()
    const newObserver = vi.fn()
    const stop = interceptor.intercept({ matches: () => true, onResponse: oldObserver })
    unsubscribe.push(stop)
    const pending = window.fetch('/api')
    stop()
    unsubscribe.push(interceptor.intercept({ matches: () => true, onResponse: newObserver }))
    resolve(new Response('done'))
    await pending
    expect(oldObserver).not.toHaveBeenCalled()
    expect(newObserver).not.toHaveBeenCalled()
  })

  it('preserves a later external wrapper and keeps an old patch inert after resubscribing', async () => {
    nativeFetch.mockImplementation(async () => new Response('ok'))
    const stop = interceptor.intercept({ matches: () => true, onResponse: vi.fn() })
    unsubscribe.push(stop)
    const oldPatch = window.fetch
    const externalWrapper: typeof fetch = (input, init) => oldPatch(input, init)
    window.fetch = externalWrapper
    stop()
    expect(window.fetch).toBe(externalWrapper)
    const observer = vi.fn()
    const nextStop = interceptor.intercept({ matches: () => true, onResponse: observer })
    unsubscribe.push(nextStop)
    await window.fetch('/api')
    expect(observer).toHaveBeenCalledOnce()
    nextStop()
    expect(window.fetch).toBe(externalWrapper)
  })
})
