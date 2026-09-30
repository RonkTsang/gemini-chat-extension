import { z } from 'zod'
import { MAX_LIBRARY_RESPONSE_BYTES } from '@/utils/library/mediaParser'
import { logLibraryTrace } from '@/utils/library/logger'
import { findLibraryPreloadScripts } from './library-preload.dom'

const preloadSchema = z.object({
  events: z.array(z.object({ kind: z.string(), chunk: z.string().optional() })),
})
const expectedPreloadSchema = z.object({ expected: z.array(z.unknown()) })

/** Initial navigation embeds the same GraphQL packets as SPA requests in Relay chunks. */
export function startLibraryPreloadMonitor(onChunk: (text: string) => void): () => void {
  const processed = new WeakSet<HTMLScriptElement>()
  const scriptReasons = new WeakMap<HTMLScriptElement, string>()
  let capturedChunks = 0
  let active = true
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
      for (const event of chunks) {
        if (event.chunk !== undefined) onChunk(event.chunk)
      }
    }
  }
  const observer = new MutationObserver(scan)
  const finish = (): void => {
    if (!active) return
    scan()
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
    observer.disconnect()
    document.removeEventListener('DOMContentLoaded', finish)
  }
}
