import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/entrypoints/content/stuff-page/__fixtures__/library-query.json'
import { GEM_EXT_EVENTS } from '@/common/event'
import { LIBRARY_QUERY_PATH } from '@/utils/library/mediaParser'
import { startLibraryMonitor } from './library-monitor'

let stop: (() => void) | undefined
const nativeFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  window.location.href = 'https://gemini.google.com/app'
  vi.stubGlobal('fetch', nativeFetch)
  nativeFetch.mockReset()
})
afterEach(() => {
  stop?.()
  vi.unstubAllGlobals()
})

describe('Library Fetch monitor', () => {
  it('returns the native promise and leaves the response body readable, then replays early data', async () => {
    const text = JSON.stringify(fixture)
    const response = new Response(text)
    const promise = Promise.resolve(response)
    nativeFetch.mockReturnValue(promise)
    stop = startLibraryMonitor()
    expect(window.fetch(LIBRARY_QUERY_PATH)).toBe(promise)
    expect(await (await promise).text()).toBe(text)
    await vi.waitFor(() => expect(response.bodyUsed).toBe(true))
    const listener = vi.fn()
    window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
    await vi.waitFor(() => {
      window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.LIBRARY_MEDIA_REQUEST))
      expect(listener).toHaveBeenCalled()
    })
    const event = listener.mock.calls[0][0] as CustomEvent
    expect(event.detail.items).toHaveLength(2)
    window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
    stop()
    expect(window.fetch).toBe(nativeFetch)
  })

  it('handles Request inputs and successive media responses', async () => {
    nativeFetch.mockImplementation(async () => new Response(JSON.stringify(fixture)))
    const listener = vi.fn()
    window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
    stop = startLibraryMonitor()
    await window.fetch(new Request(`https://gemini.google.com${LIBRARY_QUERY_PATH}`))
    await window.fetch(`${LIBRARY_QUERY_PATH}?query_signature=another`)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
  })

  it('does not consume unrelated queries or dispatch after cleanup', async () => {
    const response = new Response(JSON.stringify(fixture))
    nativeFetch.mockResolvedValue(response)
    const listener = vi.fn()
    window.addEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
    stop = startLibraryMonitor()
    await window.fetch('/unrelated')
    expect(response.bodyUsed).toBe(false)
    const pending = window.fetch(LIBRARY_QUERY_PATH)
    stop()
    await pending
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(GEM_EXT_EVENTS.LIBRARY_MEDIA_DATA, listener)
  })
})
