import { z } from 'zod'
import { MAX_LIBRARY_RESPONSE_BYTES } from '@/utils/library/mediaParser'
import { logLibraryTrace } from '@/utils/library/logger'
import { findLibraryPreloadScripts } from './library-preload.dom'

const preloadSchema = z.object({
  events: z.array(z.object({ id: z.string(), kind: z.string(), chunk: z.string().optional() })),
})
const expectedPreloadSchema = z.object({ expected: z.array(z.unknown()) })

/** Initial navigation embeds the same GraphQL packets as SPA requests in Relay chunks. */
export function startLibraryPreloadMonitor(onChunk: (text: string) => void): () => void {
  const processed = new WeakSet<HTMLScriptElement>()
  const scriptReasons = new WeakMap<HTMLScriptElement, string>()
  // Relay may split one JSON array across multiple script elements with the same event ID.
  const streams = new Map<string, string | null>()
  let bufferedLength = 0
  let capturedChunks = 0
  let active = true
  const flush = (id: string): void => {
    const text = streams.get(id)
    streams.delete(id)
    if (!text) return
    bufferedLength -= text.length
    onChunk(text)
  }
  const skipped = (script: HTMLScriptElement, reason: string, responseLength: number): void => {
    if (scriptReasons.get(script) === reason) return
    scriptReasons.set(script, reason)
    logLibraryTrace('main:preload-skipped', () => ({ reason, responseLength }))
  }
  const scan = (): void => {
    if (!active) return
    for (const script of findLibraryPreloadScripts()) {
      if (processed.has(script)) continue
      const text = script.textContent ?? ''
      if (!text) {
        scriptReasons.set(script, 'empty-text')
        continue
      }
      if (text.length > MAX_LIBRARY_RESPONSE_BYTES) {
        processed.add(script)
        skipped(script, 'response-too-large', text.length)
        continue
      }
      let envelope: unknown
      try {
        envelope = JSON.parse(text)
      } catch {
        // The HTML parser may not have finished writing this script's text yet.
        skipped(script, 'invalid-json', text.length)
        continue
      }
      const parsed = preloadSchema.safeParse(envelope)
      if (!parsed.success) {
        if (expectedPreloadSchema.safeParse(envelope).success) {
          processed.add(script)
          scriptReasons.set(script, 'expected-metadata')
        } else {
          skipped(script, 'unexpected-envelope', text.length)
        }
        continue
      }
      processed.add(script)
      const chunks = parsed.data.events.filter((event) => event.kind === 'chunk' && event.chunk !== undefined)
      capturedChunks += chunks.length
      scriptReasons.set(script, chunks.length ? 'chunks-found' : 'no-chunks')
      logLibraryTrace('main:preload', () => ({ chunks: chunks.length, responseLength: text.length }))
      for (const event of parsed.data.events) {
        if (event.kind === 'complete') {
          flush(event.id)
          continue
        }
        if (event.kind !== 'chunk' || event.chunk === undefined) continue
        if (!streams.has(event.id) && streams.size >= 32) {
          skipped(script, 'too-many-preload-streams', text.length)
          continue
        }
        const previous = streams.get(event.id)
        if (previous === null) continue
        if (bufferedLength + event.chunk.length > MAX_LIBRARY_RESPONSE_BYTES) {
          bufferedLength -= previous?.length ?? 0
          streams.set(event.id, null)
          skipped(script, 'response-too-large', text.length)
          continue
        }
        streams.set(event.id, (previous ?? '') + event.chunk)
        bufferedLength += event.chunk.length
      }
    }
  }
  const observer = new MutationObserver(scan)
  const finish = (): void => {
    if (!active) return
    scan()
    for (const id of streams.keys()) flush(id)
    observer.disconnect()
    document.removeEventListener('DOMContentLoaded', finish)
    const scripts = findLibraryPreloadScripts()
    logLibraryTrace('main:preload-scan-complete', () => ({
      scripts: scripts.length,
      chunks: capturedChunks,
      reason: !scripts.length ? 'no-preload-scripts' : capturedChunks ? 'chunks-found' : 'no-preload-chunks',
      scriptReasons: scripts.map((script) => scriptReasons.get(script) ?? 'unprocessed'),
    }))
  }
  if (document.readyState === 'loading') {
    observer.observe(document, { childList: true, subtree: true, characterData: true })
    document.addEventListener('DOMContentLoaded', finish)
    scan()
  } else {
    finish()
  }
  return () => {
    active = false
    streams.clear()
    bufferedLength = 0
    observer.disconnect()
    document.removeEventListener('DOMContentLoaded', finish)
  }
}
