import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryMediaCache } from './mediaCache'
import type { LibraryMediaItem } from './mediaParser'

const item: LibraryMediaItem = {
  conversationId: 'c_abc', requestId: 'r_def', responseId: 'rc_1', artifactType: 'image',
  thumbnailUrl: 'https://lh3.googleusercontent.com/gg/resource',
}

afterEach(() => vi.useRealTimers())

describe('Library media index', () => {
  it('matches exact URLs and varying transform suffixes with a prefix boundary', () => {
    const cache = new LibraryMediaCache()
    cache.addItems([item])
    expect(cache.findByImageSource(item.thumbnailUrl!)).toEqual(item)
    expect(cache.findByImageSource(`${item.thumbnailUrl}=w640-h640-other`)).toEqual(item)
    expect(cache.findByImageSource(`${item.thumbnailUrl}Different=w320`)).toBeNull()
  })

  it('rejects ambiguous thumbnails instead of overwriting a candidate', () => {
    const cache = new LibraryMediaCache()
    cache.addItems([item, { ...item, responseId: 'rc_2', requestId: 'r_other' }])
    expect(cache.findByImageSource(item.thumbnailUrl!)).toBeNull()
  })

  it('merges repeated responses and updates an existing record without keeping its old thumbnail', () => {
    const cache = new LibraryMediaCache()
    cache.addItems([item, item])
    const updated = { ...item, thumbnailUrl: `${item.thumbnailUrl}Updated` }
    cache.addItems([updated])
    expect(cache.getItems()).toEqual([updated])
    expect(cache.findByImageSource(item.thumbnailUrl!)).toBeNull()
    expect(cache.findByImageSource(updated.thumbnailUrl)).toEqual(updated)
  })

  it('bounds the index without expiry and does not replace fresh data with late replay', () => {
    vi.useFakeTimers()
    const cache = new LibraryMediaCache(1)
    const now = Date.now()
    cache.addItems([{ ...item, thumbnailUrl: `${item.thumbnailUrl}New` }], now)
    cache.addItems([item], now - 100)
    expect(cache.findByImageSource(item.thumbnailUrl!)).toBeNull()
    const replacement = { ...item, responseId: 'rc_2' }
    cache.addItems([replacement])
    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(cache.getItems()).toEqual([replacement])
    expect(cache.findByImageSource(item.thumbnailUrl!)).toEqual(replacement)
    cache.clear()
    expect(cache.getStats()).toEqual({ items: 0, thumbnails: 0 })
  })

  it('expires startup replay records when a TTL is explicitly configured', () => {
    vi.useFakeTimers()
    const cache = new LibraryMediaCache(500, 60_000)
    cache.addItems([item])
    vi.advanceTimersByTime(60_000)
    expect(cache.getItems()).toEqual([])
    cache.addItems([item], Date.now() - 60_000)
    expect(cache.findByImageSource(item.thumbnailUrl!)).toBeNull()
  })
})
