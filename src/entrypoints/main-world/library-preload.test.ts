import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import preload from '@/entrypoints/content/stuff-page/__fixtures__/library-preload.json'
import { MAX_LIBRARY_RESPONSE_BYTES, parseLibraryMediaResponse } from '@/utils/library/mediaParser'
import { startLibraryPreloadMonitor } from './library-preload'
import { logLibraryTrace } from '@/utils/library/logger'

vi.mock('@/utils/library/logger', () => ({ logLibraryTrace: vi.fn() }))

let stop: (() => void) | undefined

function appendScript(text: string, marked = true): HTMLScriptElement {
  const script = document.createElement('script')
  script.type = 'application/json'
  if (marked) script.setAttribute('data-bg3-relay-preload', '')
  script.textContent = text
  document.body.appendChild(script)
  return script
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.mocked(logLibraryTrace).mockClear()
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
})
afterEach(() => {
  stop?.()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Library HTML preload', () => {
  it('reports missing preload scripts only after the initial document scan finishes', () => {
    stop = startLibraryPreloadMonitor(vi.fn())
    expect(logLibraryTrace).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('DOMContentLoaded'))
    const [event, details] = vi.mocked(logLibraryTrace).mock.calls[0]
    expect(event).toBe('main:preload-scan-complete')
    expect(details()).toEqual({ scripts: 0, chunks: 0, reason: 'no-preload-scripts', scriptReasons: [] })
  })

  it('reports rejected envelopes without repeating the same diagnostic on each mutation', async () => {
    appendScript(JSON.stringify({ events: [{ kind: 'chunk', chunk: 42 }] }))
    stop = startLibraryPreloadMonitor(vi.fn())
    document.body.appendChild(document.createElement('div'))
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    document.dispatchEvent(new Event('DOMContentLoaded'))
    const calls = vi.mocked(logLibraryTrace).mock.calls
    expect(calls.filter(([event]) => event === 'main:preload-skipped')).toHaveLength(1)
    expect(calls.find(([event]) => event === 'main:preload-skipped')![1]().reason).toBe('unexpected-envelope')
    expect(calls.find(([event]) => event === 'main:preload-scan-complete')![1]()).toMatchObject({
      scripts: 1, chunks: 0, reason: 'no-preload-chunks', scriptReasons: ['unexpected-envelope'],
    })
  })

  it('reads the captured Relay envelope and ignores expected, complete, and unrelated scripts', () => {
    appendScript(JSON.stringify({ expected: ['overview:0'] }))
    appendScript(JSON.stringify(preload), false)
    appendScript(JSON.stringify(preload))
    const capture = vi.fn()
    stop = startLibraryPreloadMonitor(capture)
    expect(capture).toHaveBeenCalledTimes(1)
    const items = parseLibraryMediaResponse(capture.mock.calls[0][0])!
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.conversationId)).toEqual(['c_abc123', 'c_def456'])
  })

  it('captures a delayed script after incomplete JSON is completed and processes it once', async () => {
    const capture = vi.fn()
    stop = startLibraryPreloadMonitor(capture)
    const script = appendScript('{')
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(capture).not.toHaveBeenCalled()
    script.textContent = JSON.stringify(preload)
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1))
    document.body.appendChild(document.createElement('div'))
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('performs a final scan then disconnects at DOMContentLoaded', async () => {
    const capture = vi.fn()
    stop = startLibraryPreloadMonitor(capture)
    appendScript(JSON.stringify(preload))
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(capture).toHaveBeenCalledTimes(1)
    appendScript(JSON.stringify(preload))
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed and oversized envelopes and stops observing after cleanup', async () => {
    appendScript(JSON.stringify({ events: [{ kind: 'chunk', chunk: 42 }] }))
    appendScript(' '.repeat(MAX_LIBRARY_RESPONSE_BYTES + 1))
    const capture = vi.fn()
    stop = startLibraryPreloadMonitor(capture)
    expect(capture).not.toHaveBeenCalled()
    stop()
    appendScript(JSON.stringify(preload))
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(capture).not.toHaveBeenCalled()
  })

  it('reads existing preload scripts when the document is already ready', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
    appendScript(JSON.stringify(preload))
    const capture = vi.fn()
    stop = startLibraryPreloadMonitor(capture)
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
