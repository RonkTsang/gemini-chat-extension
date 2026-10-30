import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEM_EXT_EVENTS } from '@/common/event'
import { startLibraryMonitor } from './library-monitor'

const url = '/u/0/_/BardChatUi/data/batchexecute?source-path=%2Fu%2F0%2Flibrary&rpcids=jGArJ'
const nativeFetch = vi.fn<typeof fetch>()
const listener = vi.fn()
let stop: (() => void) | undefined

function mediaResponse(count = 1): string {
  const items = Array.from({ length: count }, (_, index) => [
    [`c_chat${index}`, `r_request${index}`], [1783531320 + index, 536000000],
    1, null, [null, `https://lh3.googleusercontent.com/gg/image${index}`], `rc_${index}`,
  ])
  const packet = JSON.stringify([['wrb.fr', 'jGArJ', JSON.stringify([items, null]), null, null, null, 'generic']])
  return `)]}'\n\n${packet.length}\n${packet}\n`
}

beforeEach(() => {
  window.location.href = 'https://gemini.google.com/u/0/library'
  vi.stubGlobal('fetch', nativeFetch)
  nativeFetch.mockReset()
  listener.mockReset()
  document.body.innerHTML = ''
})
afterEach(() => {
  stop?.()
  stop = undefined
  window.removeEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, listener)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('legacy Library Fetch capture', () => {
  it('captures account-prefixed POSTs once while preserving the page response and replays to late listeners', async () => {
    const text = mediaResponse()
    const response = new Response(text)
    const promise = Promise.resolve(response)
    nativeFetch.mockReturnValue(promise)
    stop = startLibraryMonitor()
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, listener)

    expect(window.fetch(url, { method: 'POST' })).toBe(promise)
    expect(await (await promise).text()).toBe(text)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(listener.mock.calls[0][0].detail.items[0]).toMatchObject({
      conversationId: 'c_chat0', responseId: 'r_request0', timestamp: 1783531320,
    })
    listener.mockClear()
    window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail.items).toHaveLength(1)
  })

  it('ignores unrelated RPCs, wrong methods and failed responses', async () => {
    const response = new Response(mediaResponse())
    nativeFetch.mockResolvedValue(response)
    stop = startLibraryMonitor()
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, listener)
    await window.fetch(url.replace('jGArJ', 'other'), { method: 'POST' })
    await window.fetch(url)
    expect(response.bodyUsed).toBe(false)
    nativeFetch.mockResolvedValue(new Response(mediaResponse(), { status: 500 }))
    await window.fetch(url, { method: 'POST' })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(listener).not.toHaveBeenCalled()
  })

  it('bounds replay to 500 records and expires them after one minute', async () => {
    nativeFetch.mockResolvedValue(new Response(mediaResponse(501)))
    stop = startLibraryMonitor()
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, listener)
    await window.fetch(url, { method: 'POST' })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    listener.mockClear()
    window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
    expect(listener.mock.calls[0][0].detail.items).toHaveLength(500)
    expect(listener.mock.calls[0][0].detail.items[0].conversationId).toBe('c_chat1')
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 60_001)
    listener.mockClear()
    window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not dispatch an in-flight response or replay after cleanup', async () => {
    nativeFetch.mockResolvedValue(new Response(mediaResponse()))
    stop = startLibraryMonitor()
    window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, listener)
    const pending = window.fetch(url, { method: 'POST' })
    stop()
    await pending
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    window.dispatchEvent(new Event(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
    expect(listener).not.toHaveBeenCalled()
    expect(window.fetch).toBe(nativeFetch)
  })
})
