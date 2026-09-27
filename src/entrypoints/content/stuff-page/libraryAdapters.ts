import { startButtonInjector, stopButtonInjector } from './buttonInjector'
import { inspectLibraryPage, type LibraryPage } from './dom'
import { logLibraryTrace } from '@/utils/library/logger'
import { startIslandButtonInjector, stopIslandButtonInjector } from './libraryIsland'

let page: LibraryPage | null = null
let observer: MutationObserver | null = null
let lastResolution = ''

function reconcilePage(): void {
  const { page: nextPage, ...diagnostics } = inspectLibraryPage()
  const resolution = JSON.stringify(diagnostics)
  const unchanged = page?.root === nextPage?.root && page?.kind === nextPage?.kind
  if (unchanged && resolution === lastResolution) return
  lastResolution = resolution
  logLibraryTrace('content:adapter', () => ({ previous: page?.kind ?? 'none', ...diagnostics }))
  if (unchanged) return
  stopButtonInjector()
  stopIslandButtonInjector()
  page = nextPage
  if (page?.kind === 'island') startIslandButtonInjector(page.root)
  else if (page?.kind === 'legacy') startButtonInjector()
}

export function startLibraryAdapters(): void {
  if (observer) return
  logLibraryTrace('content:adapters-start', () => ({}))
  observer = new MutationObserver(reconcilePage)
  observer.observe(document.body, { childList: true, subtree: true })
  reconcilePage()
}

export function stopLibraryAdapters(): void {
  observer?.disconnect()
  observer = null
  stopButtonInjector()
  stopIslandButtonInjector()
  page = null
  lastResolution = ''
}
