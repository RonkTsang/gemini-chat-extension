export type LibraryPage = { kind: 'island' | 'legacy'; root: Element }

export function inspectLibraryPage(): {
  page: LibraryPage | null
  reason: string
  islandPages: number
  islandRoots: number | null
  legacyPages: number | null
} {
  const islands = document.querySelectorAll('library-island-page')
  const result = { page: null as LibraryPage | null, reason: '',
    islandPages: islands.length, islandRoots: null as number | null, legacyPages: null as number | null }
  if (islands.length) {
    if (islands.length !== 1) return { ...result, reason: 'ambiguous-island-page' }
    const roots = islands[0].querySelectorAll('[data-library-island-root]')
    return { ...result, islandRoots: roots.length,
      reason: roots.length === 1 ? 'island' : 'invalid-island-root-count',
      page: roots.length === 1 ? { kind: 'island', root: roots[0] } : null }
  }
  const legacyPages = document.querySelectorAll('library-sections-overview-page')
  return { ...result, legacyPages: legacyPages.length,
    reason: legacyPages.length === 1 ? 'legacy' : legacyPages.length ? 'ambiguous-legacy-page' : 'no-library-page',
    page: legacyPages.length === 1 ? { kind: 'legacy', root: legacyPages[0] } : null }
}

export function resolveLibraryPage(): LibraryPage | null {
  return inspectLibraryPage().page
}

export function findIslandMediaImages(root: Element): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>('img[src]'))
}

export function findInjectedIslandCards(root: Element): Element[] {
  return Array.from(root.querySelectorAll('.gem-ext-library-island-card'))
}

/** The matched image supplies identity; the native preview button supplies placement. */
export function resolveIslandImageHost(image: HTMLImageElement, root: Element): Element | null {
  const host = image.closest('button')?.parentElement
  return host && root.contains(host) ? host : null
}

export function inspectIslandRoot(root: Element): { images: number; jslogIds: string[] } {
  return {
    images: root.querySelectorAll('img').length,
    jslogIds: Array.from(root.querySelectorAll('[jslog]')).slice(0, 6)
      .map((element) => element.getAttribute('jslog')?.split(';')[0] ?? ''),
  }
}
