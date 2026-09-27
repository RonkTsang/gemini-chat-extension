import type { LibraryMediaItem } from './mediaParser'

export interface LibraryMediaMatch {
  item: LibraryMediaItem | null
  reason: 'matched' | 'empty-index' | 'no-url-match' | 'ambiguous'
  candidateCount: number
}

/** Bounded records with optional expiry for startup replay buffers. */
export class LibraryMediaCache {
  private records = new Map<string, { item: LibraryMediaItem; receivedAt: number }>()
  private thumbnails = new Map<string, Set<string>>()

  constructor(private readonly maxItems = 3000, private readonly ttlMs?: number) {}

  addItems(items: LibraryMediaItem[], receivedAt = Date.now()): void {
    this.prune()
    if (this.ttlMs !== undefined && Date.now() - receivedAt >= this.ttlMs) return
    for (const item of items) {
      const key = JSON.stringify([item.conversationId, item.requestId, item.responseId, item.artifactType])
      const previous = this.records.get(key)
      if (previous && previous.receivedAt > receivedAt) continue
      this.remove(key)
      this.records.set(key, { item, receivedAt })
      if (item.thumbnailUrl) {
        const keys = this.thumbnails.get(item.thumbnailUrl) ?? new Set<string>()
        keys.add(key)
        this.thumbnails.set(item.thumbnailUrl, keys)
      }
      while (this.records.size > this.maxItems) {
        const oldestKey = this.records.keys().next().value
        if (oldestKey === undefined) break
        this.remove(oldestKey)
      }
    }
  }

  matchImageSource(src: string): LibraryMediaMatch {
    this.prune()
    let result: LibraryMediaItem | null = null
    let candidateCount = 0
    for (const [thumbnail, keys] of this.thumbnails) {
      if (!src.startsWith(thumbnail)) continue
      const remainder = src.slice(thumbnail.length)
      if (remainder !== '' && !remainder.startsWith('=')) continue
      for (const key of keys) {
        const record = this.records.get(key)
        if (!record) continue
        candidateCount++
        result = record.item
      }
    }
    if (candidateCount === 1) return { item: result, reason: 'matched', candidateCount }
    return { item: null, candidateCount,
      reason: candidateCount > 1 ? 'ambiguous' : this.thumbnails.size ? 'no-url-match' : 'empty-index' }
  }

  findByImageSource(src: string): LibraryMediaItem | null {
    return this.matchImageSource(src).item
  }

  getStats(): { items: number; thumbnails: number } {
    this.prune()
    return { items: this.records.size, thumbnails: this.thumbnails.size }
  }

  getItems(): LibraryMediaItem[] {
    this.prune()
    return Array.from(this.records.values(), ({ item }) => item)
  }

  clear(): void {
    this.records.clear()
    this.thumbnails.clear()
  }

  private prune(): void {
    if (this.ttlMs === undefined) return
    const now = Date.now()
    for (const [key, record] of this.records) {
      if (now - record.receivedAt >= this.ttlMs) this.remove(key)
    }
  }

  private remove(key: string): void {
    const thumbnail = this.records.get(key)?.item.thumbnailUrl
    if (thumbnail) {
      const keys = this.thumbnails.get(thumbnail)
      keys?.delete(key)
      if (!keys?.size) this.thumbnails.delete(thumbnail)
    }
    this.records.delete(key)
  }
}
